import { z } from "zod";
import { execSync } from "child_process";
import chalk from "chalk";

export const compilationCheckTool = {
  description:
    "Run a compilation check command to verify code quality and catch errors. Useful for TypeScript (npx tsc --noEmit), JavaScript (npm run lint or similar), or other languages. This helps ensure changes don't break the build before committing.",
  inputSchema: z.object({
    command: z.string().describe("The compilation check command to execute, e.g., 'npx tsc --noEmit' for TypeScript or 'npm run lint' for JavaScript"),
  }),
  execute: async ({ command }: { command: string }) => {
    console.log(
      chalk.yellow(`\n[tool calling - compilationCheck] Running compilation check: ${command}`),
    );
    try {
      const result = execSync(command, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      
      if (result.includes("error") || result.includes("Error")) {
        console.warn(
          chalk.yellow(`[tool calling - compilationCheck] ⚠️ Compilation check found issues.`),
        );
        return {
          success: false,
          output: "Compilation check found errors:\n" + result,
        };
      }
      
      return {
        success: true,
        output: "Compilation check passed successfully.\n" + result,
      };
    } catch (error: any) {
      console.error(
        chalk.red(`[tool calling - compilationCheck] ⚠️ Compilation check failed: ${error.message}`),
      );
      return {
        success: false,
        error: error.message,
        output: error.stdout?.toString() || "",
        stderr: error.stderr?.toString() || "",
      };
    }
  },
};
