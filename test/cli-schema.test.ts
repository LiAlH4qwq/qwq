import { describe, expect, it } from "vitest"
import { schemaDocument } from "@qwq/cli/client/cli-schema"

describe("qwq-cli schema", () => {
  it("declares the stable machine contract", () => {
    const doc = schemaDocument()
    expect(doc.contract.exit).toEqual({ success: 0, error: 1, usage: 2 })
    expect(doc.contract.stdout).toBe("payload only")
    expect(doc.commands).toContain("ask")
    expect(doc.replProtocols).toEqual(["interactive", "enq", "json"])
  })
})
