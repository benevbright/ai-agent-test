import { z } from "zod"
import { assert } from "console"
import chalk from "chalk"
import { fetchExtractedPageContent, searchWeb } from "./web_retrieval.js"

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
      .default(2500)
      .describe(
        "Number of characters to return from the fetched webpage body content. recommend to start with 2500",
      ),
  }),
  execute: async ({
    searchCount,
    query,
    maxReadBodyLength,
  }: {
    searchCount: number
    query: string
    maxReadBodyLength: number
  }) => {
    const apiKey = process.env.BRAVE_API_KEY || ""
    assert(
      apiKey,
      "BRAVE_API_KEY environment variable is required for internetSearch tool",
    )

    console.log(chalk.yellow(`\n[TOOL - internet_search] Search: ${query}`))
    let results
    try {
      results = await searchWeb({
        query,
        count: searchCount,
        apiKey,
      })
    } catch (error: any) {
      console.log(chalk.red(`\n[TOOL - internet_search] ⚠️ ${error.message}`))
      return {
        success: false,
        error: error.message,
      }
    }

    if (!results || results.length === 0) {
      console.log(
        chalk.red("[TOOL - internet_search] ⚠️ No search results found"),
      )
      return {
        success: false,
        error: "No search results found",
      }
    }

    const contents = await Promise.all(
      results.map(async (result: any, index: number) => {
        console.log(
          chalk.green(
            `[TOOL - internet_search] Result ${index + 1}: ${result.title} - ${result.url}`,
          ),
        )
        const content = await fetchExtractedPageContent({
          url: result.url,
          maxLength: maxReadBodyLength,
        })
        return {
          url: result.url,
          title: result.title,
          description: result.description,
          content,
        }
      }),
    )

    const output = contents
      .map((result, index) =>
        [
          `## Result ${index + 1}: ${result.title}`,
          `URL: ${result.url}`,
          result.description ? `Summary: ${result.description}` : "",
          "",
          result.content,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n---\n\n")

    return {
      success: true,
      output: `${output}\n\n[Content limited to about ${maxReadBodyLength} characters per page. Increase maxReadBodyLength if needed.]`,
      metadata: {
        maxReadBodyLength,
        resultCount: contents.length,
      },
    }
  },
}
