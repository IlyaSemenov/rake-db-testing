---
"rake-db-testing": minor
---

`verifyMigrations` requires a `migrator` option: the rake-db module the migrations import `change` from, such as `orchid-orm/migrations`; `rake-db` is now an optional peer dependency.
