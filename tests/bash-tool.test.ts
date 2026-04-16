import { describe, expect, it } from "vitest"
import { bashTool } from "../src/tools/bash.ts"

describe("bashTool", () => {
  it("returns stdout on failures even when stderr is empty", async () => {
    const result = await bashTool.execute({
      command: "echo stdout-only failure && exit 7",
      timeout: 2,
    })

    expect(result.success).toBe(false)
    expect(result.value).toContain("Command failed with code 7")
    expect(result.value).toContain("stdout-only failure")
  })

  it("returns a timeout error after terminating the process", async () => {
    const result = await bashTool.execute({
      command: 'node -e "setInterval(() => {}, 1000)"',
      timeout: 0.05,
    })

    expect(result.success).toBe(false)
    expect(result.value).toContain("Command timed out after 0.05 seconds")
    expect(result.value).toContain("Process was terminated due to timeout")
  })
})
