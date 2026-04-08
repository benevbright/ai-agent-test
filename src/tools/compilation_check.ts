import { z } from "zod";
import { execSync } from "child_process";
import chalk from "chalk";

export const compilationCheckTool = {
  description:
    "Run a compilation check command to verify code quality and catch errors. Useful for TypeScript (npm run lint && npx tsc --noEmit), JavaScript (npm run lint or similar), or other languages. This helps ensure changes don't break the build before committing.",
  inputSchema: z.object({
    commands: z
      .union([z.string(), z.array(z.string())])
      .describe(
        "A compilation check command or an array of commands to execute, e.g., 'npx tsc --noEmit' or ['npm run lint', 'npx tsc --noEmit'] for TypeScript or JavaScript projects",
      ),
  }),
  execute: async ({ commands }: { commands: string | string[] }) => {
    const commandList = Array.isArray(commands) ? commands : [commands];
    console.log(
      chalk.yellow(
        `\n[tool calling - compilationCheck] Running compilation checks: ${commandList.join(" && ")}`,
      ),
    );
    try {
      const result = execSync(commandList.join(" && "), {
        encoding: "utf-8",
        stdio: "pipe",
      });

      if (result.includes("error") || result.includes("Error")) {
        console.warn(
          chalk.yellow(
            `[tool calling - compilationCheck] ⚠️ Compilation check found issues.`,
          ),
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
        chalk.red(
          `[tool calling - compilationCheck] ⚠️ Compilation check failed: ${error.message}`,
        ),
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
