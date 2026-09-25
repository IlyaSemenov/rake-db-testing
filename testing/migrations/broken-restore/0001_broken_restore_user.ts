import { change } from "#testing"

change(async (db) => {
  await db.createTable("user", (t) => ({ id: t.identity().primaryKey() }))
})

// Down forgets to drop this table, so the next up fails.
change(async (db, up) => {
  if (up) {
    await db.query`CREATE TABLE extra (id int)`
  }
})
