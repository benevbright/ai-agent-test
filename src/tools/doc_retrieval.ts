import chalk from "chalk"
import { z } from "zod"
import {
  searchWeb,
  tryFetchExtractedPageContent,
  type WebSearchResult,
} from "./web_retrieval.js"

interface RankedSearchResult extends WebSearchResult {
  score: number
  reasons: string[]
}

interface RetrievedDocument extends RankedSearchResult {
  content?: string
  error?: string
}

const DOC_HOST_BONUS = new Set([
  "developer.mozilla.org",
  "docs.github.com",
  "docs.python.org",
])

const LOW_SIGNAL_HOST_PENALTIES = new Set([
  "dev.to",
  "medium.com",
  "hashnode.com",
  "reddit.com",
  "stackoverflow.com",
  "geeksforgeeks.org",
])

const KNOWN_DOC_DOMAINS = [
  { match: /\bpostgres(?:ql)?\b/i, domains: ["postgresql.org"] },
  { match: /\breact\b/i, domains: ["react.dev"] },
  { match: /\bnext(?:\.js|js)?\b/i, domains: ["nextjs.org"] },
  { match: /\bnode(?:\.js|js)?\b/i, domains: ["nodejs.org"] },
  { match: /\btypescript\b/i, domains: ["typescriptlang.org"] },
  { match: /\bjavascript\b|\bmdn\b/i, domains: ["developer.mozilla.org"] },
  { match: /\bprisma\b/i, domains: ["prisma.io"] },
  { match: /\btailwind\b/i, domains: ["tailwindcss.com"] },
  { match: /\bvite\b/i, domains: ["vite.dev"] },
  { match: /\bopenai\b/i, domains: ["platform.openai.com"] },
  { match: /\banthropic\b|\bclaude\b/i, domains: ["docs.anthropic.com"] },
] as const

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
}

function normalizeUrl(url: string): string {
  return url.replace(/[),.;!?]+$/, "")
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s]+/g) || []
  return uniqueStrings(matches.map(normalizeUrl))
}

function getHostname(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
}

function getPathname(url: string): string {
  return new URL(url).pathname.toLowerCase()
}

function inferDocDomains(query: string): string[] {
  const domains: string[] = []

  for (const candidate of KNOWN_DOC_DOMAINS) {
    if (candidate.match.test(query)) {
      domains.push(...candidate.domains)
    }
  }

  return uniqueStrings(domains)
}

function buildSearchQueries({
  query,
  preferredDomains,
}: {
  query: string
  preferredDomains: string[]
}): string[] {
  const queries = [`${query} official documentation`, `${query} docs`]

  for (const domain of preferredDomains.slice(0, 4)) {
    queries.push(`site:${domain} ${query}`)
  }

  return uniqueStrings(queries)
}

function scoreSearchResult({
  result,
  preferredDomains,
}: {
  result: WebSearchResult
  preferredDomains: string[]
}): RankedSearchResult {
  const reasons: string[] = []
  let score = 0

  try {
    const hostname = getHostname(result.url)
    const pathname = getPathname(result.url)
    const titleAndDescription =
      `${result.title} ${result.description || ""}`.toLowerCase()

    if (
      preferredDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    ) {
      score += 45
      reasons.push("preferred domain")
    }

    if (hostname.startsWith("docs.")) {
      score += 18
      reasons.push("docs subdomain")
    }

    if (DOC_HOST_BONUS.has(hostname)) {
      score += 25
      reasons.push("trusted documentation host")
    }

    if (
      /(\/docs?\/|\/reference\/|\/api\/|\/guide\/|\/manual\/|\/learn\/)/.test(
        pathname,
      )
    ) {
      score += 14
      reasons.push("documentation path")
    }

    if (
      /(docs|documentation|reference|guide|manual)/.test(titleAndDescription)
    ) {
      score += 10
      reasons.push("documentation title")
    }

    if (
      /(blog|news|release notes)/.test(titleAndDescription) ||
      pathname.includes("/blog/")
    ) {
      score -= 10
      reasons.push("blog-like result")
    }

    if (LOW_SIGNAL_HOST_PENALTIES.has(hostname)) {
      score -= 25
      reasons.push("low-signal host")
    }
  } catch {
    score -= 100
    reasons.push("invalid url")
  }

  return {
    ...result,
    score,
    reasons,
  }
}

function dedupeResults(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>()
  const deduped: WebSearchResult[] = []

  for (const result of results) {
    const normalizedUrl = normalizeUrl(result.url)
    if (seen.has(normalizedUrl)) {
      continue
    }
    seen.add(normalizedUrl)
    deduped.push({
      ...result,
      url: normalizedUrl,
    })
  }

  return deduped
}

async function resolveCandidateUrls({
  query,
  explicitUrls,
  preferredDomains,
  maxResults,
}: {
  query: string
  explicitUrls: string[]
  preferredDomains: string[]
  maxResults: number
}): Promise<{
  rankedResults: RankedSearchResult[]
  searchQueries: string[]
}> {
  const explicitResults: WebSearchResult[] = explicitUrls.map((url) => ({
    url,
    title: url,
    description: "Explicit URL from request",
  }))

  const needsSearch = explicitResults.length < maxResults
  const searchQueries = needsSearch
    ? buildSearchQueries({ query, preferredDomains })
    : []

  const discoveredResults = needsSearch
    ? (
        await Promise.all(
          searchQueries.slice(0, 5).map((searchQuery) =>
            searchWeb({
              query: searchQuery,
              count: Math.min(3, maxResults),
            })
              .then((results) => (Array.isArray(results) ? results : []))
              .catch(() => []),
          ),
        )
      ).flat()
    : []

  const rankedResults = dedupeResults([
    ...explicitResults,
    ...discoveredResults,
  ])
    .map((result) =>
      scoreSearchResult({
        result,
        preferredDomains,
      }),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults)

  return {
    rankedResults,
    searchQueries,
  }
}

export const docRetrieval = {
  description:
    "Retrieve documentation pages for libraries, frameworks, platforms, databases, and other technologies. This tool can discover official docs automatically, prefers authoritative sources, and reads more content per page than general internet search. Set maxReadBodyLength to 0 to disable truncation.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The documentation question or topic to research."),
    urls: z
      .array(z.string().url())
      .optional()
      .describe(
        "Optional documentation URLs to fetch directly before searching.",
      ),
    preferredDomains: z
      .array(z.string())
      .optional()
      .describe(
        "Optional preferred domains such as react.dev or postgresql.org.",
      ),
    maxResults: z
      .number()
      .max(5)
      .default(3)
      .optional()
      .describe("Maximum number of documentation pages to return."),
    maxReadBodyLength: z
      .number()
      .default(12000)
      .optional()
      .describe(
        "Approximate characters to return from each page after extraction. Use 0 for no truncation.",
      ),
  }),
  execute: async ({
    query,
    urls = [],
    preferredDomains = [],
    maxResults = 3,
    maxReadBodyLength = 12000,
  }: {
    query: string
    urls?: string[]
    preferredDomains?: string[]
    maxResults?: number
    maxReadBodyLength?: number
  }) => {
    const explicitUrls = uniqueStrings([...urls, ...extractUrls(query)])
    const resolvedDomains = uniqueStrings([
      ...preferredDomains.map(normalizeDomain),
      ...inferDocDomains(query),
    ])

    console.log(chalk.yellow(`\n[TOOL - doc_retrieval] Query: ${query}`))
    if (resolvedDomains.length > 0) {
      console.log(
        chalk.green(
          `[TOOL - doc_retrieval] Preferred domains: ${resolvedDomains.join(", ")}`,
        ),
      )
    }

    const { rankedResults, searchQueries } = await resolveCandidateUrls({
      query,
      explicitUrls,
      preferredDomains: resolvedDomains,
      maxResults,
    })

    if (rankedResults.length === 0) {
      return {
        success: false,
        error: "No documentation results found",
      }
    }

    const documents: RetrievedDocument[] = await Promise.all(
      rankedResults.map(async (result, index) => {
        console.log(
          chalk.green(
            `[TOOL - doc_retrieval] Result ${index + 1}: ${result.title} - ${result.url}`,
          ),
        )

        const pageResult = await tryFetchExtractedPageContent(
          maxReadBodyLength
            ? {
                url: result.url,
                maxLength: maxReadBodyLength,
              }
            : {
                url: result.url,
              },
        )

        if (pageResult.success) {
          return {
            ...result,
            content: pageResult.content,
          }
        }

        return {
          ...result,
          error: pageResult.error,
        }
      }),
    )

    const successfulDocuments = documents.filter((document) => document.content)
    if (successfulDocuments.length === 0) {
      return {
        success: false,
        error: "Unable to fetch any documentation pages",
      }
    }

    const output = documents
      .map((document, index) =>
        [
          `## Doc ${index + 1}: ${document.title}`,
          `URL: ${document.url}`,
          `Score: ${document.score}`,
          document.reasons.length > 0
            ? `Why selected: ${document.reasons.join(", ")}`
            : "",
          document.description ? `Summary: ${document.description}` : "",
          "",
          document.error
            ? `[fetch failed] ${document.error}`
            : document.content || "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n---\n\n")

    const truncationNotice = maxReadBodyLength
      ? `[Content limited to about ${maxReadBodyLength} characters per page. Increase maxReadBodyLength or set it to 0 if needed.]`
      : "[Content is not truncated.]"

    return {
      success: true,
      output: `${output}\n\n${truncationNotice}`,
      metadata: {
        maxResults,
        maxReadBodyLength,
        preferredDomains: resolvedDomains,
        searchQueries,
        resultCount: successfulDocuments.length,
      },
    }
  },
}
