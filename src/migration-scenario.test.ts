import { describe, expect, it } from "bun:test"

import { bindMigrationScenarios, type MigrationScenario, scenario } from "./migration-scenario"

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

describe("bindMigrationScenarios", () => {
  const migrations = {
    "0001_user": async () => ({}),
    "0002_user_role": async () => ({}),
  }

  const bind = async (modules: Record<string, unknown>) => {
    const bound = await bindMigrationScenarios(modules, migrations)
    return bound.map(({ migration, scenario }) => [migration, scenario.name])
  }

  it("binds scenarios to migrations by file name in path order", async () => {
    expect(
      await bind({
        "./0002_user_role.scenario.ts": { default: scenario("role", { setup }) },
        "./0001_user.scenario.ts": {
          default: [scenario("user 1", { setup }), scenario("user 2", { setup })],
        },
        "./0001_user.edge-cases.scenario.ts": { default: scenario("edge case", { setup }) },
      }),
    ).toEqual([
      ["0001_user", "edge case"],
      ["0001_user", "user 1"],
      ["0001_user", "user 2"],
      ["0002_user_role", "role"],
    ])
  })

  it("imports modules given as functions", async () => {
    expect(
      await bind({
        "0001_user.scenario.ts": async () => ({ default: scenario("lazy", { setup }) }),
      }),
    ).toEqual([["0001_user", "lazy"]])
  })

  it("matches migration keys with directories and extensions", async () => {
    const bound = await bindMigrationScenarios(
      { "scenarios/0001_user.scenario.ts": { default: scenario("user", { setup }) } },
      { "./migrations/0001_user.ts": async () => ({}) },
    )
    expect(bound.map(({ migration }) => migration)).toEqual(["./migrations/0001_user.ts"])
  })

  it("rejects a file that matches no migration", async () => {
    await expect(
      bind({ "0001_user_profile.scenario.ts": { default: scenario("profile", { setup }) } }),
    ).rejects.toThrow(
      "Scenario file 0001_user_profile.scenario.ts matches no migration: its name must start with a migration key followed by a dot.",
    )
  })

  it("rejects a file without scenarios in its default export", async () => {
    const message =
      "Scenario file 0001_user.scenario.ts must export a scenario or an array of scenarios by default."
    await expect(bind({ "0001_user.scenario.ts": {} })).rejects.toThrow(message)
    await expect(
      bind({ "0001_user.scenario.ts": { default: [scenario("user", { setup }), {}] } }),
    ).rejects.toThrow(message)
  })

  it("rejects assertUpError combined with assertUp", async () => {
    const mixed = {
      name: "mixed",
      setup,
      assertUp() {},
      assertUpError() {},
    } as unknown as MigrationScenario
    await expect(bind({ "0001_user.scenario.ts": { default: mixed } })).rejects.toThrow(
      `Scenario "mixed" cannot combine assertUpError with assertUp or assertDown.`,
    )
  })
})
