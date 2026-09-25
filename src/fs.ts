import { glob } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import type { MigrationScenarioModules } from "./migration-scenario"

/**
 * Finds scenario files matching `pattern` relative to `directory`.
 *
 * Returns functions importing the files, keyed by file path relative to `directory`,
 * in the shape `verifyMigrations` accepts as `scenarios`.
 * `directory` is taken literally, so glob characters in it need no escaping.
 */
export async function loadMigrationScenarios(
  directory: string,
  pattern: string,
): Promise<MigrationScenarioModules> {
  const modules: Record<string, () => Promise<unknown>> = {}
  for await (const file of glob(pattern, { cwd: directory })) {
    // File URLs keep absolute paths importable on Windows in Node.
    modules[file] = () => import(pathToFileURL(join(directory, file)).href)
  }
  return modules
}
