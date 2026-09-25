import type { Db } from "pqb"

/**
 * Scenario modules keyed by file path, such as the result of `import.meta.glob`.
 *
 * A value is a module or a function that imports it.
 * The module exports a scenario or an array of scenarios by default.
 * The file name starts with the name of the migration file the scenarios belong to, without extension, followed by a dot.
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

/** Scenarios exported by one scenario file. */
export interface MigrationScenarioFile {
  file: string
  scenarios: MigrationScenario[]
}

/**
 * Imports scenario modules and validates their default exports, in file path order.
 *
 * Throws before any scenario runs if a file exports no scenarios.
 */
export async function importMigrationScenarios(
  modules: MigrationScenarioModules,
): Promise<MigrationScenarioFile[]> {
  const files: MigrationScenarioFile[] = []
  for (const file of Object.keys(modules).sort()) {
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
    }
    files.push({ file, scenarios })
  }
  return files
}

/** Tells whether the scenario file belongs to the migration at the given rake-db path or key. */
export function isScenarioFileOf(file: string, migrationPath: string): boolean {
  // The dot after the name keeps "0001_user" from claiming "0001_user_role.scenario.ts".
  return getFileName(file).startsWith(`${getMigrationName(migrationPath)}.`)
}

function isScenario(value: unknown): value is MigrationScenario {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MigrationScenario).name === "string" &&
    typeof (value as MigrationScenario).setup === "function"
  )
}

/** Returns the migration file name without directories and extension. */
export function getMigrationName(path: string): string {
  return getFileName(path).replace(/\.[cm]?[jt]s$/, "")
}

function getFileName(path: string) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1)
}
