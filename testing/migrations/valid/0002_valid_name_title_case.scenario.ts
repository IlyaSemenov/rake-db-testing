import { expect } from "bun:test"

import { scenario } from "rake-db-testing"

export default scenario("capitalizes lowercase names", {
  async setup({ db, schemaRef }) {
    await db.query`INSERT INTO ${schemaRef("user")} (username, name) VALUES ('lower', 'john doe'), ('mixed', 'Jane doe')`
  },
  async assertUp({ db, schemaRef }) {
    expect(
      await db.query.pluck<string>`SELECT name FROM ${schemaRef("user")} ORDER BY username`,
    ).toEqual(["John Doe", "Jane doe"])
  },
})
