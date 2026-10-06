import { Effect, Either } from "effect"
import { describe, expect, it } from "vitest"
import { decodeConfig, validateConfig } from "@qwq/shared/config/load"

const minimal = {
  api: { type: "openai", url: "https://example.test/v1", key: "k", model: "m" },
}

describe("config decoding", () => {
  it("applies defaults", () => {
    const config = Effect.runSync(decodeConfig(minimal, "config.yaml"))
    expect(config.debug).toBe(false)
    expect(config.sessions).toEqual({
      dir: "",
      reuseMinutes: 1,
      title: { enable: true, maxChars: 20 },
      compact: { enable: true, maxChars: 48000, keepRecent: 16 },
    })
    expect(config.envAccess).toEqual({ envVars: [] })
    expect(config.server).toEqual({ host: "127.0.0.1", port: 8787 })
  })

  it("reports schema issues", () => {
    const exit = Effect.runSyncExit(decodeConfig({ api: {} }, "config.yaml"))
    expect(exit._tag).toBe("Failure")
  })

  it("accepts a key or a keyEnv", () => {
    const config = Effect.runSync(decodeConfig(minimal, "config.yaml"))
    const ok = Effect.runSync(Effect.either(validateConfig(config)))
    expect(Either.isRight(ok)).toBe(true)

    const fromEnv = Effect.runSync(
      decodeConfig(
        {
          api: {
            type: "openai",
            url: "https://example.test/v1",
            keyEnv: "QWQ_API_KEY",
            model: "m",
          },
        },
        "config.yaml",
      ),
    )
    expect(Either.isRight(Effect.runSync(Effect.either(validateConfig(fromEnv))))).toBe(
      true,
    )
  })

  it("rejects a missing key", () => {
    const config = Effect.runSync(
      decodeConfig(
        { api: { type: "openai", url: "https://example.test/v1", model: "m" } },
        "config.yaml",
      ),
    )
    const result = Effect.runSync(Effect.either(validateConfig(config)))
    expect(Either.isLeft(result)).toBe(true)
  })
})
