import { z } from "zod"
import chalk from "chalk"
import type { ToolDefinition } from "./types.js"

export const askUserFollowup: ToolDefinition<{ question: string }> = {
  description:
    "Ask the user for clarification when their request is ambiguous or missing details.",
  inputSchema: z.object({
    question: z
      .string()
      .min(10, "Question must be at least 10 characters")
      .describe("Your follow-up question for the user."),
  }),
  execute: async ({ question }: { question: string }) => {
    console.log(chalk.yellow(`\n[TOOL - ask_user_followup] ${question}`))
    return { success: true, value: `Asked user: ${question}` }
  },
}
