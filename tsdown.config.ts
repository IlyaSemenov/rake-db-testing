import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/fs.ts"],
  // Emit declarations only for published sources, not for tests and test fixtures.
  tsconfig: "tsconfig.build.json",
  format: ["cjs", "esm"],
  dts: true,
  exports: true,
  publint: true,
  attw: {
    profile: "node16",
  },
})
