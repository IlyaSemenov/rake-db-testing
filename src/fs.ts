import { glob } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import type { MigrationModules, MigrationScenario } from "./migration-scenario"

/**
 * Imports scenario files matching `pattern` relative to `directory`, in path order.
 *
 * `directory` is taken literally, so glob characters in it need no escaping.
 * Each file must export a scenario or an array of scenarios by default.
 */
export async function loadMigrationScenarios<TMigrations extends MigrationModules>(
  directory: string,
  pattern: string,
): Promise<MigrationScenario<TMigrations>[]> {
  const files = (await Array.fromAsync(glob(pattern, { cwd: directory }))).sort()

  const scenarios: MigrationScenario<TMigrations>[] = []
  for (const file of files) {
    // File URLs keep absolute paths importable on Windows in Node.
    const module = await import(pathToFileURL(join(directory, file)).href)
    const exported: unknown = module.default
    if (!exported || typeof exported !== "object") {
      throw new Error(
        `Scenario file ${file} must export a scenario or an array of scenarios by default.`,
      )
    }
    scenarios.push(...(Array.isArray(exported) ? exported : [exported]))
  }
  return scenarios
}
