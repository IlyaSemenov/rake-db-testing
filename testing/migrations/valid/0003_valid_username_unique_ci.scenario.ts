import { expect } from "bun:test"

import { type MigrationScenarioContext, scenario } from "rake-db-testing"

async function getIndexes(db: MigrationScenarioContext["db"], schema: string) {
  return await db.query.pluck<string>`SELECT indexname FROM pg_indexes WHERE schemaname = ${schema}`
}

export default [
  scenario("adds a case-insensitive unique index", {
    async setup({ db, schemaRef }) {
      await db.query`INSERT INTO ${schemaRef("user")} (username, name) VALUES ('Admin', 'Admin')`
    },
    async assertUp({ db, schema }) {
      expect(await getIndexes(db, schema)).toContain("user_username_ci")
    },
    async assertDown({ db, schema }) {
      expect(await getIndexes(db, schema)).not.toContain("user_username_ci")
    },
  }),
  scenario("refuses to apply when usernames differ only by case", {
    async setup({ db, schemaRef }) {
      await db.query`INSERT INTO ${schemaRef("user")} (username, name) VALUES ('Admin', 'Admin'), ('admin', 'Admin')`
    },
    assertUpError(error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain("could not create unique index")
    },
  }),
]
