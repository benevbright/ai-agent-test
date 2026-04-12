import { streamText, type ModelMessage, type ToolContent } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { toolNames, tools } from "./tools/index.js"
import chalk from "chalk"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import fs from "fs"
import path from "path"
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

const systemPromptPath = path.join(__dirname, "../SYSTEM.md")
let systemPrompt = fs.readFileSync(systemPromptPath, "utf-8")
systemPrompt = systemPrompt
  .replace("{date}", new Date().toLocaleString())
  .replace("{pwd}", process.cwd())
  .replace("{ls}", fs.readdirSync(process.cwd()).join(", "))

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
        toolResultContent.push({
          type: "tool-result",
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: {
            type: "text",
            value: `Tool execution failed: missing tool result for call ${toolCall.toolCallId} (${toolCall.toolName}).`,
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

    // Display token usage
    console.log(
      chalk.gray(
        `\n\n[${modelName}] Token: ${usage.totalTokens || 0} (${usage.inputTokens || 0} + ${usage.outputTokens || 0})`,
      ),
    )
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
  const helpText = "interrupt: ESC, debug: debug [num], newline: Shift+Enter"
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
  while (true) {
    console.log("")
    const userPrompt = await askQuestion("Prompt: ")

    if (userPrompt.toLowerCase() === "exit") {
      break
    }

    // TODO: print debug
    if (userPrompt.toLowerCase().startsWith("debug")) {
      console.log("\n--- Debug Info ---")
      const parts = userPrompt.trim().split(/\s+/)
      const tailNumStr = parts.length > 1 ? parts[1] : ""
      const tailNum = tailNumStr ? parseInt(tailNumStr, 10) : undefined

      if (tailNum && !isNaN(tailNum)) {
        console.log(`Last ${tailNum} message(s):`)
        const messagesToDisplay = tailNum > 0 ? messages.slice(-tailNum) : []
        console.log(JSON.stringify(messagesToDisplay, null, 2))
      } else {
        console.log("All messages:")
        console.log(JSON.stringify(messages, null, 2))
      }
      console.log("--- End Debug Info ---\n")
      continue
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
