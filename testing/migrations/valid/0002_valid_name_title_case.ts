import { change } from "#testing"

// Irreversible data transformation: runs only on up.
change(async (db, up) => {
  if (up) {
    await db.query`UPDATE "user" SET name = initcap(name) WHERE name = lower(name)`
  }
})
