import { join } from "node:path"

/** Directory of a migration set loaded by rake-db through `migrationsPath`; it holds nothing but migrations. */
export const fileBasedMigrationsPath = join(import.meta.dirname, "file-based")
