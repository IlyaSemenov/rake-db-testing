// Values typed through the orchid-orm re-exports of pqb and rake-db, and orchid-orm/migrations as the migrator, are accepted.
import type { Db } from "orchid-orm"
import * as migrator from "orchid-orm/migrations"
import type { MigrateConfig } from "orchid-orm/migrations"
import { orchidORM } from "orchid-orm/postgres-js"
import { verifyMigrations } from "rake-db-testing"

import { validMigrations } from "#testing"

declare const qb: Db
const config = {
  migrations: validMigrations,
  migrationsTable: "rake_migration",
} satisfies MigrateConfig

void verifyMigrations({ db: qb, migrator, config })
void verifyMigrations({ db: orchidORM({ databaseURL: "" }, {}).$qb, migrator, config })

const typedConfig: MigrateConfig = config
void verifyMigrations({ db: qb, migrator, config: typedConfig })
void verifyMigrations({
  db: qb,
  migrator,
  config: { migrationsPath: "migrations", import: (path) => import(path) },
})
