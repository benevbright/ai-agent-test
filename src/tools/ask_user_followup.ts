import { z } from "zod";
import chalk from "chalk";

export const askUserFollowup = {
  description:
    "Use this to ask the user a follow-up question when you need specific information to proceed with their request. " +
    "Use this tool when:\n" +
    "- The user's request is ambiguous or missing key details\n" +
    "- You need clarification on requirements or preferences\n" +
    "- Multiple options are available and you need the user to make a choice\n" +
    "\nDo NOT use this for general conversation or as a replacement for direct responses.",
  inputSchema: z.object({
    question: z
      .string()
      .min(10, "Question must be at least 10 characters")
      .describe(
        "Your follow-up question for the user. Make it clear, specific, and focused on getting the information you need to proceed.",
      ),
  }),
  execute: async ({ question }: { question: string }) => {
    console.log(chalk.yellow(`\n[TOOL - ask_user_followup] ${question}`));
    return { success: true, output: `Asked user: ${question}` };
  },
};
