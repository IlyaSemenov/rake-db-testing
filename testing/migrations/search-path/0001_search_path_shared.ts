import { change } from "#testing"

// shared_answer() lives outside the verified schema and is resolved through search_path.
change(async (db, up) => {
  if (up) {
    await db.query`CREATE TABLE answer (value int DEFAULT shared_answer())`
  } else {
    await db.query`DROP TABLE answer`
  }
})
