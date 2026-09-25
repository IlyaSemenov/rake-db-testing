import type { Db } from "pqb"
import type { MigrateConfig, MigrateFn } from "rake-db"

import {
  getMigrationName,
  importMigrationScenarios,
  isScenarioFileOf,
  type MigrationScenario,
  type MigrationScenarioContext,
  type MigrationScenarioModules,
} from "./migration-scenario"

/**
 * Modules of the migrations verified in this process by migration key, per rake-db copy.
 *
 * rake-db caches loaded migrations by key for the whole process (https://github.com/romeerez/orchid-orm/issues/764),
 * so a migration of another set under a verified key would silently run the verified one.
 */
const verifiedModules = new WeakMap<MigrateFn, Map<string, unknown>>()

type MigrationItem = Parameters<
  NonNullable<MigrateConfig["beforeMigrate"]>
>[0]["migrations"][number]

/**
 * The rake-db module that the migrations import `change` from, such as `orchid-orm/migrations` or `rake-db`.
 *
 * rake-db collects `change()` calls in module state, so migrations run by another rake-db copy silently do nothing
 * (https://github.com/romeerez/orchid-orm/issues/765).
 */
export interface Migrator {
  migrate: MigrateFn
  rollback: MigrateFn
  rakeDbConfigDefaults: { migrationsTable: string }
}

export interface VerifyMigrationsOptions {
  db: Db
  migrator: Migrator
  /** Migrator configuration of the project. */
  config: MigrateConfig
  /** Scenario modules keyed by file path; the file name binds scenarios to their migration. */
  scenarios?: MigrationScenarioModules
  /** Migration search_path for the temporary schema; defaults to the schema itself. */
  searchPath?: (schema: string) => string
}

/**
 * Applies the whole migration history to a temporary schema and checks every migration and its data scenarios.
 *
 * For each migration in order:
 *
 * 1. `up` on the clean schema must record exactly the version of this migration.
 * 2. In a nested savepoint: `down` must remove that version, the migration's scenarios run,
 *    and `up` again must record the same version.
 * 3. The savepoint is rolled back, keeping the clean schema for the next migration.
 *
 * Everything runs inside a transaction that is rolled back at the end,
 * nested into the caller's transaction when there is one.
 *
 * Throws before running migrations if a migration key was verified earlier in this process with another module,
 * if rake-db finds no migrations, and, after a successful run, if a scenario file matches no migration.
 */
export async function verifyMigrations({
  db,
  migrator: { migrate, rollback, rakeDbConfigDefaults },
  config,
  scenarios: scenarioModules = {},
  searchPath = (schema) => schema,
}: VerifyMigrationsOptions): Promise<void> {
  const migrationsTable = config.migrationsTable ?? rakeDbConfigDefaults.migrationsTable
  if (migrationsTable.includes(".")) {
    throw new Error(
      `migrationsTable "${migrationsTable}" must not include a schema: it is placed in the temporary schema.`,
    )
  }

  const loaders = "migrations" in config ? config.migrations : {}
  let verified = verifiedModules.get(migrate)
  if (!verified) {
    verified = new Map()
    verifiedModules.set(migrate, verified)
  }
  await checkMigrationKeys(verified, loaders)

  const scenarioFiles = await importMigrationScenarios(scenarioModules)

  const schema = `test_migrations_${crypto.randomUUID().replaceAll("-", "")}`
  const context: MigrationScenarioContext = {
    db,
    schema,
    schemaRef: (table) => db.ref(`${schema}.${table}`),
  }

  // rake-db passes the whole ordered history to beforeMigrate before applying anything,
  // so the pending migration is known even when its up fails.
  let history: MigrationItem[] | undefined
  const migrateConfig: MigrateConfig = {
    ...config,
    migrationsTable: `${schema}.${migrationsTable}`,
    transactionSearchPath: searchPath(schema),
    async beforeMigrate(arg) {
      history ??= arg.migrations
      await config.beforeMigrate?.(arg)
    },
  }
  const up = () => runOneMigration(migrate, db, migrateConfig)
  const down = () => runOneMigration(rollback, db, migrateConfig)
  const getAppliedVersions = async () => {
    const versions = await db.query.pluck<string>`
      SELECT version FROM ${db.ref(`${schema}.${migrationsTable}`)}
    `
    return versions.sort()
  }

  await withRollback(db, async () => {
    let applied: string[] = []
    const getPending = () => history?.find(({ version }) => !applied.includes(version))

    for (;;) {
      await withErrorContext(up, () => {
        const pending = getPending()
        return pending
          ? `Migration "${getMigrationName(pending.path)}" failed at "up on clean schema".`
          : `Migrations failed to load.`
      })
      if (!history?.length) {
        throw new Error("Found no migrations to verify.")
      }

      const migration = getPending()
      if (!migration) {
        break
      }

      const name = getMigrationName(migration.path)
      const failedAt = (step: string) => () => `Migration "${name}" failed at "${step}".`
      const migrated = [...applied, migration.version].sort()
      const expectVersions = async (step: string, expected: string[]) => {
        const actual = await getAppliedVersions()
        if (actual.join() !== expected.join()) {
          throw new Error(
            `Migration "${name}" left applied versions [${actual.join(", ")}] after "${step}", expected [${expected.join(", ")}].`,
          )
        }
      }

      await expectVersions("up on clean schema", migrated)

      await withRollback(db, async () => {
        await withErrorContext(down, failedAt("down on clean schema"))
        await expectVersions("down on clean schema", applied)

        for (const { file, scenarios } of scenarioFiles) {
          if (isScenarioFileOf(file, migration.path)) {
            for (const scenario of scenarios) {
              await withRollback(db, () => runScenario(name, scenario, context, up, down))
            }
          }
        }

        await withErrorContext(up, failedAt("re-up on clean schema"))
        await expectVersions("re-up on clean schema", migrated)
      })

      applied = migrated
    }
  })

  // rake-db has loaded every migration by now, so the loaders return cached modules without evaluating them again.
  for (const [key, load] of Object.entries(loaders)) {
    verified.set(key, await load())
  }

  const unbound = scenarioFiles.find(
    ({ file }) => !history?.some(({ path }) => isScenarioFileOf(file, path)),
  )
  if (unbound) {
    throw new Error(
      `Scenario file ${unbound.file} matches no migration: its name must start with a migration name followed by a dot.`,
    )
  }
}

/** Throws if a migration key was verified earlier with another module. */
async function checkMigrationKeys(
  verified: Map<string, unknown>,
  loaders: Record<string, () => Promise<unknown>>,
) {
  for (const [key, load] of Object.entries(loaders)) {
    // Only verified keys are loaded here: loading a new migration before rake-db would evaluate its change() calls too early.
    if (verified.has(key) && (await load()) !== verified.get(key)) {
      throw new Error(
        `Migration key "${key}" was verified earlier in this process with another module: rake-db caches migrations by key, so give migrations of different sets distinct keys.`,
      )
    }
  }
}

async function runScenario(
  migration: string,
  scenario: MigrationScenario,
  context: MigrationScenarioContext,
  up: () => Promise<void>,
  down: () => Promise<void>,
) {
  let step = "setup"
  await withErrorContext(
    async () => {
      await scenario.setup(context)
      step = "up"
      if (scenario.assertUpError) {
        const result = await up().then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        )
        if (result.ok) {
          throw new Error("Expected up to fail, but it succeeded.")
        }
        step = "assertUpError"
        await scenario.assertUpError(result.error, context)
        return
      }

      await up()
      step = "assertUp"
      await scenario.assertUp?.(context)
      step = "down"
      await down()
      step = "assertDown"
      await scenario.assertDown?.(context)
      step = "re-up"
      await up()
    },
    () => `Scenario "${scenario.name}" of migration "${migration}" failed at "${step}".`,
  )
}

/** Applies or rolls back one migration and restores the caller's search_path. */
async function runOneMigration(fn: MigrateFn, db: Db, config: MigrateConfig) {
  const searchPath = await db.query.get<string>`SHOW search_path`
  await fn(db, config, { count: 1 })
  // The migrator sets transactionSearchPath inside the shared transaction, and not every supported pqb version resets it afterwards.
  // Restore the previous value so that further queries resolve names as before the verification.
  await db.query`SELECT set_config('search_path', ${searchPath}, true)`
}

/** Thrown by `withRollback` to roll back a transaction whose callback succeeded. */
const rollback = Symbol("rollback")

/**
 * Runs `fn` in a transaction, or in a savepoint when a transaction is already open, and always rolls its changes back.
 *
 * pqb resolves the transaction from the async context, so queries through `db` join it only when made within `fn`.
 */
async function withRollback(db: Db, fn: () => Promise<void>) {
  try {
    await db.transaction(async () => {
      await fn()
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) {
      throw error
    }
  }
}

/** Runs `fn` and wraps its error into an error with a computed message, keeping the original error in `cause`. */
async function withErrorContext<T>(fn: () => Promise<T>, message: () => string): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw new Error(message(), { cause: error })
  }
}
