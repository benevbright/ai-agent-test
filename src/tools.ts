import { JSDOM } from "jsdom";
import { type ToolSet } from "ai";
import { z } from "zod";
import { execSync } from "child_process";
import { assert } from "console";

export const tools: ToolSet = {
  bash: {
    description: "Execute a bash command and return its output",
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
    }),
    execute: async ({ command }: { command: string }) => {
      console.log(`Executing command: ${command}`);
      try {
        const result = execSync(command, {
          encoding: "utf-8",
          stdio: "pipe",
        });
        return {
          success: true,
          output: result,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stderr: error.stderr?.toString() || "",
        };
      }
    },
  },
  internetSearch: {
    description: "Search the internet for information",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      sliceFetchedBodyContent: z
        .number()
        .describe(
          "Number of characters to return from the fetched webpage body content. start with 3000.",
        )
        .default(3000),
    }),
    execute: async ({
      query,
      sliceFetchedBodyContent,
    }: {
      query: string;
      sliceFetchedBodyContent?: number;
    }) => {
      const apiKey = process.env.BRAVE_API_KEY || "";
      assert(
        apiKey,
        "BRAVE_API_KEY environment variable is required for internetSearch tool",
      );

      const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: "1" })}`;

      console.log("[brave search]", query, sliceFetchedBodyContent);
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });
      if (!response.ok) {
        return {
          success: false,
          error: `Search API error: ${response.status} ${response.statusText}`,
        };
      }
      const data = await response.json();
      const { results } = data.web || {};
      if (!results || results.length === 0) {
        return {
          success: false,
          error: "No search results found",
        };
      }

      console.log("[getting body]", results[0].url);
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
      console.log("[return tool result]");
      return {
        success: true,
        output: body.slice(0, sliceFetchedBodyContent),
      };
    },
  },
};
