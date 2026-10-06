import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { parseOnline, resolvePower } from "@qwq/server/voice/profile"

describe("AC/battery detection", () => {
  it("parses the power-supply online flag", () => {
    expect(parseOnline("1\n")).toEqual(Option.some(true))
    expect(parseOnline("0")).toEqual(Option.some(false))
    expect(parseOnline("unknown")).toEqual(Option.none())
  })

  it("forces the battery profile on battery and honours the config otherwise", () => {
    expect(resolvePower("performance", Option.some("battery"))).toBe("battery")
    expect(resolvePower("performance", Option.some("ac"))).toBe("performance")
    expect(resolvePower("balanced", Option.none())).toBe("balanced")
  })
})
