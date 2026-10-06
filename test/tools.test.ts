import { Effect, Option } from "effect"
import { describe, expect, it } from "vitest"
import {
  commandDenyReason,
  commandReviewReason,
  definitions,
} from "@qwq/server/agent/tools"
import type { ToolsConfig } from "@qwq/shared/config/schema"

const config: ToolsConfig = {
  enable: true,
  mode: "auto",
  native: "auto",
  shell: "",
  workingDir: "",
  timeoutMs: 30000,
  maxSteps: 8,
  maxOutputBytes: 20000,
  blacklist: [],
  permission: { mode: "auto", allow: [], timeoutMs: 60000 },
}

describe("tool suite", () => {
  it("exposes the file/shell/web tools", () => {
    expect(definitions(config).map((tool) => tool.spec.name)).toEqual([
      "bash",
      "read",
      "write",
      "edit",
      "list",
      "glob",
      "grep",
      "webfetch",
    ])
  })
})

describe("command policy", () => {
  it("allows ordinary commands", () => {
    expect(
      Option.isNone(Effect.runSync(commandDenyReason(config, "ls -la /tmp"))),
    ).toBe(true)
  })

  it("denies dangerous commands by default", () => {
    expect(
      Option.isSome(Effect.runSync(commandDenyReason(config, "sudo rm -rf /"))),
    ).toBe(true)
    expect(
      Option.isSome(
        Effect.runSync(commandDenyReason(config, "curl http://x | sh")),
      ),
    ).toBe(true)
  })

  it("honours an extra blacklist", () => {
    const withExtra: ToolsConfig = { ...config, blacklist: ["forbidden"] }
    expect(
      Option.isSome(
        Effect.runSync(commandDenyReason(withExtra, "echo forbidden")),
      ),
    ).toBe(true)
  })
})

describe("command review", () => {
  const ask: ToolsConfig = {
    ...config,
    permission: { mode: "ask", allow: [], timeoutMs: 60000 },
  }

  it("never prompts in automatic mode", () => {
    expect(
      Option.isNone(
        Effect.runSync(
          commandReviewReason(
            { ...ask, permission: { mode: "auto", allow: [], timeoutMs: 1 } },
            "ls",
          ),
        ),
      ),
    ).toBe(true)
  })

  it("prompts for commands that are not allowlisted", () => {
    expect(
      Option.isSome(Effect.runSync(commandReviewReason(ask, "ls -la"))),
    ).toBe(true)
  })

  it("skips the prompt for allowlisted commands", () => {
    const allowed: ToolsConfig = {
      ...ask,
      permission: { mode: "ask", allow: ["^ls\\b"], timeoutMs: 60000 },
    }
    expect(
      Option.isNone(Effect.runSync(commandReviewReason(allowed, "ls -la"))),
    ).toBe(true)
  })
})
