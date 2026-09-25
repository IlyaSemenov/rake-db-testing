import { describe, expect, it } from "bun:test"

import { testingDir } from "#testing"

import { loadMigrationScenarios } from "./fs"

async function loadNames(pattern: string) {
  const scenarios = await loadMigrationScenarios(testingDir, pattern)
  return scenarios.map((scenario) => scenario.name)
}

describe("loadMigrationScenarios", () => {
  const validNames = [
    "capitalizes lowercase names",
    "adds a case-insensitive unique index",
    "refuses to apply when usernames differ only by case",
  ]

  it("loads single and array default exports in path order", async () => {
    expect(await loadNames("migrations/valid/*.scenario.ts")).toEqual(validNames)
  })

  it("accepts a pattern starting with ./", async () => {
    expect(await loadNames("./migrations/valid/*.scenario.ts")).toEqual(validNames)
  })

  it("matches nested directories", async () => {
    expect(await loadNames("migrations/**/0002_*.scenario.ts")).toEqual([
      "capitalizes lowercase names",
    ])
  })

  it("rejects a file without a default export", async () => {
    expect(loadNames("scenarios-without-default/*.scenario.ts")).rejects.toThrow(
      "Scenario file scenarios-without-default/0001.scenario.ts must export a scenario or an array of scenarios by default.",
    )
  })
})
