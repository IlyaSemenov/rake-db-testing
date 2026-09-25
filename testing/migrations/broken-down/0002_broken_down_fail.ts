import { change } from "#testing"

change(async (db, up) => {
  if (up) {
    await db.query`CREATE TABLE post (id int)`
  } else {
    await db.query`DROP TABLE missing_table`
  }
})
