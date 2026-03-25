import { JSDOM } from "jsdom";
import { type ToolSet } from "ai";
import { z } from "zod";
import { execSync } from "child_process";
import { assert } from "console";
import chalk from "chalk";

export const tools: ToolSet = {
  // deliver_final_answer: {
  //   description:
  //     "REQUIRED: Use this to submit your final response. DO NOT just type the answer. You must use this tool to end the process.",
  //   inputSchema: z.object({
  //     answer: z
  //       .string()
  //       .describe("The final markdown-formatted answer for the developer."),
  //   }),
  //   execute: async ({ answer }) => {
  //     console.log(chalk.yellow("\nDelivering final answer..."));
  //     return { success: true, output: "Answer delivered." };
  //   },
  // },
  ask_user_followup: {
    description:
      "OPTIONAL: Use this to ask the user a follow-up question if you need more information to complete the task. You can call this multiple times if needed.",
    inputSchema: z.object({
      question: z
        .string()
        .describe(
          "Your follow-up question for the user. Make sure it's clear and specific to get the information you need.",
        ),
    }),
    execute: async ({ question }) => {
      console.log(chalk.yellow(`Asking user: ${question}`));
      return { success: true, output: `Asked user: ${question}` };
    },
  },
  record_progress: {
    description:
      "REQUIRED: Call this tool after EVERY tool call to update your progress (0-100). You must call this before calling any other tool and before calling deliver_final_answer.",
    inputSchema: z.object({
      progress: z
        .number()
        .describe(
          "Your current progress as a percentage (0-100). This helps track how close you are to the final answer.",
        ),
    }),
    execute: async ({ progress }: { progress: number }) => {
      console.log(
        chalk.yellow(`[Progress Update] Current progress: ${progress}%`),
      );
      return { success: true, output: progress };
    },
  },
  bash: {
    description: "Execute a bash command and return its output",
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
    }),
    execute: async ({ command }: { command: string }) => {
      console.log(`[bash tool] Executing command: ${command}`);
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
  },
  internet_search: {
    description:
      "Search the internet. IMPORTANT: If the 'output' is truncated or missing key details, call this tool again with a significantly higher 'maxReadBodyLength' (e.g., 5000 or 10000) to see more content.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      searchCount: z
        .number()
        .max(5)
        .default(3)
        .optional()
        .describe(
          "Number of search results to return (default 3, max 5). More results may provide more information but will take longer to fetch and process.",
        ),
      maxReadBodyLength: z
        .number()
        .describe(
          "Number of characters to return from the fetched webpage body content. recommend to start with 2500",
        ),
    }),
    execute: async ({
      searchCount,
      query,
      maxReadBodyLength,
    }: {
      searchCount: number;
      query: string;
      maxReadBodyLength?: number;
    }) => {
      const apiKey = process.env.BRAVE_API_KEY || "";
      assert(
        apiKey,
        "BRAVE_API_KEY environment variable is required for internetSearch tool",
      );

      const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: searchCount.toString() })}`;

      console.log("[internet_search tool] Search: ", query);
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });
      if (!response.ok) {
        console.log(
          `[internet_search tool] ⚠️ Search API error: ${response.status} ${response.statusText}`,
        );
        return {
          success: false,
          error: `Search API error: ${response.status} ${response.statusText}`,
        };
      }
      const data = await response.json();
      const { results } = data.web || {};
      if (!results || results.length === 0) {
        console.log("[internet_search tool] ⚠️ No search results found");
        return {
          success: false,
          error: "No search results found",
        };
      }

      const contents = await Promise.all(
        results.map(async (result: any, index: number) => {
          console.log(
            `[internet_search tool] Result ${index + 1}: ${result.title} - ${result.url}`,
          );
          const html = await fetch(result.url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          }).then((res) => res.text());
          const dom = new JSDOM(html, { url });
          const body = dom.window.document.body.textContent || "";
          return {
            url: result.url,
            title: result.title,
            body: body.slice(0, maxReadBodyLength),
          };
        }),
      );
      // console.log("[return tool result]");
      return {
        success: true,
        output: `${JSON.stringify(contents, null, 2)}\n\n[WARNING: Content truncated at current maxReadBodyLength: ${maxReadBodyLength} characters. Increase maxReadBodyLength to see more.]`,
        metadata: {
          maxReadBodyLength,
        },
      };
    },
  },
};
