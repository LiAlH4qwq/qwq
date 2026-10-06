import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { parsePciVendor, resolveAccel } from "@qwq/server/voice/accel"

describe("accelerator resolver", () => {
  it("maps the PCI vendor ids written by Linux", () => {
    expect(parsePciVendor("0x8086\n")).toEqual(Option.some("intel"))
    expect(parsePciVendor("0x10DE")).toEqual(Option.some("nvidia"))
    expect(parsePciVendor("0x1002")).toEqual(Option.some("amd"))
    expect(parsePciVendor("0x1022")).toEqual(Option.some("amd"))
    expect(parsePciVendor("0x1234")).toEqual(Option.none())
  })

  it("resolves `auto` to the vendor's native provider on Linux", () => {
    expect(resolveAccel("auto", "linux", Option.some("intel"))).toBe("openvino")
    expect(resolveAccel("auto", "linux", Option.some("nvidia"))).toBe("cuda")
    expect(resolveAccel("auto", "linux", Option.some("amd"))).toBe("rocm")
  })

  it("honours an explicit choice and falls back to CPU otherwise", () => {
    expect(resolveAccel("npu", "linux", Option.some("intel"))).toBe("npu")
    expect(resolveAccel("auto", "darwin", Option.some("nvidia"))).toBe("cpu")
    expect(resolveAccel("auto", "linux", Option.none())).toBe("cpu")
  })
})
