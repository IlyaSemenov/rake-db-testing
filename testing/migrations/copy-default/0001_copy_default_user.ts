import { copyChange } from "#testing"

export default copyChange(async (db) => {
  await db.createTable("user", (t) => ({ id: t.identity().primaryKey() }))
})
