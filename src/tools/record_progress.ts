import { z } from "zod";
import chalk from "chalk";

export const recordProgress = {
  description:
    "REQUIRED: Call this tool after EVERY tool call to update your progress (0-100). You must call this before calling any other tool and before calling deliver_final_answer.",
  inputSchema: z.object({
    progress: z
      .number()
      .describe(
        "Your current progress as a percentage (0-100). This helps track how close you are to the final answer.",
      ),
  }),
  execute: async ({ progress }: { progress: number }) => {
    console.log(
      chalk.yellow(`\n[TOOL - record_progress] Current progress: ${progress}%`),
    );
    return { success: true, output: progress };
  },
};
