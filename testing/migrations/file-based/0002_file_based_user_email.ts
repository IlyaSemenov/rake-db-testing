import { change } from "#testing"

change(async (db) => {
  await db.changeTable("user", (t) => ({
    email: t.add(t.varchar().nullable()),
  }))
})
