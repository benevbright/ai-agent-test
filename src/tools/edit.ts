import { z } from "zod"
import fs from "fs"
import path from "path"
import chalk from "chalk"

export interface Edit {
  oldText: string
  newText: string
  replaceAll?: boolean
}

export const editTool = {
  description:
    "Make precise, targeted edits to existing files. Replace specific text patterns without rewriting the entire file. Use this for modifications when you want to keep most of the file intact and only change specific lines or sections.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to edit"),
    edits: z
      .array(
        z.object({
          oldText: z
            .string()
            .describe("The exact text for JS's `replace()` function"),
          newText: z.string().describe("The new text to insert"),
          replaceAll: z
            .boolean()
            .optional()
            .describe(
              "If true, replace all occurrences instead of just the first one",
            ),
        }),
      )
      .describe(
        "Array of edits to apply. Use multiple edits in one call (oneshot) when modifying several parts of the file.",
      ),
  }),
  execute: async ({
    path: filePath,
    edits,
  }: {
    path: string
    edits: Edit[]
  }) => {
    console.log(
      chalk.yellow(
        `\n[TOOL - edit] Editing file: ${filePath} (edits: ${edits.length})`,
      ),
    )

    try {
      const fullPath = path.resolve(filePath)

      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${fullPath}`,
        }
      }

      let content = fs.readFileSync(fullPath, "utf-8")
      let editsApplied = 0

      for (const edit of edits) {
        const existingContent = content
        let newContent = content

        if (edit.replaceAll) {
          newContent = content.replaceAll(edit.oldText, edit.newText)
        } else {
          newContent = content.replace(edit.oldText, edit.newText)
        }

        if (newContent !== content) {
          editsApplied++
          content = newContent
        } else {
          console.warn(
            chalk.yellow(
              `[TOOL - edit] ⚠️ oldText not found in file: ${edit.oldText.substring(0, 50)}...`,
            ),
          )
        }
      }

      fs.writeFileSync(fullPath, content, "utf-8")

      return {
        success: true,
        output: `File "${fullPath}" edited successfully.\nEdits applied: ${editsApplied} out of ${edits.length}`,
        metadata: {
          path: fullPath,
          editsCount: editsApplied,
          totalEdits: edits.length,
        },
      }
    } catch (error: any) {
      console.error(
        chalk.red(`[TOOL - edit] ⚠️ Failed to edit file: ${error.message}`),
      )
      return {
        success: false,
        error: error.message,
      }
    }
  },
}
