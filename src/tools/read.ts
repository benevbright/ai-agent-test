import { z } from "zod"
import fs from "fs"
import path from "path"
import chalk from "chalk"
import type { ToolDefinition } from "./types.js"

function formatLineNumberedOutput(lines: string[], startIndex: number) {
  const lastLineNumber = startIndex + lines.length
  const width = String(lastLineNumber).length

  return lines
    .map((line, index) => {
      const lineNumber = String(startIndex + index + 1).padStart(width, " ")
      return `${lineNumber}| ${line}`
    })
    .join("\n")
}

export const readTool: ToolDefinition<{
  path: string
  offset?: number
  limit?: number
  includeLineNumbers?: boolean
}> = {
  description:
    "Read a file and return its contents. Use includeLineNumbers for precise text matching.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to read"),
    offset: z
      .number()
      .optional()
      .describe("1-indexed line number to start from."),
    limit: z
      .number()
      .optional()
      .describe("Max lines to read. Omit for entire file."),
    includeLineNumbers: z
      .boolean()
      .optional()
      .describe(
        "If true, prefix each returned line with its 1-indexed line number. Useful when escaped content makes exact text matching difficult.",
      ),
  }),
  execute: async ({
    path: filePath,
    offset = 1,
    limit,
    includeLineNumbers = false,
  }: {
    path: string
    offset?: number
    limit?: number
    includeLineNumbers?: boolean
  }) => {
    console.log(
      chalk.yellow(
        `\n[TOOL - read] Reading file: ${filePath} (offset: ${offset}, limit: ${limit ?? "none"}, includeLineNumbers: ${includeLineNumbers})`,
      ),
    )

    try {
      // Resolve the path relative to current working directory
      const fullPath = path.resolve(filePath)

      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          value: `File not found: ${fullPath}`,
        }
      }

      const content = fs.readFileSync(fullPath, "utf-8")
      const lines = content.split("\n")

      // Calculate start and end indices
      const startIndex = Math.max(0, offset - 1)
      const endIndex = limit
        ? Math.min(lines.length, startIndex + limit)
        : lines.length

      if (startIndex >= lines.length) {
        return {
          success: true,
          value: `File "${fullPath}" has ${lines.length} lines. Offset ${offset} is beyond file end.`,
        }
      }

      const selectedLines = lines.slice(startIndex, endIndex)
      const resultContent = includeLineNumbers
        ? formatLineNumberedOutput(selectedLines, startIndex)
        : selectedLines.join("\n")

      let metadata = `\n\n[Read tool metadata:`
      metadata += `\n  File: ${fullPath}`
      metadata += `\n  Total lines in file: ${lines.length}`
      metadata += `\n  Offset: ${offset}`
      if (limit) {
        metadata += `\n  Limit: ${limit}`
      }
      metadata += `\n  Include line numbers: ${includeLineNumbers}`
      metadata += `\n  Lines returned: ${selectedLines.length}`
      metadata += `\n]`

      return {
        success: true,
        value: resultContent + metadata,
      }
    } catch (error: any) {
      console.error(
        chalk.red(`[TOOL - read] ⚠️ Failed to read file: ${error.message}`),
      )
      return {
        success: false,
        value: error.message,
      }
    }
  },
}
