import { type Db, testTransaction } from "pqb"
import {
  type MigrateConfig,
  type MigrateFn,
  migrate,
  rakeDbConfigDefaults,
  rollback,
} from "rake-db"

import {
  bindMigrationScenarios,
  type BoundMigrationScenario,
  type MigrationModules,
  type MigrationScenarioContext,
  type MigrationScenarioModules,
} from "./migration-scenario"

export interface VerifyMigrationsOptions {
  db: Db
  /** Migrator configuration of the project; `migrations` and `migrationsTable` are taken from it. */
  config: MigrateConfig & { migrations: MigrationModules }
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
 * 1. `up` on the clean schema.
 * 2. In a nested savepoint: `down`, the migration's scenarios, and `up` again,
 *    after which the migrations table must hold exactly as many versions as migrations passed so far.
 * 3. The savepoint is rolled back, keeping the clean schema for the next migration.
 *
 * Everything runs inside a test transaction that is rolled back at the end,
 * nested into the caller's test transaction when there is one.
 */
export async function verifyMigrations({
  db,
  config,
  scenarios: scenarioModules = {},
  searchPath = (schema) => schema,
}: VerifyMigrationsOptions): Promise<void> {
  const { migrations } = config
  const migrationsTable = config.migrationsTable ?? rakeDbConfigDefaults.migrationsTable
  if (migrationsTable.includes(".")) {
    throw new Error(
      `migrationsTable "${migrationsTable}" must not include a schema: it is placed in the temporary schema.`,
    )
  }

  const scenarios = await bindMigrationScenarios(scenarioModules, migrations)

  const schema = `test_migrations_${crypto.randomUUID().replaceAll("-", "")}`
  const context: MigrationScenarioContext = {
    db,
    schema,
    schemaRef: (table) => db.ref(`${schema}.${table}`),
  }
  const migrateConfig: MigrateConfig = {
    ...config,
    migrationsTable: `${schema}.${migrationsTable}`,
    transactionSearchPath: searchPath(schema),
  }
  const up = () => runOneMigration(migrate, db, migrateConfig)
  const down = () => runOneMigration(rollback, db, migrateConfig)

  await withRollback(db, async () => {
    for (const [index, migration] of Object.keys(migrations).entries()) {
      const failedAt = (step: string) => () => `Migration "${migration}" failed at "${step}".`

      await withErrorContext(up, failedAt("up on clean schema"))

      await withRollback(db, async () => {
        await withErrorContext(down, failedAt("down on clean schema"))

        for (const bound of scenarios) {
          if (bound.migration === migration) {
            await withRollback(db, () => runScenario(bound, context, up, down))
          }
        }

        await withErrorContext(up, failedAt("re-up on clean schema"))

        const appliedCount = await db.query.get<number>`
          SELECT count(*)::int FROM ${db.ref(`${schema}.${migrationsTable}`)}
        `
        if (appliedCount !== index + 1) {
          throw new Error(
            `Migration "${migration}" left ${appliedCount} applied versions after re-up on clean schema, expected ${index + 1}.`,
          )
        }
      })
    }
  })
}

async function runScenario(
  { migration, scenario }: BoundMigrationScenario,
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

/** Runs `fn` in a nested test transaction and always rolls its changes back. */
async function withRollback<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await testTransaction.start(db)
  try {
    return await fn()
  } finally {
    await testTransaction.rollback(db)
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
