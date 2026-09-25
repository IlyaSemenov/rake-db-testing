import { describe, expect, it } from "bun:test"

import * as migrator from "rake-db"
import * as copyMigrator from "rake-db-copy"
import { type Migrator, scenario, verifyMigrations } from "rake-db-testing"

import { copyMigrations, db } from "#testing"

const migrationsTable = "rake_migration"

async function isTableCreated(verifiedMigrator: Migrator) {
  let exists: boolean | undefined
  await verifyMigrations({
    db,
    migrator: verifiedMigrator,
    config: { migrations: copyMigrations, migrationsTable, log: false },
    scenarios: {
      "0001_copy_user.scenario.ts": {
        default: scenario("observes the table", {
          setup() {},
          async assertUp({ schema }) {
            exists = await db.query
              .get<boolean>`SELECT to_regclass(${`${schema}.user`}) IS NOT NULL`
          },
        }),
      },
    },
  })
  return exists
}

describe("migrations registering changes in a second rake-db copy", () => {
  it("apply changes with the migrator of that copy", async () => {
    expect(await isTableCreated(copyMigrator)).toBe(true)
  })

  it("pass verification without applying changes with the migrator of another copy", async () => {
    expect(await isTableCreated(migrator)).toBe(false)
  })
})
