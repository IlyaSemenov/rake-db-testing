import { defaultSchemaConfig, makeColumnTypes } from "pqb/internal"
import { createDb } from "pqb/postgres-js"
import { createMigrationChangeFn } from "rake-db"
import { createMigrationChangeFn as createCopyMigrationChangeFn } from "rake-db-copy"

export const db = createDb({ databaseURL: process.env.DATABASE_URL })

const columnTypes = makeColumnTypes(defaultSchemaConfig())

/** `change` of the rake-db instance that `rake-db-testing` uses. */
export const change = createMigrationChangeFn({ columnTypes })

/** `change` of a second rake-db copy, as when a project resolves another rake-db than `rake-db-testing`. */
export const copyChange = createCopyMigrationChangeFn({ columnTypes })
