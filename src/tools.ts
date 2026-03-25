import { JSDOM } from "jsdom";
import { type ToolSet } from "ai";
import { z } from "zod";
import { execSync } from "child_process";
import { assert } from "console";

export const tools: ToolSet = {
  // deliver_final_answer: {
  //   description:
  //     "Use this tool to provide the final answer to the user once you have all the information.",
  //   inputSchema: z.object({
  //     answer: z
  //       .string()
  //       .describe("The complete, final response for the software developer."),
  //   }),
  //   execute: async ({ answer }) => ({ success: true, output: answer }),
  // },
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
  internetSearch: {
    description:
      "Search the internet. IMPORTANT: If the 'output' is truncated or missing key details, call this tool again with a significantly higher 'maxReadBodyLength' (e.g., 5000 or 10000) to see more content.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      maxReadBodyLength: z
        .number()
        .describe(
          "Number of characters to return from the fetched webpage body content. recommend to start with 2500",
        ),
    }),
    execute: async ({
      query,
      maxReadBodyLength,
    }: {
      query: string;
      maxReadBodyLength?: number;
    }) => {
      const apiKey = process.env.BRAVE_API_KEY || "";
      assert(
        apiKey,
        "BRAVE_API_KEY environment variable is required for internetSearch tool",
      );

      const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: "1" })}`;

      console.log("[internetSearch tool] Search: ", query);
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });
      if (!response.ok) {
        console.log(
          `[internetSearch tool] ⚠️ Search API error: ${response.status} ${response.statusText}`,
        );
        return {
          success: false,
          error: `Search API error: ${response.status} ${response.statusText}`,
        };
      }
      const data = await response.json();
      const { results } = data.web || {};
      if (!results || results.length === 0) {
        console.log("[internetSearch tool] ⚠️ No search results found");
        return {
          success: false,
          error: "No search results found",
        };
      }

      // console.log("[getting body]", results[0].url);
      console.log(
        "[internetSearch tool] Fetching content from:",
        results[0].url,
        maxReadBodyLength,
      );
      const html = await fetch(results[0].url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }).then((res) => res.text());
      const dom = new JSDOM(html, { url });
      const body = dom.window.document.body.textContent || "";
      // console.log("[return tool result]");
      return {
        success: true,
        output: `${body.slice(0, maxReadBodyLength)}\n\n[WARNING: Content truncated. Total length: ${body.length} chars. Increase maxReadBodyLength to see more.]`,
        metadata: {
          maxReadBodyLength,
        },
      };
    },
  },
};
