import { describe, expect, it } from "vitest"
import { version } from "@qwq/shared/version"

describe("version", () => {
  it("is a semantic version", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
