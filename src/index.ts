import { streamText, type ModelMessage, type ToolContent } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import * as readline from "readline";
import { toolNames, tools } from "./tools/index.js";
import chalk from "chalk";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { logToFile, logMessages } from "./utils/system.js";

// Get the directory of this module (works with ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration from ~/.ai/models.json
const modelsFile = join(homedir(), ".ai", "models.json");
let config: {
  modelApiType: "openai" | "google";
  modelName: string;
  apiBaseUrl: string;
  apiKey: string;
};
try {
  const fileContent = readFileSync(modelsFile, "utf-8");
  const models = JSON.parse(fileContent);
  const modelIndex = parseInt(process.env.AI_MODEL_INDEX || "0", 10);
  config = models[modelIndex];
} catch (error) {
  console.error(
    chalk.red(
      `Failed to load configuration from ${modelsFile}: ${(error as Error).message}`,
    ),
  );
  const sampleConfig = [
    {
      modelApiType: "openai (openai or google)",
      modelName: "gpt-4o",
      apiBaseUrl: "https://api.openai.com/v1",
      apiKey: "your-api-key-here",
    },
  ];
  console.log(
    chalk.yellow(
      "\nPlease create a ~/.ai/models.json file with the following format:",
    ),
  );
  console.log(chalk.yellow(JSON.stringify(sampleConfig, null, 2)));
  process.exit(1);
}

const {
  modelApiType: modelProvider,
  modelName,
  apiBaseUrl: baseUrl,
  apiKey,
} = config;

let model: LanguageModelV3;

if (modelProvider === "google") {
  model = createGoogleGenerativeAI({
    baseURL: baseUrl,
    apiKey: apiKey,
  }).chat(modelName);
} else {
  model = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey,
  }).chat(modelName);
}

const systemPromptPath = path.join(__dirname, "../SYSTEM.md");
let systemPrompt = fs.readFileSync(systemPromptPath, "utf-8");
systemPrompt = systemPrompt
  .replace("{date}", new Date().toLocaleString())
  .replace("{pwd}", process.cwd());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let interruptRequested = false;

async function askQuestion(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    rl.once("line", (answer: string) => resolve(answer));
  });
}

const messages: ModelMessage[] = [];

async function runLoop(prompt: string) {
  messages.push({
    role: "user",
    content: prompt,
  });
  logToFile(`User prompt: ${prompt.substring(0, 200)}...`);

  // Reset interrupt flag
  interruptRequested = false;

  // Set up ESC key listener
  const setupEscListener = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onKeyPress);
    }
  };

  const cleanupEscListener = () => {
    if (process.stdin.isTTY) {
      process.stdin.removeListener("data", onKeyPress);
      process.stdin.setRawMode(false);
    }
  };

  const onKeyPress = (key: Buffer) => {
    // ESC key is 0x1b
    if (key[0] === 0x1b) {
      console.log(chalk.magenta("\n\n[Interrupt requested]"));
      interruptRequested = true;
    }
  };

  setupEscListener();

  while (true) {
    const res = await streamText({
      model,
      messages,
      tools,
      system: systemPrompt,
    });

    let fullText = "";
    const toolCallsCollected: any[] = [];
    const toolResultContent: ToolContent = [];

    for await (const part of res.fullStream) {
      if (interruptRequested) {
        cleanupEscListener();
        logToFile("=== break loop: user interrupted with ESC key ===");
        return;
      }

      if (part.type === "text-delta") {
        if (!fullText) {
          process.stdout.write(chalk.cyan("\nAssistant: "));
        }
        process.stdout.write(part.text);
        fullText += part.text;
      } else if (part.type === "tool-call") {
        toolCallsCollected.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      } else if (part.type === "tool-result") {
        const output = (part as any).output;
        if (output && output.success) {
          toolResultContent.push({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: {
              type: "text",
              value:
                output.output +
                `\n\n[Tool execution metadata: ${JSON.stringify(output.metadata || {})}]`,
            },
          });
        } else {
          toolResultContent.push({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: {
              type: "text",
              value: output?.stderr || output?.error || "Unknown error",
            },
          });
        }
      }
    }

    const usage = await res.usage;

    const assistantContent: any[] = [];
    if (fullText) {
      assistantContent.push({ type: "text", text: fullText });
    }
    for (const toolCall of toolCallsCollected) {
      assistantContent.push(toolCall);
    }

    if (assistantContent.length > 0) {
      messages.push({
        role: "assistant",
        content: assistantContent,
      });
      logToFile("Added assistant message with content");
    }

    if (toolResultContent.length > 0) {
      messages.push({
        role: "tool",
        content: toolResultContent,
      });
      logToFile(`Added ${toolResultContent.length} tool result(s)`);
    }

    // Display token usage
    console.log(
      chalk.gray(
        `\n\n[${modelName}] Token: ${usage.totalTokens || 0} (${usage.inputTokens || 0} + ${usage.outputTokens || 0})`,
      ),
    );

    logToFile(
      `Iteration complete. Tool calls: ${toolCallsCollected.length}, Tool results: ${toolResultContent.length}`,
    );
    logMessages(messages);
    if (toolCallsCollected.length === 0) {
      logToFile("=== break loop: no tool calls ===");
      break;
    }
    const progressRes = toolResultContent.find(
      (result) => (result as any).toolName === toolNames.recordProgress,
    );
    if (progressRes && (progressRes as any).output?.value === 100) {
      console.log("\nTask completed with 100% progress!");
      logToFile("=== break loop: task completed with 100% progress ===");
      break;
    }
    const followUpRes = toolResultContent.find(
      (result) => (result as any).toolName === toolNames.askUserFollowup,
    );
    if (followUpRes) {
      console.log(chalk.yellow("\n--- Waiting for user input ---"));
      logToFile("=== break loop: asked user followup ===");
      break;
    }
    if (interruptRequested) {
      logToFile("=== break loop: user interrupted with ESC key ===");
      break;
    }
  }

  cleanupEscListener();
}

async function main() {
  logToFile("\n========== Session Started ==========");
  console.log(chalk.cyan(`AI Agent Ready at ${process.cwd()}!\n`));
  console.log(
    chalk.cyan("interrupt: ESC, exit: 'exit' or 'quit', debug: 'debug [num]'"),
  );
  console.log(
    chalk.cyan(
      "============================================================\n",
    ),
  );
  while (true) {
    const userPrompt = await askQuestion("\nPrompt: ");

    if (
      userPrompt.toLowerCase() === "exit" ||
      userPrompt.toLowerCase() === "quit"
    ) {
      logToFile("User exited the session");
      logToFile("========== Session Ended ==========\n");
      rl.close();
      break;
    }

    // TODO: print debug
    if (userPrompt.toLowerCase().startsWith("debug")) {
      console.log("\n--- Debug Info ---");
      const parts = userPrompt.trim().split(/\s+/);
      const tailNumStr = parts.length > 1 ? parts[1] : "";
      const tailNum = tailNumStr ? parseInt(tailNumStr, 10) : undefined;

      if (tailNum && !isNaN(tailNum)) {
        console.log(`Last ${tailNum} message(s):`);
        const messagesToDisplay = tailNum > 0 ? messages.slice(-tailNum) : [];
        console.log(JSON.stringify(messagesToDisplay, null, 2));
      } else {
        console.log("All messages:");
        console.log(JSON.stringify(messages, null, 2));
      }
      console.log("--- End Debug Info ---\n");
      continue;
    }

    try {
      await runLoop(userPrompt);
    } catch (error) {
      console.error(
        chalk.red(`Error in main loop: ${(error as Error).message}`),
      );
      console.log(JSON.stringify(messages.slice(-10), null, 2));
      throw error;
    }
  }
}

main();
