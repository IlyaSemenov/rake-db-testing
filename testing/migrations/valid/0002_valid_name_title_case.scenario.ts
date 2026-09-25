import { expect } from "bun:test"

import { defineValidScenario } from "./define"

export default defineValidScenario({
  name: "capitalizes lowercase names",
  migration: "0002_valid_name_title_case",
  async setup({ db, schemaRef }) {
    await db.query`INSERT INTO ${schemaRef("user")} (username, name) VALUES ('lower', 'john doe'), ('mixed', 'Jane doe')`
  },
  async assertUp({ db, schemaRef }) {
    expect(
      await db.query.pluck<string>`SELECT name FROM ${schemaRef("user")} ORDER BY username`,
    ).toEqual(["John Doe", "Jane doe"])
  },
})
