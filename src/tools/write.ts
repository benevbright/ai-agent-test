import { z } from "zod"
import fs from "fs"
import path from "path"
import chalk from "chalk"
import type { ToolDefinition } from "./types.js"

export const writeTool: ToolDefinition<{ path: string; content: string }> = {
  description:
    "Overwrite file with new content. Use for creating new files or full replacement. For targeted edits, use edit.ts instead.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({
    path: filePath,
    content,
  }: {
    path: string
    content: string
  }) => {
    console.log(chalk.yellow(`\n[TOOL - write] Writing to file: ${filePath}`))

    try {
      const fullPath = path.resolve(filePath)

      // Ensure directory exists
      const dirPath = path.dirname(fullPath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      fs.writeFileSync(fullPath, content, "utf-8")

      return {
        success: true,
        value: `File "${fullPath}" written successfully.\nSize: ${content.length} bytes`,
      }
    } catch (error: any) {
      console.error(
        chalk.red(`[TOOL - write] ⚠️ Failed to write file: ${error.message}`),
      )
      return {
        success: false,
        value: error.message,
      }
    }
  },
}
