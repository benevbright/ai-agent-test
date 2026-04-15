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

export type Edit = ReplaceEdit[] | LineEdit[]

interface AppliedLineEdit {
  originalStartLine: number
  originalEndLine: number
  lineDelta: number
}

const replaceEditSchema = z.object({
  oldText: z.string().describe("Text to find and replace."),
  newText: z.string().describe("Replacement text."),
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

function isReplaceEdit(edit: ReplaceEdit | LineEdit): edit is ReplaceEdit {
  return "oldText" in edit
}

function validateLineRange(
  totalLines: number,
  startLine: number,
  endLine: number,
): string | null {
  if (endLine < startLine) {
    return `Invalid line range: endLine (${endLine}) must be greater than or equal to startLine (${startLine}).`
  }

  if (startLine > totalLines) {
    return `Invalid line range: startLine ${startLine} is beyond the end of the file (${totalLines} lines).`
  }

  if (endLine > totalLines) {
    return `Invalid line range: endLine ${endLine} is beyond the end of the file (${totalLines} lines).`
  }

  return null
}

function hasOverlappingOriginalRange(
  edit: LineEdit,
  appliedLineEdits: AppliedLineEdit[],
) {
  const originalEndLine = edit.endLine ?? edit.startLine

  return appliedLineEdits.some((appliedEdit) => {
    return !(
      originalEndLine < appliedEdit.originalStartLine ||
      edit.startLine > appliedEdit.originalEndLine
    )
  })
}

function getAdjustedLineRange(
  edit: LineEdit,
  appliedLineEdits: AppliedLineEdit[],
) {
  const originalEndLine = edit.endLine ?? edit.startLine
  const lineOffset = appliedLineEdits.reduce((offset, appliedEdit) => {
    if (appliedEdit.originalEndLine < edit.startLine) {
      return offset + appliedEdit.lineDelta
    }

    return offset
  }, 0)

  return {
    startLine: edit.startLine + lineOffset,
    endLine: originalEndLine + lineOffset,
    originalEndLine,
  }
}

function applyLineEdit(
  content: string,
  edit: LineEdit,
): { success: true; content: string } | { success: false; error: string } {
  const lines = content.split("\n")
  const startLine = edit.startLine
  const endLine = edit.endLine ?? startLine

  const validationError = validateLineRange(lines.length, startLine, endLine)
  if (validationError) {
    return {
      success: false,
      error: validationError,
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
    "Make targeted edits to existing files. Use text replacement or line ranges.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to edit"),
    edits: z
      .union([z.array(replaceEditSchema), z.array(lineEditSchema)])
      .describe("Array of edits to apply. Use text OR line edits per request."),
  }),
  execute: async ({ path: filePath, edits }: { path: string; edits: Edit }) => {
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
      const appliedLineEdits: AppliedLineEdit[] = []

      for (const edit of edits) {
        let newContent = content

        if (isReplaceEdit(edit)) {
          if (edit.useReplaceAll) {
            newContent = content.replaceAll(edit.oldText, edit.newText)
          } else {
            newContent = content.replace(edit.oldText, edit.newText)
          }
        } else {
          if (hasOverlappingOriginalRange(edit, appliedLineEdits)) {
            return {
              success: false,
              error:
                "Overlapping line-based edits are not supported in the same request. Merge them into a single line-range edit.",
            }
          }

          const adjustedRange = getAdjustedLineRange(edit, appliedLineEdits)
          const lineEditResult = applyLineEdit(content, {
            ...edit,
            startLine: adjustedRange.startLine,
            endLine: adjustedRange.endLine,
          })
          if (!lineEditResult.success) {
            return {
              success: false,
              error: lineEditResult.error,
            }
          }
          newContent = lineEditResult.content

          const replacedLineCount =
            adjustedRange.endLine - adjustedRange.startLine + 1
          const insertedLineCount = edit.newText.split("\n").length

          appliedLineEdits.push({
            originalStartLine: edit.startLine,
            originalEndLine: adjustedRange.originalEndLine,
            lineDelta: insertedLineCount - replacedLineCount,
          })
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
