# rake-db-testing

## 0.3.1

### Patch Changes

- 2f246ce: Reject scenario exports with non-function assertion callbacks before running migrations.

## 0.3.0

### Minor Changes

- d1719b7: `pqb` is no longer a required peer dependency: `rake-db-testing` works through the passed `db`, and `pqb` and `rake-db` are only needed for types.

## 0.2.0

### Minor Changes

- af3d1b9: Accept rake-db `MigrateConfig` with `migrationsPath`.
- 1f9a0fa: `verifyMigrations` requires a `migrator` option: the rake-db module the migrations import `change` from, such as `orchid-orm/migrations`; `rake-db` is now an optional peer dependency.

### Patch Changes

- 912c3be: `verifyMigrations` fails if a migration key verified earlier in the process comes with another migration.

## 0.1.0

### Minor Changes

- a133c31: Initial beta release.
