import { readFileSync } from "node:fs"
import { Effect, Either } from "effect"
import { parse } from "yaml"
import { describe, expect, it } from "vitest"
import { decodeConfig, validateConfig } from "@qwq/shared/config/load"

describe("config.example.yaml", () => {
  it("is valid", () => {
    const text = readFileSync("config.example.yaml", "utf8")
    const parsed = parse(text)
    const config = Effect.runSync(decodeConfig(parsed, "config.example.yaml"))
    const validated = Effect.runSync(Effect.either(validateConfig(config)))
    expect(Either.isRight(validated)).toBe(true)
  })
})
