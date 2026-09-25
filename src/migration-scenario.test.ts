import { describe, expect, it } from "bun:test"

import {
  importMigrationScenarios,
  isScenarioFileOf,
  type MigrationScenario,
  scenario,
} from "./migration-scenario"

const setup = () => {}

describe("scenario", () => {
  it("returns the named scenario", () => {
    expect(scenario("inserts rows", { setup })).toEqual({ name: "inserts rows", setup })
  })

  it("rejects assertUpError combined with assertDown", () => {
    const options = { setup, assertDown() {}, assertUpError() {} }
    expect(() => scenario("mixed", options as never)).toThrow(
      `Scenario "mixed" cannot combine assertUpError with assertUp or assertDown.`,
    )
  })
})

describe("importMigrationScenarios", () => {
  const load = async (modules: Record<string, unknown>) => {
    const files = await importMigrationScenarios(modules)
    return files.map(({ file, scenarios }) => [file, scenarios.map(({ name }) => name)])
  }

  it("imports scenarios in file path order", async () => {
    expect(
      await load({
        "./0002_user_role.scenario.ts": { default: scenario("role", { setup }) },
        "./0001_user.scenario.ts": {
          default: [scenario("user 1", { setup }), scenario("user 2", { setup })],
        },
      }),
    ).toEqual([
      ["./0001_user.scenario.ts", ["user 1", "user 2"]],
      ["./0002_user_role.scenario.ts", ["role"]],
    ])
  })

  it("imports modules given as functions", async () => {
    expect(
      await load({
        "0001_user.scenario.ts": async () => ({ default: scenario("lazy", { setup }) }),
      }),
    ).toEqual([["0001_user.scenario.ts", ["lazy"]]])
  })

  it("rejects a file without scenarios in its default export", async () => {
    const message =
      "Scenario file 0001_user.scenario.ts must export a scenario or an array of scenarios by default."
    await expect(load({ "0001_user.scenario.ts": {} })).rejects.toThrow(message)
    await expect(
      load({ "0001_user.scenario.ts": { default: [scenario("user", { setup }), {}] } }),
    ).rejects.toThrow(message)
  })

  it("rejects non-function assertion callbacks", async () => {
    const message =
      "Scenario file 0001_user.scenario.ts must export a scenario or an array of scenarios by default."
    for (const callback of ["assertUp", "assertDown", "assertUpError"] as const) {
      await expect(
        load({
          "0001_user.scenario.ts": {
            default: { name: "invalid callback", setup, [callback]: 123 },
          },
        }),
      ).rejects.toThrow(message)
    }
  })

  it("rejects assertUpError combined with assertUp", async () => {
    const mixed = {
      name: "mixed",
      setup,
      assertUp() {},
      assertUpError() {},
    } as unknown as MigrationScenario
    await expect(load({ "0001_user.scenario.ts": { default: mixed } })).rejects.toThrow(
      `Scenario "mixed" cannot combine assertUpError with assertUp or assertDown.`,
    )
  })
})

describe("isScenarioFileOf", () => {
  it("matches a file named after the migration followed by a dot", () => {
    expect(isScenarioFileOf("./0001_user.scenario.ts", "0001_user")).toBe(true)
    expect(isScenarioFileOf("./0001_user.edge-cases.scenario.ts", "0001_user")).toBe(true)
    expect(isScenarioFileOf("./0001_user_role.scenario.ts", "0001_user")).toBe(false)
  })

  it("ignores directories and the migration file extension", () => {
    expect(
      isScenarioFileOf("scenarios/0001_user.scenario.ts", "/app/migrations/0001_user.ts"),
    ).toBe(true)
    expect(isScenarioFileOf("scenarios\\0001_user.scenario.ts", "./migrations/0001_user.mjs")).toBe(
      true,
    )
  })
})
