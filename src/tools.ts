import { z } from "zod";
import { execSync } from "child_process";

export const tools = {
  bash: {
    description: "Execute a bash command and return its output",
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
    }),
    execute: async ({ command }: { command: string }) => {
      console.log(`Executing command: ${command}`);
      try {
        const result = execSync(command, {
          encoding: "utf-8",
          stdio: "pipe",
        });
        return {
          success: true,
          output: result,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stderr: error.stderr?.toString() || "",
        };
      }
    },
  },
};
