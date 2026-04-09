import { streamText, type ModelMessage, type ToolContent } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import * as readline from "readline";
import { toolNames, tools } from "./tools/index.js";
import chalk from "chalk";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { logToFile, logMessages } from "./utils/system.js";

// Get the directory of this module (works with ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read configuration from environment variables set by bin/ai
const modelProvider = process.env.AI_MODEL_APITYPE as "openai" | "google";
const modelName = process.env.AI_MODEL_NAME || "";
const baseUrl = process.env.AI_API_BASE_URL || "";
const apiKey = process.env.AI_API_KEY || "";

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

    const toolResultIds = new Set(
      toolResultContent.map((result) => (result as any).toolCallId),
    );
    for (const toolCall of toolCallsCollected) {
      if (!toolResultIds.has(toolCall.toolCallId)) {
        toolResultContent.push({
          type: "tool-result",
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: {
            type: "text",
            value: `Tool execution failed: missing tool result for call ${toolCall.toolCallId} (${toolCall.toolName}).`,
          },
        });
        logToFile(
          `Synthesized failed tool result for missing call ${toolCall.toolCallId} (${toolCall.toolName})`,
        );
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

async function checkNpmUpdate(): Promise<{
  show: boolean;
  currentVersion: string;
  latestVersion: string;
} | null> {
  try {
    const { execSync } = await import("child_process");

    // Get globally installed ai-agent-test version
    const output = execSync("npm ls -g --json 2>/dev/null", {
      encoding: "utf-8",
    });
    const data = JSON.parse(output);

    // Navigate to ai-agent-test in the global npm tree
    const aiAgentTest = data?.dependencies?.["ai-agent-test"];
    if (!aiAgentTest) {
      return null;
    }

    const currentVersion = aiAgentTest.version;

    // Fetch latest version from npm registry
    const response = await fetch(
      "https://registry.npmjs.org/ai-agent-test/latest",
    );
    if (!response.ok) {
      return null;
    }
    const latestData = (await response.json()) as { version: string };
    const latestVersion = latestData.version;

    // Simple version comparison
    const currentParts = currentVersion.split(".").map(Number);
    const latestParts = latestVersion.split(".").map(Number);

    let needsUpdate = false;
    for (
      let i = 0;
      i < Math.max(currentParts.length, latestParts.length);
      i++
    ) {
      const current = currentParts[i] || 0;
      const latest = latestParts[i] || 0;
      if (latest > current) {
        needsUpdate = true;
        break;
      }
    }

    return needsUpdate ? { show: true, currentVersion, latestVersion } : null;
  } catch (error) {
    return null;
  }
}

async function main() {
  logToFile(`\n========== Session Started ========== pwd: ${process.cwd()}`);
  console.log(chalk.cyan(`AI Agent Ready! (${process.cwd()})\n`));
  console.log(chalk.cyan("interrupt: ESC, debug: 'debug [num]'"));

  // Check for updates - only show if update is available
  try {
    const updateInfo = await checkNpmUpdate();
    if (updateInfo?.show) {
      console.log(
        chalk.cyan(
          `\nNew version available! Run 'ai update' (${updateInfo.currentVersion} -> ${updateInfo.latestVersion})`,
        ),
      );
    }
  } catch (error) {
    // Silent fail - just don't show update message if something goes wrong
    logToFile(`Failed to check for updates: ${(error as Error).message}`);
  }

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
