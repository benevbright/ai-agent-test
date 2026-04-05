import { z } from "zod";
import fs from "fs";
import path from "path";
import chalk from "chalk";

export const readTool = {
  description:
    "Read a file and return its contents. Useful for viewing source code, configuration files, documentation, or any text-based files.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to read"),
    offset: z
      .number()
      .optional()
      .describe(
        "The line number to start reading from (1-indexed). Default is 1 (start of file).",
      ),
    limit: z
      .number()
      .optional()
      .describe(
        "Maximum number of lines to read. If not specified, reads the entire file.",
      ),
  }),
  execute: async ({
    path: filePath,
    offset = 1,
    limit,
  }: {
    path: string;
    offset?: number;
    limit?: number;
  }) => {
    console.log(
      chalk.yellow(`\n[tool calling - read] Reading file: ${filePath}`),
    );

    try {
      // Resolve the path relative to current working directory
      const fullPath = path.resolve(filePath);
      
      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${fullPath}`,
        };
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      // Calculate start and end indices
      const startIndex = Math.max(0, offset - 1);
      const endIndex = limit ? Math.min(lines.length, startIndex + limit) : lines.length;

      if (startIndex >= lines.length) {
        return {
          success: true,
          output: `File "${fullPath}" has ${lines.length} lines. Offset ${offset} is beyond file end.`,
        };
      }

      const selectedLines = lines.slice(startIndex, endIndex);
      const resultContent = selectedLines.join("\n");

      let metadata = `\n\n[Read tool metadata:`;
      metadata += `\n  File: ${fullPath}`;
      metadata += `\n  Total lines in file: ${lines.length}`;
      metadata += `\n  Offset: ${offset}`;
      if (limit) {
        metadata += `\n  Limit: ${limit}`;
      }
      metadata += `\n  Lines returned: ${selectedLines.length}`;
      metadata += `\n]`;

      return {
        success: true,
        output: resultContent + metadata,
      };
    } catch (error: any) {
      console.error(
        chalk.red(`[tool calling - read] ⚠️ Failed to read file: ${error.message}`),
      );
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
