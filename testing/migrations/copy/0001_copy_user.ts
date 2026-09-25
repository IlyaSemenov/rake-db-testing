import { copyChange } from "#testing"

copyChange(async (db) => {
  await db.createTable("user", (t) => ({ id: t.identity().primaryKey() }))
})
