import { z } from "zod";
import { execSync } from "child_process";

export const bashTool = {
  description: "Execute a bash command and return its output",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
  }),
  execute: async ({ command }: { command: string }) => {
    console.log(`\n[bash tool] Executing command: ${command}`);
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
      console.error(`[bash tool] ⚠️ Command failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString() || "",
      };
    }
  },
};
