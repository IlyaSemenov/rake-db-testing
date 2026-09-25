import { change } from "#testing"

change(async (db, up) => {
  if (up) {
    await db.query`CREATE UNIQUE INDEX user_username_ci ON "user" (lower(username))`
  } else {
    await db.query`DROP INDEX user_username_ci`
  }
})
