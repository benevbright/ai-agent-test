import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, describe, expect, it } from "vitest"
import { editTool } from "../src/tools/edit.ts"

const tempDirectories: string[] = []

async function createTempFile(lines: string[]) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "edit-tool-test-"))
  const filePath = path.join(tempDir, "fixture.txt")

  tempDirectories.push(tempDir)
  await fs.writeFile(filePath, lines.join("\n"), "utf-8")

  return filePath
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((tempDir) => fs.rm(tempDir, { recursive: true, force: true })),
  )
})

describe("editTool line-based edits", () => {
  it("keeps later line edits anchored to original coordinates", async () => {
    const filePath = await createTempFile([
      "line1",
      "line2",
      "line3",
      "line4",
      "line5",
      "line6",
    ])

    const result = await editTool.execute({
      path: filePath,
      edits: [
        { startLine: 2, endLine: 4, newText: "merged" },
        { startLine: 6, newText: "tail" },
      ],
    })

    expect(result.success).toBe(true)
    await expect(fs.readFile(filePath, "utf-8")).resolves.toBe(
      ["line1", "merged", "line5", "tail"].join("\n"),
    )
  })
})
