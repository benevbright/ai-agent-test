import { describe, expect, it } from "vitest"
import { toolNames, tools } from "../src/tools/index.ts"

describe("tools registry contract", () => {
  it("returns numeric progress as a string value", async () => {
    const result = await tools[toolNames.recordProgress].execute({
      progress: 100,
    })

    expect(result).toEqual({ success: true, value: "100" })
  })

  it("returns tool failures in the shared result type", async () => {
    const result = await tools[toolNames.read].execute({
      path: "/path/that/does/not/exist.txt",
    })

    expect(result.success).toBe(false)
    expect(result.value).toContain("File not found")
  })
})
