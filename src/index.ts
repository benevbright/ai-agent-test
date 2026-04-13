import { streamText, type ModelMessage, type ToolContent } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { toolNames, tools } from "./tools/index.js"
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
} from "./utils/system.js"
import dotenv from "dotenv"

// Load environment variables from .env file
dotenv.config()

// Get the directory of this module (works with ES modules)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

systemPrompt = systemPrompt
  .replace("{date}", new Date().toLocaleString())
  .replace("{pwd}", process.cwd())
  .replace("{ls}", fs.readdirSync(process.cwd()).join(", "))
  .replace(
    "{ls src}",
    fs.existsSync(path.join(process.cwd(), "src"))
      ? fs.readdirSync(path.join(process.cwd(), "src")).join(", ")
      : "not found",
  )
  .replace(
    "{ls packages}",
    fs.existsSync(path.join(process.cwd(), "packages"))
      ? fs.readdirSync(path.join(process.cwd(), "packages")).join(", ")
      : "not found",
  )

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
      chalk.green(`Loaded ${messages.length} messages from previous session.`),
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
      tools,
      system: systemPrompt,
    })

    let fullText = ""
    const toolCallsCollected: any[] = []
    const toolResultContent: ToolContent = []

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
        const output = (part as any).output
        if (output && output.success) {
          toolResultContent.push({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: {
              type: "text",
              value:
                output.output +
                (output.metadata
                  ? `\n\n[meta: ${JSON.stringify(output.metadata)}]`
                  : ""),
            },
          })
        } else {
          toolResultContent.push({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: {
              type: "text",
              value: output?.stderr || output?.error || "Unknown error",
            },
          })
        }
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
        toolResultContent.push({
          type: "tool-result",
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: {
            type: "text",
            value: `Tool execution failed: ${message}`,
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
    const progressRes = toolResultContent.find(
      (result) => (result as any).toolName === toolNames.recordProgress,
    )
    if (progressRes && (progressRes as any).output?.value === 100) {
      console.log("\nTask completed with 100% progress!")
      break
    }
    const followUpRes = toolResultContent.find(
      (result) => (result as any).toolName === toolNames.askUserFollowup,
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
  console.log(chalk.cyan(`AI Agent Ready! (${formatPath(process.cwd())})\n`))
  const helpText = "interrupt: ESC, newline: Shift+Enter"
  console.log(chalk.cyan(helpText))

  const updateInfo = await checkNpmUpdate()
  if (updateInfo?.show) {
    console.log(
      chalk.cyan(
        `\nNew version available! Run 'ai update' (${updateInfo.currentVersion} -> ${updateInfo.latestVersion})`,
      ),
    )
  }

  console.log(
    chalk.cyan(
      Array.from({ length: helpText.length }).fill("=").join("") + "\n",
    ),
  )

  // Fetch context length for percentage calculation
  await fetchContextLength()

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
      throw error
    }
  }
}

main()
