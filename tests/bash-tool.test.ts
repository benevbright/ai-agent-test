import { describe, expect, it } from "vitest"
import { bashTool } from "../src/tools/bash.ts"

describe("bashTool", () => {
  it("returns stdout on failures even when stderr is empty", async () => {
    const result = await bashTool.execute({
      command: "echo stdout-only failure && exit 7",
      timeout: 2,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe("Command failed with code 7")
    expect(result.output).toContain("stdout-only failure")
    expect(result.stderr).toBeUndefined()
  })

  it("returns a timeout error after terminating the process", async () => {
    const result = await bashTool.execute({
      command: 'node -e "setInterval(() => {}, 1000)"',
      timeout: 0.05,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe("Command timed out after 0.05 seconds")
    expect(result.stderr).toContain("Process was terminated due to timeout")
  })
})
