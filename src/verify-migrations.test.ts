import { describe, expect, it } from "bun:test"
import { randomUUID } from "node:crypto"

import { testTransaction } from "pqb"

import {
  brokenDownMigrations,
  brokenRestoreMigrations,
  db,
  extraVersionMigrations,
  fileBasedMigrationsPath,
  searchPathMigrations,
  validMigrations,
  testingDir,
} from "#testing"

import { loadMigrationScenarios } from "./fs"
import { type MigrationScenario, scenario } from "./migration-scenario"
import { verifyMigrations } from "./verify-migrations"

const migrationsTable = "rake_migration"

async function getError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(error).toBeInstanceOf(Error)
  return error as Error
}

async function getTestSchemas() {
  return await db.query.pluck<string>`
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test\\_migrations\\_%'
  `
}

describe("valid history", () => {
  it("passes and leaves nothing in the database", async () => {
    const schemasBefore = await getTestSchemas()
    await verifyMigrations({
      db,
      config: { migrations: validMigrations, migrationsTable, log: false },
      scenarios: await loadMigrationScenarios(testingDir, "migrations/valid/*.scenario.ts"),
    })
    expect(await getTestSchemas()).toEqual(schemasBefore)
    expect(
      await db.query.get<string | null>`SELECT to_regclass(${migrationsTable})::text`,
    ).toBeNull()
  })

  it("uses the default migrations table of rake-db", async () => {
    await verifyMigrations({ db, config: { migrations: validMigrations, log: false } })
  })

  it("keeps the caller's test transaction and search_path", async () => {
    await testTransaction.start(db)
    try {
      await db.query`CREATE TEMPORARY TABLE outer_marker (id int)`
      await db.query`SELECT set_config('search_path', 'pg_catalog', true)`
      await verifyMigrations({
        db,
        config: { migrations: validMigrations, migrationsTable, log: false },
      })
      expect(await db.query.get<string>`SHOW search_path`).toBe("pg_catalog")
      await db.query`INSERT INTO outer_marker VALUES (1)`
      expect(await db.query.get<number>`SELECT count(*)::int FROM outer_marker`).toBe(1)
    } finally {
      await testTransaction.rollback(db)
    }
  })
})

describe("broken history", () => {
  it("names the migration whose down fails", async () => {
    const error = await getError(
      verifyMigrations({
        db,
        config: { migrations: brokenDownMigrations, migrationsTable, log: false },
      }),
    )
    expect(error.message).toBe(
      `Migration "0002_broken_down_fail" failed at "down on clean schema".`,
    )
    expect(String((error.cause as Error).message)).toContain("missing_table")
  })

  it("names the migration whose down does not restore the schema", async () => {
    const error = await getError(
      verifyMigrations({
        db,
        config: { migrations: brokenRestoreMigrations, migrationsTable, log: false },
      }),
    )
    expect(error.message).toBe(
      `Migration "0001_broken_restore_user" failed at "re-up on clean schema".`,
    )
    expect(String((error.cause as Error).message)).toContain(`"extra" already exists`)
  })

  it("names the migration that records an unexpected version", async () => {
    const error = await getError(
      verifyMigrations({
        db,
        config: { migrations: extraVersionMigrations, migrationsTable, log: false },
      }),
    )
    expect(error.message).toBe(
      `Migration "0001_extra_version_user" left applied versions [0000, 0001] after "up on clean schema", expected [0001].`,
    )
  })
})

describe("config", () => {
  it("finds migrations through migrationsPath", async () => {
    const ran: string[] = []
    await verifyMigrations({
      db,
      config: {
        migrationsPath: fileBasedMigrationsPath,
        import: (path) => import(path),
        migrationsTable,
        log: false,
      },
      scenarios: {
        "0002_file_based_user_email.scenario.ts": {
          default: scenario("adds email", {
            setup() {},
            async assertUp({ db, schemaRef }) {
              await db.query`SELECT email FROM ${schemaRef("user")}`
              ran.push("adds email")
            },
          }),
        },
      },
    })
    expect(ran).toEqual(["adds email"])
  })

  it("rejects a history without migrations", async () => {
    const message = "Found no migrations to verify."
    const empty = await getError(
      verifyMigrations({ db, config: { migrations: {}, migrationsTable, log: false } }),
    )
    expect(empty.message).toBe(message)
    const missing = await getError(
      verifyMigrations({
        db,
        config: {
          migrationsPath: `${fileBasedMigrationsPath}-missing`,
          import: (path) => import(path),
          migrationsTable,
          log: false,
        },
      }),
    )
    expect(missing.message).toBe(message)
  })

  it("calls beforeMigrate of the config", async () => {
    let calls = 0
    await verifyMigrations({
      db,
      config: {
        migrations: validMigrations,
        migrationsTable,
        log: false,
        beforeMigrate() {
          calls++
        },
      },
    })
    expect(calls).toBeGreaterThan(0)
  })

  it("rejects a migrations table with a schema", async () => {
    const error = await getError(
      verifyMigrations({
        db,
        config: { migrations: validMigrations, migrationsTable: "public.rake_migration" },
      }),
    )
    expect(error.message).toBe(
      `migrationsTable "public.rake_migration" must not include a schema: it is placed in the temporary schema.`,
    )
  })
})

describe("scenarios", () => {
  const verify = (migration: string, declared: MigrationScenario) =>
    verifyMigrations({
      db,
      config: { migrations: validMigrations, migrationsTable, log: false },
      scenarios: { [`${migration}.scenario.ts`]: { default: declared } },
    })

  const setup: MigrationScenario["setup"] = async ({ db, schemaRef }) => {
    await db.query`INSERT INTO ${schemaRef("user")} (username, name) VALUES ('lower', 'john doe')`
  }

  const setupDuplicates: MigrationScenario["setup"] = async ({ db, schemaRef }) => {
    await db.query`INSERT INTO ${schemaRef("user")} (username, name) VALUES ('Admin', 'Admin'), ('admin', 'Admin')`
  }

  it("names the scenario and step when assertUp fails", async () => {
    const error = await getError(
      verify(
        "0002_valid_name_title_case",
        scenario("broken assertUp", {
          setup,
          assertUp() {
            throw new Error("assertUp failure")
          },
        }),
      ),
    )
    expect(error.message).toBe(
      `Scenario "broken assertUp" of migration "0002_valid_name_title_case" failed at "assertUp".`,
    )
    expect((error.cause as Error).message).toBe("assertUp failure")
  })

  it("names the scenario and step when assertDown fails", async () => {
    const error = await getError(
      verify(
        "0002_valid_name_title_case",
        scenario("irreversible transformation", {
          setup,
          async assertDown({ db, schemaRef }) {
            expect(await db.query.get<string>`SELECT name FROM ${schemaRef("user")}`).toBe(
              "john doe",
            )
          },
        }),
      ),
    )
    expect(error.message).toBe(
      `Scenario "irreversible transformation" of migration "0002_valid_name_title_case" failed at "assertDown".`,
    )
  })

  it("fails a failure scenario when the migration succeeds", async () => {
    const error = await getError(
      verify(
        "0002_valid_name_title_case",
        scenario("unexpected success", { setup, assertUpError() {} }),
      ),
    )
    expect(error.message).toBe(
      `Scenario "unexpected success" of migration "0002_valid_name_title_case" failed at "up".`,
    )
    expect((error.cause as Error).message).toBe("Expected up to fail, but it succeeded.")
  })

  it("passes the migration error to assertUpError", async () => {
    let received: unknown
    await verify(
      "0003_valid_username_unique_ci",
      scenario("duplicate usernames", {
        setup: setupDuplicates,
        assertUpError(error) {
          received = error
        },
      }),
    )
    expect(String((received as Error).message)).toContain("could not create unique index")
  })

  it("names the scenario and step when assertUpError fails", async () => {
    const error = await getError(
      verify(
        "0003_valid_username_unique_ci",
        scenario("wrong expectation", {
          setup: setupDuplicates,
          assertUpError() {
            throw new Error("assertUpError failure")
          },
        }),
      ),
    )
    expect(error.message).toBe(
      `Scenario "wrong expectation" of migration "0003_valid_username_unique_ci" failed at "assertUpError".`,
    )
  })

  it("rejects a scenario file of a missing migration after verification", async () => {
    const error = await getError(verify("0099_missing", scenario("missing", { setup })))
    expect(error.message).toBe(
      `Scenario file 0099_missing.scenario.ts matches no migration: its name must start with a migration name followed by a dot.`,
    )
  })

  it("rejects assertUpError combined with assertUp", async () => {
    const mixed = { name: "mixed", setup, assertUp() {}, assertUpError() {} }
    const error = await getError(
      verify("0002_valid_name_title_case", mixed as unknown as MigrationScenario),
    )
    expect(error.message).toBe(
      `Scenario "mixed" cannot combine assertUpError with assertUp or assertDown.`,
    )
  })
})

describe("searchPath", () => {
  it("resolves objects outside the temporary schema", async () => {
    const sharedSchema = `test_shared_${randomUUID().replaceAll("-", "")}`
    const config = { migrations: searchPathMigrations, migrationsTable, log: false }
    await testTransaction.start(db)
    try {
      await db.query(
        db.sql({
          raw: `CREATE SCHEMA ${sharedSchema}; CREATE FUNCTION ${sharedSchema}.shared_answer() RETURNS int LANGUAGE sql AS 'SELECT 42'`,
        }),
      )

      const error = await getError(verifyMigrations({ db, config }))
      expect(error.message).toBe(
        `Migration "0001_search_path_shared" failed at "up on clean schema".`,
      )
      expect(String((error.cause as Error).message)).toContain("shared_answer() does not exist")

      await verifyMigrations({ db, config, searchPath: (schema) => `${schema}, ${sharedSchema}` })
    } finally {
      await testTransaction.rollback(db)
    }
  })
})
