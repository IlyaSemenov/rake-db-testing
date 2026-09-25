# rake-db-testing

Verify a [rake-db](https://orchid-orm.netlify.app/guide/migration-setup-and-overview) migration history on PostgreSQL:

- Every migration applies, rolls back, and applies again on a clean schema.
- Data scenarios check how a migration transforms existing rows, or that it refuses to apply to them.

## Install

```sh
npm install --save-dev rake-db-testing
```

`rake-db` and `pqb` are peer dependencies; see [Single rake-db instance](#single-rake-db-instance) for Orchid ORM projects.

## What is verified

The whole history is applied to a temporary schema, one migration at a time.
Each migration goes through:

`up` → `down` → data scenarios → `up`

Each scenario starts from the schema before the migration:

- Data scenario: `setup` → `up` → `assertUp` → `down` → `assertDown` → `up`.
- Failure scenario: `setup` → `up` must fail → `assertUpError`.

Scenarios do not affect each other or the rest of the history.

Nothing is left in the database: the verification runs in a test transaction and rolls it back.
Inside the caller's test transaction, it nests and leaves that transaction usable with its `search_path` unchanged.

## Usage

Call `verifyMigrations` inside a test.
`scenarios` maps scenario file paths to their modules, exactly as `import.meta.glob` returns them.

With Vitest:

```ts
import { verifyMigrations } from "rake-db-testing"
import { test } from "vitest"

import { db, rakeDbConfig } from "./db"

const scenarios = import.meta.glob("./migrations/*.scenario.ts", { eager: true })

test("migration history", async () => {
  await verifyMigrations({ db: db.$qb, config: rakeDbConfig, scenarios })
})
```

Or with the optional [file system loader](#load-scenarios-from-the-file-system), which works in any test runner (Bun here):

```ts
import { test } from "bun:test"
import { verifyMigrations } from "rake-db-testing"
import { loadMigrationScenarios } from "rake-db-testing/fs"

import { db, rakeDbConfig } from "./db"

const scenarios = await loadMigrationScenarios(import.meta.dirname, "migrations/*.scenario.ts")

test("migration history", async () => {
  await verifyMigrations({ db: db.$qb, config: rakeDbConfig, scenarios })
})
```

`config` is the migrator configuration of your project with the `migrations` object:

```ts
export const migrations = {
  "0001_user": () => import("./migrations/0001_user"),
  "0002_user_name_title_case": () => import("./migrations/0002_user_name_title_case"),
}

export const rakeDbConfig = {
  migrations,
  migrationsTable: "rake_migration",
  // ...the rest of the project's rake-db configuration
}
```

`migrationsTable` must be a plain table name without a schema.

## Defining scenarios

Put the scenario of a migration into a file named after it, like a migration file with its changes:

```text
0002_user_name_title_case.ts           ← migration
0002_user_name_title_case.scenario.ts  ← its scenario
```

The scenario file exports the scenario by default:

```ts
// 0002_user_name_title_case.scenario.ts
import { expect } from "bun:test"
import { scenario } from "rake-db-testing"

export default scenario("capitalizes lowercase names", {
  async setup({ db, schemaRef }) {
    await db.query`INSERT INTO ${schemaRef("user")} (name) VALUES ('john doe')`
  },
  async assertUp({ db, schemaRef }) {
    expect(await db.query.get<string>`SELECT name FROM ${schemaRef("user")}`).toBe("John Doe")
  },
})
```

A failure scenario declares `assertUpError` instead of `assertUp` and `assertDown`; the verification fails if `up` succeeds:

```ts
// 0005_username_citext.scenario.ts
export default scenario("refuses usernames that differ only by case", {
  async setup({ db, schemaRef }) {
    await db.query`INSERT INTO ${schemaRef("user")} (username) VALUES ('Admin'), ('admin')`
  },
  assertUpError(error) {
    expect(String(error)).toContain("could not create unique index")
  },
})
```

To check several cases of one migration, export an array of scenarios:

```ts
export default [
  scenario("compares usernames case-insensitively", { setup, assertUp, assertDown }),
  scenario("refuses usernames that differ only by case", { setup, assertUpError }),
]
```

The file name only has to start with the migration key followed by a dot, so a migration may also have several scenario files, such as `0005_username_citext.edge-cases.scenario.ts`.

Scenario callbacks receive a context:

- `db`: the `Db` passed to `verifyMigrations`.
- `schema`: the name of the temporary schema.
- `schemaRef(table)`: a reference to a table in the temporary schema for SQL templates.

Scenario callbacks run with the caller's `search_path`, so reference tables through `schemaRef` or qualify them with `schema`.

### Load scenarios from the file system

The optional `rake-db-testing/fs` entry reads scenario files from the file system, so it does not work with bundled code; the main entry does not depend on it.

`loadMigrationScenarios(directory, pattern)` returns the files matching the glob `pattern` relative to `directory` in the shape of `scenarios`.
Pass `import.meta.dirname` as `directory` to resolve the pattern relative to the current file, as `import.meta.glob` does.
It works in Bun, Vitest, and Node 22 or later with a TypeScript loader.

## Requirements for migrations

- Migrations do not name schemas and rely on `search_path`, so the history applies to any schema.
- For objects outside the verified schema, such as extensions installed in a separate schema, pass [`searchPath`](#searchpath).
- An irreversible data transformation runs only on `up`; a scenario of such a migration does not expect `assertDown` to see the original data.
- Migration keys must be unique among all migration sets verified in one process: rake-db caches loaded migrations by key.

### searchPath

By default, migrations run with `search_path` set to the temporary schema.
Pass `searchPath` to make other schemas visible to them:

```ts
await verifyMigrations({
  db,
  config: rakeDbConfig,
  searchPath: (schema) => `${schema}, extensions`,
})
```

## Errors

Any failure is wrapped into an error that names the migration, the scenario, and the step; the original error is in `cause`:

```text
Migration "0002_post" failed at "down on clean schema".
Scenario "capitalizes lowercase names" of migration "0003_user_name_title_case" failed at "assertUp".
```

## Single rake-db instance

rake-db collects the `change()` calls of a migration file in module state, and `migrate` reads them from there.
If a project's migrations call `change` from one copy of rake-db while `rake-db-testing` resolves another copy, `migrate` sees no changes: the migrations silently do nothing, and the verification may pass falsely.
`rake-db-testing` cannot detect this, because the registry of the other copy is not observable.

Make sure that the project has a single copy of rake-db and pqb.
Orchid ORM pins exact versions of both, so add them as direct dependencies of the project with exactly the versions listed in the `dependencies` of the installed `orchid-orm`, and update them together with it:

```sh
npm view orchid-orm@<installed version> dependencies
npm install --save-exact rake-db@<version> pqb@<version>
```

Check that only one copy of each is installed:

```sh
npm ls rake-db pqb
pnpm why rake-db pqb
bun pm ls --all | grep -E "rake-db|pqb"
```

Alternatively, export changes from migration files by default and enable `forceDefaultExports`.
rake-db then takes the changes from the module exports instead of its module state, and a second copy no longer matters:

```ts
export default change(async (db) => {
  await db.createTable("user", (t) => ({ id: t.identity().primaryKey() }))
})
```

## Compatibility

- `rake-db` 2.37 or later and `pqb` 0.72 or later, which is Orchid ORM 1.77 or later.
- `Db` and `MigrateConfig` obtained through `orchid-orm` and `orchid-orm/migrations` are accepted.
