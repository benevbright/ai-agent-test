import { z } from "zod";
import fs from "fs";
import path from "path";
import chalk from "chalk";

export const writeTool = {
  description:
    "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Useful for creating new files or replacing entire file contents.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({
    path: filePath,
    content,
  }: {
    path: string;
    content: string;
  }) => {
    console.log(
      chalk.yellow(`\n[tool calling - write] Writing to file: ${filePath}`),
    );

    try {
      const fullPath = path.resolve(filePath);
      
      // Ensure directory exists
      const dirPath = path.dirname(fullPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(fullPath, content, "utf-8");
      
      return {
        success: true,
        output: `File "${fullPath}" written successfully.`,
        metadata: {
          path: fullPath,
          size: content.length,
        },
      };
    } catch (error: any) {
      console.error(
        chalk.red(`[tool calling - write] ⚠️ Failed to write file: ${error.message}`),
      );
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
