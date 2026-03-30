import { z } from "zod";
import { JSDOM } from "jsdom";
import { assert } from "console";

export const internetSearch = {
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
};
