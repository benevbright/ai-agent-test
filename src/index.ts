import {
  streamText,
  type ModelMessage,
  type ToolContent,
  type ToolSet,
} from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { toolNames, tools, type ToolResult } from "./tools/index.js"
import chalk from "chalk"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import fs from "fs"
import path from "path"
import { homedir } from "os"
import { join } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import {
  appendMessageToLog,
  askQuestion,
  checkNpmUpdate,
  formatPath,
  loadSession,
  sessionDir,
} from "./utils/system.js"

// Get the directory of this module (works with ES modules)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from .env file (handled by CLI: npm run dev)

// Helper function to push to messages array and write to log
function pushMessage(message: ModelMessage) {
  messages.push(message)
  appendMessageToLog(message)
}

// Read configuration from environment variables set by bin/ai
const modelProvider = process.env.AI_MODEL_APITYPE as "openai" | "google"
const modelName = process.env.AI_MODEL_NAME || ""
const baseUrl = process.env.AI_API_BASE_URL || ""
const apiKey = process.env.AI_API_KEY || ""

let model: LanguageModelV3
let contextLength: number = 0 // 0 means not yet fetched

if (modelProvider === "google") {
  model = createGoogleGenerativeAI({
    baseURL: baseUrl,
    apiKey: apiKey,
  }).chat(modelName)
} else {
  model = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey,
  }).chat(modelName)
}

// Fetch context length from models API if available (only once)
async function fetchContextLength(): Promise<number> {
  // Only fetch if we still have the default value
  if (contextLength !== 0) {
    return contextLength
  }
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    const data = await response.json()

    // Try to find the model in different possible response formats
    const modelsArray = data.data || data
    const modelData = modelsArray.find((m: any) => m.id === modelName)

    if (modelData) {
      // Check for context_length in various locations
      contextLength = modelData.context_length || 0
      return contextLength
    }
  } catch {
    // Fail silently - use default fallback
  }
  return contextLength // return 0 if not found
}

const systemPromptPath = path.join(__dirname, "../SYSTEM.md")
let systemPrompt = fs.readFileSync(systemPromptPath, "utf-8")

// Check for user's custom SYSTEM.md in ~/.ai/ and append if exists
const userSystemPromptPath = join(homedir(), ".ai", "SYSTEM.md")
let userSystemPrompt = ""
try {
  userSystemPrompt = fs.readFileSync(userSystemPromptPath, "utf-8")
  systemPrompt += "\n\n---\n\nUser Custom System Prompt:\n" + userSystemPrompt
} catch {
  // User's SYSTEM.md doesn't exist, which is fine
}
// Check for additional system prompt from --system CLI option
const cliSystemPrompt = process.env.AI_SYSTEM_PROMPT || ""
if (cliSystemPrompt) {
  systemPrompt += "\n\n---\n\nCLI System Prompt\n" + cliSystemPrompt
}

// Check for single prompt from --prompt CLI option
const cliPrompt = process.env.AI_PROMPT || ""

// Build file metadata for system prompt
const currentDirName = path.basename(process.cwd())
const nestedSameNamePath = path.join(process.cwd(), currentDirName)
const fileMeta = `
- Current project: ${process.cwd()}
- ls: ${fs.readdirSync(process.cwd()).join(", ")}
- ls src: ${
  fs.existsSync(path.join(process.cwd(), "src"))
    ? fs.readdirSync(path.join(process.cwd(), "src")).join(", ")
    : "not found"
}
- ls lib: ${
  fs.existsSync(path.join(process.cwd(), "lib"))
    ? fs.readdirSync(path.join(process.cwd(), "lib")).join(", ")
    : "not found"
}
- ls packages: ${
  fs.existsSync(path.join(process.cwd(), "packages"))
    ? fs.readdirSync(path.join(process.cwd(), "packages")).join(", ")
    : "not found"
}
- ls ${currentDirName}: ${
  fs.existsSync(nestedSameNamePath)
    ? fs.readdirSync(nestedSameNamePath).join(", ")
    : "not found"
}
`

const criticalWorkflowRulesChatMode = `
- Always ask before making commits—never commit without explicit user approval. Even if the user told you to "commit" previously, ask if they want to commit/push the specific changes you just made.
- If you need more information to complete a task, ask the user a follow-up question using the "ask_user_followup" tool. Use this tool to break the loop if progress is stuck or if you are repeating the same solution.
`
const criticalWorkflowRulesSinglePromptMode = `
- Since you are running in single prompt mode, you won't have the chance to ask follow-up questions. If you are unsure about something, make a reasonable assumption and clearly state that assumption in your response.
- Don't finish your response with "let me know if you have any other questions" or similar, since there won't be an opportunity for follow-up questions.
`

systemPrompt = systemPrompt
  .replace("{date}", new Date().toLocaleString())
  .replace("{filemeta}", fileMeta)
  .replace(
    "{critical_workflow_rules}",
    cliPrompt
      ? criticalWorkflowRulesSinglePromptMode
      : criticalWorkflowRulesChatMode,
  )

let filteredTools: ToolSet
if (cliPrompt) {
  // In single prompt mode, we disable the ask_user_followup tool to avoid confusion since it can't be used
  filteredTools = Object.fromEntries(
    Object.entries(tools).filter(
      ([toolName]) => toolName !== toolNames.askUserFollowup,
    ),
  ) as ToolSet
} else {
  filteredTools = tools
}

let interruptRequested = false

// Check for loaded messages from a previous session via env var
const messages: ModelMessage[] = []
const sessionFile = process.env.AI_SESSION_FILE
if (sessionFile) {
  const loadedMessages = loadSession(sessionFile)
  if (loadedMessages) {
    messages.push(...loadedMessages)
    pushMessage({
      role: "assistant",
      content: `[The system resumed previous session from file ${sessionFile}. I better re-engage the chat with a short greeting to user to continue the conversation.]`,
    })
    console.log(
      chalk.green(
        `Loaded ${messages.length} messages from ${formatPath(path.join(sessionDir, sessionFile))} session file.`,
      ),
    )
  } else {
    console.error(chalk.red("Failed to load session."))
  }
}

async function runLoop(prompt: string) {
  pushMessage({
    role: "user",
    content: prompt,
  })

  // Reset interrupt flag
  interruptRequested = false

  // Set up ESC key listener
  const setupEscListener = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.on("data", onKeyPress)
    }
  }

  const cleanupEscListener = () => {
    if (process.stdin.isTTY) {
      process.stdin.removeListener("data", onKeyPress)
      process.stdin.setRawMode(false)
    }
  }

  const onKeyPress = (key: Buffer) => {
    // ESC key is 0x1b
    if (key[0] === 0x1b) {
      console.log(chalk.magenta("\n\n[Interrupt requested]"))
      interruptRequested = true
    }
  }

  setupEscListener()

  while (true) {
    const res = await streamText({
      model,
      messages,
      tools: filteredTools,
      system: systemPrompt,
    })

    let fullText = ""
    const toolCallsCollected: any[] = []
    const toolResultContent: ToolContent = []
    const toolResultsByCallId = new Map<string, ToolResult>()

    const formatToolResultMessage = (result: ToolResult) =>
      `Status: ${result.success ? "success" : "failure"}\n${result.value}`

    for await (const part of res.fullStream) {
      if (interruptRequested) {
        cleanupEscListener()
        return
      }

      if (part.type === "text-delta") {
        if (!fullText) {
          process.stdout.write(chalk.cyan("\nAssistant: "))
        }
        process.stdout.write(part.text)
        fullText += part.text
      } else if (part.type === "tool-call") {
        toolCallsCollected.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        })
      } else if (part.type === "tool-result") {
        const output = (part as any).output as Partial<ToolResult> | undefined
        const normalizedResult: ToolResult = {
          success: output?.success === true,
          value:
            typeof output?.value === "string"
              ? output.value
              : "Tool returned an invalid result payload.",
        }

        toolResultsByCallId.set(part.toolCallId, normalizedResult)
        toolResultContent.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: {
            type: "text",
            value: formatToolResultMessage(normalizedResult),
          },
        })
      }
    }

    const toolResultIds = new Set(
      toolResultContent.map((result) => (result as any).toolCallId),
    )
    for (const toolCall of toolCallsCollected) {
      if (!toolResultIds.has(toolCall.toolCallId)) {
        console.log(
          chalk.red(
            `Warning: Missing tool result for call ${toolCall.toolCallId} (${toolCall.toolName})`,
          ),
        )
        const message = Object.values(toolNames).includes(toolCall.toolName)
          ? `missing tool result for call ${toolCall.toolCallId} (${toolCall.toolName}).`
          : `the tool call ${toolCall.toolCallId} used an unknown tool (${toolCall.toolName}).`
        const normalizedResult: ToolResult = {
          success: false,
          value: `Tool execution failed: ${message}`,
        }
        toolResultsByCallId.set(toolCall.toolCallId, normalizedResult)
        toolResultContent.push({
          type: "tool-result",
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: {
            type: "text",
            value: formatToolResultMessage(normalizedResult),
          },
        })
      }
    }

    const usage = await res.usage

    const assistantContent: any[] = []
    if (fullText) {
      assistantContent.push({ type: "text", text: fullText })
    }
    for (const toolCall of toolCallsCollected) {
      assistantContent.push(toolCall)
    }

    if (assistantContent.length > 0) {
      pushMessage({
        role: "assistant",
        content: assistantContent,
      })
    }

    if (toolResultContent.length > 0) {
      pushMessage({
        role: "tool",
        content: toolResultContent,
      })
    }

    // Display token usage with percentage of context window
    if (contextLength > 0) {
      const percentage = (
        ((usage.totalTokens || 0) / contextLength) *
        100
      ).toFixed(1)
      console.log(
        chalk.gray(
          `\n\n[${modelName}] Token: ${usage.totalTokens || 0} (${percentage}%)`,
        ),
      )
    } else {
      // Only show token count without percentage if context length not available
      console.log(
        chalk.gray(`\n\n[${modelName}] Token: ${usage.totalTokens || 0}`),
      )
    }
    if (toolCallsCollected.length === 0) {
      break
    }
    const hasCompletedProgress = toolCallsCollected.some((toolCall) => {
      if (toolCall.toolName !== toolNames.recordProgress) {
        return false
      }

      const result = toolResultsByCallId.get(toolCall.toolCallId)
      return result?.success === true && result.value === "100"
    })
    if (hasCompletedProgress) {
      console.log("\nTask completed with 100% progress!")
      break
    }
    const followUpRes = toolCallsCollected.find(
      (toolCall) =>
        toolCall.toolName === toolNames.askUserFollowup &&
        toolResultsByCallId.has(toolCall.toolCallId),
    )
    if (followUpRes) {
      console.log(chalk.yellow("\n--- Waiting for user input ---"))
      break
    }
    if (interruptRequested) {
      break
    }
  }

  cleanupEscListener()
}

async function main() {
  // Fetch context length for percentage calculation
  await fetchContextLength()

  if (cliPrompt) {
    // Single prompt mode: run once and exit
    try {
      await runLoop(cliPrompt)
    } catch (error) {
      console.error(
        chalk.red(`Error in single prompt mode: ${(error as Error).message}`),
      )
      console.log(JSON.stringify(messages.slice(-10), null, 2))
      process.exit(1)
    }
    process.exit(0)
  }

  // Interactive mode
  console.log(chalk.cyan(`AI Agent Ready! (${formatPath(process.cwd())})\n`))
  const helpText = "interrupt: ESC, newline: Shift+Enter"
  let lastLine = helpText
  console.log(chalk.cyan(helpText))

  const updateInfo = await checkNpmUpdate()
  if (updateInfo?.show) {
    const updateText = `New version available! Run 'ai update' (${updateInfo.currentVersion} -> ${updateInfo.latestVersion})`
    lastLine = updateText
    console.log(chalk.cyan(`\n${updateText}`))
  }

  console.log(
    chalk.cyan(
      Array.from({ length: lastLine.length }).fill("=").join("") + "\n",
    ),
  )

  while (true) {
    console.log("")
    const userPrompt = await askQuestion("Prompt: ")

    if (userPrompt.toLowerCase() === "exit") {
      break
    }

    try {
      await runLoop(userPrompt)
    } catch (error) {
      console.error(
        chalk.red(`Error in main loop: ${(error as Error).message}`),
      )
      console.log(JSON.stringify(messages.slice(-10), null, 2))
      process.exit(1)
    }
  }
}

main()
