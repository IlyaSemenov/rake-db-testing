import { describe, expect, it } from "bun:test"

import { createMigrationScenarioFactory, type MigrationScenario } from "./migration-scenario"

describe("createMigrationScenarioFactory", () => {
  const migrations = { "0001_user": async () => ({}), "0002_post": async () => ({}) }
  const define = createMigrationScenarioFactory(migrations)
  type Scenario = MigrationScenario<typeof migrations>

  it("returns declared scenarios", () => {
    const scenario: Scenario = { name: "single", migration: "0001_user", setup() {} }
    expect(define(scenario)).toBe(scenario)
    const scenarios: Scenario[] = [scenario, { ...scenario, migration: "0002_post" }]
    expect(define(scenarios)).toBe(scenarios)
  })

  it("rejects a missing migration", () => {
    const scenario = { name: "missing", migration: "0099_missing", setup() {} }
    expect(() => define([scenario as unknown as Scenario])).toThrow(
      `Scenario "missing" references missing migration "0099_missing".`,
    )
  })

  it("rejects assertUpError combined with assertDown", () => {
    const scenario = {
      name: "mixed",
      migration: "0001_user",
      setup() {},
      assertDown() {},
      assertUpError() {},
    }
    expect(() => define(scenario as unknown as Scenario)).toThrow(
      `Scenario "mixed" cannot combine assertUpError with assertUp or assertDown.`,
    )
  })
})
