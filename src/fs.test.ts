import { describe, expect, it } from "bun:test"

import { testingDir } from "#testing"

import { loadMigrationScenarios } from "./fs"

const validFiles = [
  "migrations/valid/0002_valid_name_title_case.scenario.ts",
  "migrations/valid/0003_valid_username_unique_ci.scenario.ts",
]

describe("loadMigrationScenarios", () => {
  it("returns importers keyed by file path", async () => {
    const modules = await loadMigrationScenarios(testingDir, "migrations/valid/*.scenario.ts")
    expect(Object.keys(modules).sort()).toEqual(validFiles)
    const module = await (modules[validFiles[0]!] as () => Promise<{ default: { name: string } }>)()
    expect(module.default.name).toBe("capitalizes lowercase names")
  })

  it("accepts a pattern starting with ./", async () => {
    const modules = await loadMigrationScenarios(testingDir, "./migrations/valid/*.scenario.ts")
    expect(Object.keys(modules).sort()).toEqual(validFiles)
  })

  it("matches nested directories", async () => {
    const modules = await loadMigrationScenarios(testingDir, "**/0002_*.scenario.ts")
    expect(Object.keys(modules)).toEqual([validFiles[0]!])
  })
})
