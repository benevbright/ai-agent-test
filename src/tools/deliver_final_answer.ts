import chalk from "chalk";
import z from "zod";

export const deliverFinalAnswer = {
  description:
    "REQUIRED: Use this to submit your final response. DO NOT just type the answer. You must use this tool to end the process.",
  inputSchema: z.object({
    answer: z
      .string()
      .describe("The final markdown-formatted answer for the developer."),
  }),
  execute: async ({ answer: _answer }: { answer: string }) => {
    console.log(chalk.yellow("\n[tool calling - deliver_final_answer] Delivering final answer..."));
    return { success: true, output: "Answer delivered." };
  },
};
