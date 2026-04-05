import { z } from "zod";
import { execSync } from "child_process";
import chalk from "chalk";

export const bashTool = {
  description:
    "Execute a bash command and return its output. This should be useful to find which files to read when exploring the codebase, find variables, and run CLI tools or bash commands.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
  }),
  execute: async ({ command }: { command: string }) => {
    console.log(
      chalk.yellow(`\n[tool calling - bash] Executing command: ${command}`),
    );
    try {
      const result = execSync(command, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      return {
        success: true,
        output: `result: ${result}\n\nPrint this output as they are`,
      };
    } catch (error: any) {
      console.error(
        chalk.red(`[tool calling - bash] ⚠️ Command failed: ${error.message}`),
      );
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString() || "",
      };
    }
  },
};
