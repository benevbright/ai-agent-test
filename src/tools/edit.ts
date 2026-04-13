import { z } from "zod"
import fs from "fs"
import path from "path"
import chalk from "chalk"

export interface ReplaceEdit {
  oldText: string
  newText: string
  useReplaceAll?: boolean
}

export interface LineEdit {
  startLine: number
  endLine?: number
  newText: string
}

export type Edit = ReplaceEdit | LineEdit

const replaceEditSchema = z.object({
  oldText: z.string().describe("The exact text for JS's `replace()` function"),
  newText: z.string().describe("The new text to insert"),
  useReplaceAll: z
    .boolean()
    .optional()
    .describe("If true, replace all occurrences instead of just the first one"),
})

const lineEditSchema = z.object({
  startLine: z
    .number()
    .int()
    .positive()
    .describe(
      "The 1-indexed line number where replacement should start. Use this when exact text contains many escape characters.",
    ),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "The 1-indexed line number where replacement should end. Defaults to startLine.",
    ),
  newText: z
    .string()
    .describe("The replacement text for the specified line range."),
})

const editSchema = z.union([replaceEditSchema, lineEditSchema])

function isReplaceEdit(edit: Edit): edit is ReplaceEdit {
  return "oldText" in edit
}

function applyLineEdit(
  content: string,
  edit: LineEdit,
): { success: true; content: string } | { success: false; error: string } {
  const lines = content.split("\n")
  const startLine = edit.startLine
  const endLine = edit.endLine ?? startLine

  if (endLine < startLine) {
    return {
      success: false,
      error: `Invalid line range: endLine (${endLine}) must be greater than or equal to startLine (${startLine}).`,
    }
  }

  if (startLine > lines.length) {
    return {
      success: false,
      error: `Invalid line range: startLine ${startLine} is beyond the end of the file (${lines.length} lines).`,
    }
  }

  if (endLine > lines.length) {
    return {
      success: false,
      error: `Invalid line range: endLine ${endLine} is beyond the end of the file (${lines.length} lines).`,
    }
  }

  const replacementLines = edit.newText.split("\n")
  const updatedLines = [
    ...lines.slice(0, startLine - 1),
    ...replacementLines,
    ...lines.slice(endLine),
  ]
  const updatedContent = updatedLines.join("\n")

  return {
    success: true,
    content: updatedContent,
  }
}

export const editTool = {
  description:
    "Make precise, targeted edits to existing files. Use exact text replacement for simple changes, or replace a line range when escaped characters make exact matching unreliable.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to edit"),
    edits: z
      .array(editSchema)
      .describe(
        "Array of edits to apply. Each edit can be an exact text replacement or a line-range replacement.",
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
        let newContent = content

        if (isReplaceEdit(edit)) {
          if (edit.useReplaceAll) {
            newContent = content.replaceAll(edit.oldText, edit.newText)
          } else {
            newContent = content.replace(edit.oldText, edit.newText)
          }
        } else {
          const lineEditResult = applyLineEdit(content, edit)
          if (!lineEditResult.success) {
            return {
              success: false,
              error: lineEditResult.error,
            }
          }
          newContent = lineEditResult.content
        }

        if (newContent !== content) {
          editsApplied++
          content = newContent
        } else {
          if (isReplaceEdit(edit)) {
            console.warn(
              chalk.yellow(
                `[TOOL - edit] ⚠️ oldText not found in file: ${edit.oldText.substring(0, 50)}...`,
              ),
            )
          } else {
            console.warn(
              chalk.yellow(
                `[TOOL - edit] ⚠️ line range ${edit.startLine}-${edit.endLine ?? edit.startLine} produced no change.`,
              ),
            )
          }
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
