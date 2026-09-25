import { validMigrations } from "."
import { createMigrationScenarioFactory } from "../../../src/migration-scenario"

export const defineValidScenario = createMigrationScenarioFactory(validMigrations)
