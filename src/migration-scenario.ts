import type { Db } from "pqb"
import type { MigrateConfig } from "rake-db"

/** Migration loaders keyed by migration name, as accepted by the `migrations` option of rake-db. */
export type MigrationModules = Extract<MigrateConfig, { migrations: unknown }>["migrations"]

/**
 * Scenario modules keyed by file path, such as the result of `import.meta.glob`.
 *
 * A value is a module or a function that imports it.
 * The module exports a scenario or an array of scenarios by default.
 * The file name starts with the key of the migration the scenarios belong to, followed by a dot.
 */
export type MigrationScenarioModules = Readonly<Record<string, unknown>>

/** Arguments passed to every scenario callback. */
export interface MigrationScenarioContext {
  db: Db
  /** Temporary schema the history is verified on. */
  schema: string
  /** Reference to a table in the temporary schema for SQL templates: db.query`... ${schemaRef("user")} ...`. */
  schemaRef: (table: string) => ReturnType<Db["ref"]>
}

interface MigrationScenarioOptionsBase {
  /** Prepares data on the schema rolled back to the state before the migration. */
  setup: (context: MigrationScenarioContext) => unknown
}

/** Options of a scenario checking how a migration transforms existing data. */
export interface MigrationDataScenarioOptions extends MigrationScenarioOptionsBase {
  /** Checks data after `up`. */
  assertUp?: (context: MigrationScenarioContext) => unknown
  /** Checks data after `down` that follows `up`. */
  assertDown?: (context: MigrationScenarioContext) => unknown
  assertUpError?: never
}

/** Options of a scenario in which the migration must refuse to apply to the prepared data. */
export interface MigrationFailureScenarioOptions extends MigrationScenarioOptionsBase {
  /** Checks the error thrown by `up`. */
  assertUpError: (error: unknown, context: MigrationScenarioContext) => unknown
  assertUp?: never
  assertDown?: never
}

export type MigrationScenarioOptions =
  | MigrationDataScenarioOptions
  | MigrationFailureScenarioOptions

export type MigrationScenario = MigrationScenarioOptions & { name: string }

/**
 * Declares a data scenario of the migration named by the scenario file.
 *
 * Throws if the options combine `assertUpError` with `assertUp` or `assertDown`.
 */
export function scenario(name: string, options: MigrationScenarioOptions): MigrationScenario {
  const declared = { ...options, name }
  validateScenario(declared)
  return declared
}

/**
 * Throws if the scenario mixes failure and data assertions.
 *
 * Types already forbid it; the runtime check covers JavaScript callers and type casts.
 */
function validateScenario(scenario: MigrationScenario) {
  const { name } = scenario
  if (scenario.assertUpError && (scenario.assertUp || scenario.assertDown)) {
    throw new Error(`Scenario "${name}" cannot combine assertUpError with assertUp or assertDown.`)
  }
}

/** Scenario bound to the key of its migration. */
export interface BoundMigrationScenario {
  migration: string
  scenario: MigrationScenario
}

/**
 * Imports scenario modules and binds their scenarios to migrations by file name, in file path order.
 *
 * Throws before any scenario runs if a file matches no migration or exports no scenarios.
 */
export async function bindMigrationScenarios(
  modules: MigrationScenarioModules,
  migrations: MigrationModules,
): Promise<BoundMigrationScenario[]> {
  const migrationIds = Object.keys(migrations).map((migration) => ({
    migration,
    id: getMigrationId(migration),
  }))

  const bound: BoundMigrationScenario[] = []
  for (const file of Object.keys(modules).sort()) {
    const fileName = getFileName(file)
    // The dot after the key keeps "0001_user" from claiming "0001_user_role.scenario.ts".
    const match = migrationIds.find(({ id }) => fileName.startsWith(`${id}.`))
    if (!match) {
      throw new Error(
        `Scenario file ${file} matches no migration: its name must start with a migration key followed by a dot.`,
      )
    }

    const value = modules[file]
    const module = typeof value === "function" ? await value() : value
    const exported: unknown = (module as { default?: unknown } | undefined)?.default
    const scenarios = Array.isArray(exported) ? exported : [exported]
    if (!exported || !scenarios.every(isScenario)) {
      throw new Error(
        `Scenario file ${file} must export a scenario or an array of scenarios by default.`,
      )
    }

    for (const scenario of scenarios) {
      validateScenario(scenario)
      bound.push({ migration: match.migration, scenario })
    }
  }
  return bound
}

function isScenario(value: unknown): value is MigrationScenario {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MigrationScenario).name === "string" &&
    typeof (value as MigrationScenario).setup === "function"
  )
}

/** Returns the migration file name without directories and extension, as rake-db derives it from the key. */
function getMigrationId(key: string) {
  return getFileName(key).replace(/\.[cm]?[jt]s$/, "")
}

function getFileName(path: string) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1)
}
