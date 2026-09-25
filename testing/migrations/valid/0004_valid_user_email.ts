import { change } from "#testing"

change(async (db) => {
  await db.changeTable("user", (t) => ({
    email: t.add(t.varchar().nullable()),
  }))
})

change(async (db, up) => {
  if (up) {
    await db.query`UPDATE "user" SET email = username || '@example.com'`
  }
})
