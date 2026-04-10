import { z } from "zod"
import { JSDOM } from "jsdom"
import { assert } from "console"
import chalk from "chalk"

const CONTENT_CANDIDATE_SELECTORS = [
  "article",
  "main",
  "[role='main']",
  "#content",
  ".content",
  ".main-content",
  ".post-content",
  ".entry-content",
  ".article-content",
]

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "form",
  "nav",
  "header",
  "footer",
  "aside",
  "dialog",
  "button",
  "input",
  "select",
  "textarea",
  "[role='banner']",
  "[role='navigation']",
  "[role='complementary']",
  "[role='dialog']",
  "[aria-hidden='true']",
  "[hidden]",
  ".nav",
  ".navbar",
  ".menu",
  ".sidebar",
  ".footer",
  ".header",
  ".advertisement",
  ".ads",
  ".cookie",
  ".newsletter",
  ".share",
  ".social",
  ".popup",
  ".modal",
]

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function cleanInlineText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim()
}

function removeNoise(root: Element | Document): void {
  for (const selector of NOISE_SELECTORS) {
    root.querySelectorAll(selector).forEach((element) => element.remove())
  }
}

function scoreContentCandidate(element: Element): number {
  const textLength = collapseWhitespace(element.textContent || "").length
  const paragraphCount = element.querySelectorAll("p").length
  const headingCount = element.querySelectorAll("h1, h2, h3").length
  return textLength + paragraphCount * 120 + headingCount * 80
}

function pickContentRoot(document: Document): Element {
  const candidates = CONTENT_CANDIDATE_SELECTORS.flatMap((selector) =>
    Array.from(document.querySelectorAll(selector)),
  )

  const bestCandidate = candidates
    .map((element) => ({ element, score: scoreContentCandidate(element) }))
    .sort((left, right) => right.score - left.score)[0]

  return bestCandidate?.element || document.body
}

function renderNode(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return collapseWhitespace(node.textContent || "")
  }

  if (!(node instanceof node.ownerDocument!.defaultView!.HTMLElement)) {
    return ""
  }

  const element = node
  const tagName = element.tagName.toLowerCase()
  const renderedChildren = Array.from(element.childNodes)
    .map((child) => renderNode(child))
    .join("")

  if (tagName === "br") {
    return "\n"
  }

  if (tagName === "hr") {
    return "\n---\n\n"
  }

  if (tagName === "a") {
    const text = collapseWhitespace(
      renderedChildren || element.textContent || "",
    )
    const href = element.getAttribute("href") || ""
    if (!text) {
      return ""
    }
    if (!href || href.startsWith("#")) {
      return text
    }
    return `[${text}](${href})`
  }

  if (
    tagName === "code" &&
    element.parentElement?.tagName.toLowerCase() !== "pre"
  ) {
    const text = collapseWhitespace(element.textContent || "")
    return text ? `\`${text}\`` : ""
  }

  if (tagName === "pre") {
    const text = (element.textContent || "").trim()
    return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : ""
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName[1])
    const text = collapseWhitespace(
      renderedChildren || element.textContent || "",
    )
    return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : ""
  }

  if (tagName === "p") {
    const text = cleanInlineText(renderedChildren)
    return text ? `${text}\n\n` : ""
  }

  if (tagName === "blockquote") {
    const text = cleanInlineText(renderedChildren)
    return text
      ? `${text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n\n`
      : ""
  }

  if (tagName === "li") {
    const text = cleanInlineText(renderedChildren)
    return text ? `- ${text}\n` : ""
  }

  if (tagName === "ul" || tagName === "ol") {
    const text = cleanInlineText(renderedChildren)
    return text ? `${text}\n` : ""
  }

  if (tagName === "table") {
    const rows = Array.from(element.querySelectorAll("tr"))
      .map((row) =>
        Array.from(row.querySelectorAll("th, td"))
          .map((cell) => collapseWhitespace(cell.textContent || ""))
          .filter(Boolean)
          .join(" | "),
      )
      .filter(Boolean)
    return rows.length > 0 ? `${rows.join("\n")}\n\n` : ""
  }

  if (["section", "article", "main", "div"].includes(tagName)) {
    const text = cleanInlineText(renderedChildren)
    return text ? `${text}\n\n` : ""
  }

  return renderedChildren
}

function extractMarkdownFromHtml(html: string, pageUrl: string): string {
  const dom = new JSDOM(html, { url: pageUrl })
  const { document } = dom.window
  removeNoise(document)
  const contentRoot = pickContentRoot(document)
  removeNoise(contentRoot)
  return cleanInlineText(renderNode(contentRoot))
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content
  }

  const truncated = content.slice(0, maxLength)
  const lastParagraphBreak = truncated.lastIndexOf("\n\n")
  const lastSentenceBreak = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? "),
  )
  const cutIndex = Math.max(lastParagraphBreak, lastSentenceBreak)

  return `${truncated.slice(0, cutIndex > maxLength * 0.6 ? cutIndex + 1 : maxLength).trim()}\n\n[truncated]`
}

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

    const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: searchCount.toString() })}`

    console.log(chalk.yellow(`\n[TOOL - internet_search] Search: ${query}`))
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    })
    if (!response.ok) {
      console.log(
        chalk.red(
          `\n[TOOL - internet_search] ⚠️ Search API error: ${response.status} ${response.statusText}`,
        ),
      )
      return {
        success: false,
        error: `Search API error: ${response.status} ${response.statusText}`,
      }
    }
    const data = await response.json()
    const { results } = data.web || {}
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
        const html = await fetch(result.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        }).then((res) => res.text())
        const content = truncateContent(
          extractMarkdownFromHtml(html, result.url),
          maxReadBodyLength,
        )
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
