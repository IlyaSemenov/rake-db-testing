import { createMigrationScenarioFactory, type MigrationScenario } from "rake-db-testing"

import { validMigrations } from "#testing"

type Scenario = MigrationScenario<typeof validMigrations>

const define = createMigrationScenarioFactory(validMigrations)

define({ name: "data", migration: "0001_valid_user", setup() {}, assertUp() {}, assertDown() {} })
define([{ name: "failure", migration: "0001_valid_user", setup() {}, assertUpError() {} }])

// @ts-expect-error assertUp is not allowed together with assertUpError
export const mixed: Scenario = {
  name: "mixed",
  migration: "0001_valid_user",
  setup() {},
  assertUp() {},
  assertUpError() {},
}

export const unknownMigration: Scenario = {
  name: "unknown migration",
  // @ts-expect-error the migration key is not in the migrations object
  migration: "0099_missing",
  setup() {},
}

export const misspelled: Scenario = {
  name: "misspelled callback",
  migration: "0001_valid_user",
  setup() {},
  // @ts-expect-error unknown scenario properties are rejected
  asertUp() {},
}

// @ts-expect-error define rejects invalid scenarios
define([unknownMigration, { name: "x", migration: "0099_missing", setup() {} }])
