import { describe, expect, it } from "vitest"
import { compilationCheckTool } from "../src/tools/compilation_check.ts"

describe("compilationCheckTool", () => {
  it("does not fail just because successful output contains the word error", async () => {
    const result = await compilationCheckTool.execute({
      commands: 'echo "0 errors, 0 warnings"',
      timeout: 2,
    })

    expect(result.success).toBe(true)
    expect(result.output).toContain("Compilation check passed successfully.")
    expect(result.output).toContain("0 errors, 0 warnings")
  })

  it("preserves stdout and stderr when a command fails", async () => {
    const result = await compilationCheckTool.execute({
      commands: "echo stdout-message && echo stderr-message 1>&2 && exit 4",
      timeout: 2,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe("Compilation check failed with code 4")
    expect(result.output).toContain("stdout-message")
    expect(result.stderr).toContain("stderr-message")
  })
})
