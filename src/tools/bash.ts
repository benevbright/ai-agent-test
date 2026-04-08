import { z } from "zod";
import { spawn } from "child_process";
import chalk from "chalk";

export const bashTool = {
  description:
    "Execute a bash command and return its output. This should be useful to find which files to read when exploring the codebase, find variables, and run CLI tools or bash commands.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z
      .number()
      .optional()
      .default(10)
      .describe(
        "Timeout in seconds for the command execution (default: 10). Set to null or 0 for no timeout.",
      ),
  }),
  execute: async ({
    command,
    timeout,
  }: {
    command: string;
    timeout?: number;
  }) => {
    console.log(
      chalk.yellow(
        `\n[tool calling - bash] Executing command (timeout: ${timeout}s): ${command}`,
      ),
    );
    return new Promise((resolve) => {
      const process = spawn("bash", ["-c", command], {
        stdio: ["pipe", "pipe", "pipe"] as any,
      });

      let isResolved = false;
      const markResolved = () => {
        if (!isResolved) {
          isResolved = true;
        }
      };

      let output = "";
      let stderrOutput = "";

      process.stdout.on("data", (data: Buffer) => {
        output += data.toString();
      });

      process.stderr.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });

      process.on("close", (code: number | null) => {
        markResolved();
        if (code === 0) {
          // Print first 2 lines of output for visibility
          const lines = output.trim().split("\n");
          if (lines.length > 0) {
            console.log(
              chalk.green(
                `[tool calling - bash] Output preview: ${lines[0]}...`,
              ),
            );
            if (lines.length > 1) {
              console.log(chalk.green(`[tool calling - bash] ${lines[1]}...`));
              if (lines.length > 2) {
                console.log(
                  chalk.green(
                    `[tool calling - bash] and ${lines.length - 2} more line(s)`,
                  ),
                );
              }
            }
          }
          resolve({
            success: true,
            output: `result: ${output}\n\nPrint this output as they are`,
          });
        } else {
          console.error(
            chalk.red(
              `[tool calling - bash] ⚠️ Command failed with code ${code}`,
            ),
          );
          resolve({
            success: false,
            error: `Command failed with code ${code}`,
            stderr: stderrOutput || undefined,
          });
        }
      });

      process.on("error", (error: Error) => {
        markResolved();
        console.error(
          chalk.red(
            `[tool calling - bash] ⚠️ Command failed: ${error.message}`,
          ),
        );
        resolve({
          success: false,
          error: error.message,
          stderr: undefined,
        });
      });

      // Set timeout
      let timeoutId: NodeJS.Timeout | null = null;
      if (timeout && timeout > 0) {
        const timeoutMs = timeout * 1000;
        timeoutId = setTimeout(() => {
          if (!isResolved && !process.killed) {
            process.kill("SIGTERM");
            console.error(
              chalk.red(
                `[tool calling - bash] ⚠️ Command timed out after ${timeout} seconds`,
              ),
            );
            resolve({
              success: false,
              error: `Command timed out after ${timeout} seconds`,
              stderr: "Process was terminated due to timeout.",
            });
          }
        }, timeoutMs);
      }
    });
  },
};
