import { z } from "zod"
import chalk from "chalk"
import type { ToolDefinition } from "./types.js"

export const recordProgress: ToolDefinition<{ progress: number }> = {
  description: "Track task progress (0-100).",
  inputSchema: z.object({
    progress: z.number().describe("Current progress as a percentage (0-100)."),
  }),
  execute: async ({ progress }: { progress: number }) => {
    console.log(
      chalk.yellow(`\n[TOOL - record_progress] Current progress: ${progress}%`),
    )
    return { success: true, value: String(progress) }
  },
}
