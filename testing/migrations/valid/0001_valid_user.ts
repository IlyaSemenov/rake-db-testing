import { change } from "#testing"

change(async (db) => {
  await db.createTable("user", (t) => ({
    id: t.identity().primaryKey(),
    username: t.varchar(),
    name: t.varchar(),
  }))
})
