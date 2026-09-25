import { change } from "#testing"

change(async (db) => {
  await db.createTable("user", (t) => ({ id: t.identity().primaryKey() }))
})

// Records a version that no migration owns, so the applied versions count diverges.
change(async (db, up) => {
  if (up) {
    await db.query`INSERT INTO rake_migration (version, name) VALUES ('0000', 'extra')`
  }
})
