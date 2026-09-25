import { describe, expect, it } from "bun:test"

import { verifyMigrations } from "rake-db-testing"

import { copyDefaultMigrations, copyMigrations, db } from "#testing"

const migrationsTable = "rake_migration"

async function tableExists(schema: string) {
  return await db.query.get<boolean>`SELECT to_regclass(${`${schema}.user`}) IS NOT NULL`
}

describe("migrations registering changes in another rake-db copy", () => {
  it("pass verification without applying changes", async () => {
    let exists: boolean | undefined
    await verifyMigrations({
      db,
      config: { migrations: copyMigrations, migrationsTable, log: false },
      scenarios: [
        {
          name: "observes the table",
          migration: "0001_copy_user",
          setup() {},
          async assertUp({ schema }) {
            exists = await tableExists(schema)
          },
        },
      ],
    })
    expect(exists).toBe(false)
  })

  it("apply changes exported by default", async () => {
    let exists: boolean | undefined
    await verifyMigrations({
      db,
      config: {
        migrations: copyDefaultMigrations,
        migrationsTable,
        log: false,
        forceDefaultExports: true,
      },
      scenarios: [
        {
          name: "observes the table",
          migration: "0001_copy_default_user",
          setup() {},
          async assertUp({ schema }) {
            exists = await tableExists(schema)
          },
        },
      ],
    })
    expect(exists).toBe(true)
  })
})
