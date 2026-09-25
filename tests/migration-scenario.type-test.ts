import { scenario } from "rake-db-testing"

scenario("data", { setup() {}, assertUp() {}, assertDown() {} })
scenario("failure", { setup() {}, assertUpError() {} })

// @ts-expect-error assertUp is not allowed together with assertUpError
scenario("mixed", { setup() {}, assertUp() {}, assertUpError() {} })

// @ts-expect-error setup is required
scenario("no setup", { assertUp() {} })

scenario("misspelled callback", {
  setup() {},
  // @ts-expect-error unknown scenario options are rejected
  asertUp() {},
})
