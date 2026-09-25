import type { Db } from "pqb"
import type { MigrateConfig } from "rake-db"

/** Migration loaders keyed by migration name, as accepted by the `migrations` option of rake-db. */
export type MigrationModules = Extract<MigrateConfig, { migrations: unknown }>["migrations"]

/** Arguments passed to every scenario callback. */
export interface MigrationScenarioContext {
  db: Db
  /** Temporary schema the history is verified on. */
  schema: string
  /** Reference to a table in the temporary schema for SQL templates: db.query`... ${schemaRef("user")} ...`. */
  schemaRef: (table: string) => ReturnType<Db["ref"]>
}

interface MigrationScenarioBase<TMigrations extends MigrationModules> {
  name: string
  /** Key of the migration in the `migrations` object. */
  migration: Extract<keyof TMigrations, string>
  /** Prepares data on the schema rolled back to the state before the migration. */
  setup: (context: MigrationScenarioContext) => unknown
}

/** Scenario checking how a migration transforms existing data. */
export interface MigrationDataScenario<
  TMigrations extends MigrationModules,
> extends MigrationScenarioBase<TMigrations> {
  /** Checks data after `up`. */
  assertUp?: (context: MigrationScenarioContext) => unknown
  /** Checks data after `down` that follows `up`. */
  assertDown?: (context: MigrationScenarioContext) => unknown
  assertUpError?: never
}

/** Scenario in which the migration must refuse to apply to the prepared data. */
export interface MigrationFailureScenario<
  TMigrations extends MigrationModules,
> extends MigrationScenarioBase<TMigrations> {
  /** Checks the error thrown by `up`. */
  assertUpError: (error: unknown, context: MigrationScenarioContext) => unknown
  assertUp?: never
  assertDown?: never
}

export type MigrationScenario<TMigrations extends MigrationModules> =
  | MigrationDataScenario<TMigrations>
  | MigrationFailureScenario<TMigrations>

/** Declares one scenario or an array of scenarios, checking their migration keys. */
export interface MigrationScenarioDefiner<TMigrations extends MigrationModules> {
  (scenario: MigrationScenario<TMigrations>): MigrationScenario<TMigrations>
  (scenarios: MigrationScenario<TMigrations>[]): MigrationScenario<TMigrations>[]
}

/**
 * Returns a function that declares scenarios typed by the keys of `migrations`.
 *
 * The returned function throws if a scenario references a migration missing from `migrations`
 * or combines `assertUpError` with `assertUp` or `assertDown`.
 */
export function createMigrationScenarioFactory<TMigrations extends MigrationModules>(
  migrations: TMigrations,
): MigrationScenarioDefiner<TMigrations> {
  return ((scenarios: MigrationScenario<TMigrations> | MigrationScenario<TMigrations>[]) => {
    for (const scenario of Array.isArray(scenarios) ? scenarios : [scenarios]) {
      validateScenario(scenario, migrations)
    }
    return scenarios
  }) as MigrationScenarioDefiner<TMigrations>
}

/**
 * Throws if the scenario references a missing migration or mixes failure and data assertions.
 *
 * Types already forbid both cases; the runtime check covers JavaScript callers and type casts.
 */
export function validateScenario(
  scenario: MigrationScenario<MigrationModules>,
  migrations: MigrationModules,
) {
  const { name, migration } = scenario
  if (!Object.hasOwn(migrations, migration)) {
    throw new Error(`Scenario "${name}" references missing migration "${migration}".`)
  }
  if (scenario.assertUpError && (scenario.assertUp || scenario.assertDown)) {
    throw new Error(`Scenario "${name}" cannot combine assertUpError with assertUp or assertDown.`)
  }
}
