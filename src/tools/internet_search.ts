import { z } from "zod"
import chalk from "chalk"
import { searchWeb, tryFetchExtractedPageContent } from "./web_retrieval.js"

export const internetSearch = {
  description: "Search the internet for general queries.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    searchCount: z
      .number()
      .max(5)
      .default(3)
      .optional()
      .describe("Number of results (max 5)."),
    maxReadBodyLength: z
      .number()
      .default(2500)
      .describe("Characters per page to return."),
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
    console.log(chalk.yellow(`\n[TOOL - internet_search] Search: ${query}`))
    let results
    try {
      results = await searchWeb({
        query,
        count: searchCount,
      })
    } catch (error: any) {
      console.log(chalk.red(`\n[TOOL - internet_search] ⚠️ ${error.message}`))
      return {
        success: false,
        error: error.message,
      }
    }

    // Handle error case from searchWeb
    if (!results || "error" in results) {
      return {
        success: false,
        error: results?.error || "No search results found",
      }
    }

    if (results.length === 0) {
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

        const pageResult = await tryFetchExtractedPageContent({
          url: result.url,
          maxLength: maxReadBodyLength,
        })

        if (!pageResult.success) {
          console.log(
            chalk.red(
              `[TOOL - internet_search] ⚠️ Failed to fetch ${result.url}: ${pageResult.error}`,
            ),
          )
          return {
            url: result.url,
            title: result.title,
            description: result.description,
            content: `[fetch failed] ${pageResult.error}`,
          }
        }

        return {
          url: result.url,
          title: result.title,
          description: result.description,
          content: pageResult.content,
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
