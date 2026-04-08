import { z } from "zod";
import fs from "fs";
import path from "path";
import chalk from "chalk";

export const writeTool = {
  description:
    "WRITE FILE CONTENTS ENTIRELY. Overwrites the entire existing file content with new content. Use this ONLY when you need to replace the complete file contents or create a new file. Not suitable for targeted changes to specific parts of a file.",
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
    console.log(chalk.yellow(`\n[TOOL - write] Writing to file: ${filePath}`));

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
        chalk.red(`[TOOL - write] ⚠️ Failed to write file: ${error.message}`),
      );
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
