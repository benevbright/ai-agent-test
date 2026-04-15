import { z } from "zod"
import chalk from "chalk"

export const recordProgress = {
  description: "Track task progress (0-100).",
  inputSchema: z.object({
    progress: z.number().describe("Current progress as a percentage (0-100)."),
  }),
  execute: async ({ progress }: { progress: number }) => {
    console.log(
      chalk.yellow(`\n[TOOL - record_progress] Current progress: ${progress}%`),
    )
    return { success: true, output: progress }
  },
}
