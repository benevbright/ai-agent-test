import { z } from "zod";
import chalk from "chalk";

export const askUserFollowup = {
  description:
    "Use this to ask the user a follow-up question if you need more information during the conversatino with user.",
  inputSchema: z.object({
    question: z
      .string()
      .describe(
        "Your follow-up question for the user. Make sure it's clear and specific to get the information you need.",
      ),
  }),
  execute: async ({ question }: { question: string }) => {
    console.log(chalk.yellow(`\nAsking user: ${question}`));
    return { success: true, output: `Asked user: ${question}` };
  },
};
