import { z } from "zod";
import fs from "fs";
import path from "path";
import chalk from "chalk";

export interface Edit {
  oldText: string;
  newText: string;
}

export const editTool = {
  description:
    "Make precise, targeted edits to existing files. Replace specific text patterns without rewriting the entire file. Use this for modifications when you want to keep most of the file intact and only change specific lines or sections.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to edit"),
    edits: z
      .array(
        z.object({
          oldText: z
            .string()
            .describe("The exact text for JS's `replace()` function"),
          newText: z.string().describe("The new text to insert"),
        }),
      )
      .describe(
        "Array of edits, each containing oldText and newText for exact match replacement",
      ),
  }),
  execute: async ({
    path: filePath,
    edits,
  }: {
    path: string;
    edits: Edit[];
  }) => {
    console.log(
      chalk.yellow(
        `\n[tool calling - edit] Editing file: ${filePath} (edits: ${edits.length})`,
      ),
    );

    try {
      const fullPath = path.resolve(filePath);

      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: `File not found: ${fullPath}`,
        };
      }

      let content = fs.readFileSync(fullPath, "utf-8");
      let editsApplied = 0;

      for (const edit of edits) {
        const existingContent = content;
        content = content.replace(edit.oldText, edit.newText);

        if (content !== existingContent) {
          editsApplied++;
        } else {
          console.warn(
            chalk.yellow(
              `[tool calling - edit] ⚠️ oldText not found in file: ${edit.oldText.substring(0, 50)}...`,
            ),
          );
        }
      }

      fs.writeFileSync(fullPath, content, "utf-8");

      return {
        success: true,
        output: `File "${fullPath}" edited successfully.\nEdits applied: ${editsApplied} out of ${edits.length}`,
        metadata: {
          path: fullPath,
          editsCount: editsApplied,
          totalEdits: edits.length,
        },
      };
    } catch (error: any) {
      console.error(
        chalk.red(
          `[tool calling - edit] ⚠️ Failed to edit file: ${error.message}`,
        ),
      );
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
