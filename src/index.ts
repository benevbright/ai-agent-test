import { streamText, type ModelMessage, type ToolContent } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import dotenv from "dotenv";
import * as readline from "readline";
import { toolNames, tools } from "./tools/index.js";
import { assert } from "console";
import chalk from "chalk";
import { logToFile, logMessages } from "./utils/system.js";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import fs from "fs";
import path from "path";

dotenv.config();

const baseUrl = process.env.API_BASE_URL || "";
const apiKey = process.env.API_KEY || "";
const modelName = process.env.MODEL_NAME || "";
const modelProvider = process.env.MODEL_PROVIDER || "openai";

assert(baseUrl, "API_BASE_URL is not defined in .env file");
assert(apiKey, "API_KEY is not defined in .env file");
assert(modelName, "MODEL_NAME is not defined in .env file");

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

const systemPromptPath = path.join("src", "prompts", "SYSTEM.md");
let systemPrompt = fs.readFileSync(systemPromptPath, "utf-8");
systemPrompt = systemPrompt
  .replace("{date}", new Date().toLocaleString())
  .replace("{pwd}", process.cwd());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => resolve(answer));
  });
}

const messages: ModelMessage[] = [];

async function runLoop(prompt: string) {
  messages.push({
    role: "user",
    content: prompt,
  });
  logToFile(`User prompt: ${prompt.substring(0, 200)}...`);

  while (true) {
    const res = await streamText({
      model,
      messages,
      tools,
      system: systemPrompt,
    });

    // Build assistant message combining text and tool calls
    const assistantContent: any[] = [];

    let fullText = "";
    for await (const part of res.textStream) {
      if (part) {
        if (!fullText) {
          console.log(chalk.cyan("\nAssistant: "));
        }
        process.stdout.write(part);
        fullText += part;
      }
    }

    if (fullText) {
      assistantContent.push({ type: "text", text: fullText });
    }
    const toolResults = await res.toolResults;
    const toolCalls = await res.toolCalls;
    const usage = await res.usage;

    for (const toolCall of toolCalls || []) {
      // console.log("[appended tool call]", toolCall.toolName, toolCall.input);
      assistantContent.push({
        type: "tool-call",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
    }

    if (assistantContent.length > 0) {
      messages.push({
        role: "assistant",
        content: assistantContent,
      });
      logToFile("Added assistant message with content");
    }

    // Append tool results
    const toolResultContent: ToolContent = [];
    for (const toolResult of toolResults || []) {
      const output = (toolResult as any).output;
      if (output && output.success) {
        // console.log("[appended tool result]", toolResult.toolName);
        toolResultContent.push({
          type: "tool-result",
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          output: {
            type: "text",
            value:
              output.output +
              `\n\n[Tool execution metadata: ${JSON.stringify(output.metadata || {})}]`,
          },
        });
      } else {
        // console.log("[appended FAILED tool result]", toolResult.toolName);
        toolResultContent.push({
          type: "tool-result",
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          output: {
            type: "text",
            value: output.stderr || output.error || "Unknown error",
          },
        });
      }
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
        `\n\n[Token Usage] Input: ${usage.inputTokens || 0}, Output: ${usage.outputTokens || 0}, Total: ${usage.totalTokens || 0}`,
      ),
    );

    logToFile(
      `Iteration complete. Tool calls: ${toolCalls?.length || 0}, Tool results: ${toolResultContent.length}`,
    );
    logMessages(messages);
    if (toolCalls.length === 0) {
      logToFile("=== break loop: no tool calls ===");
      break;
    }
    const progressRes = toolResults.find(
      (result) => result.toolName === toolNames.recordProgress,
    );
    if (progressRes && progressRes.output === 100) {
      console.log("\nTask completed with 100% progress!");
      logToFile("=== break loop: task completed with 100% progress ===");
      break;
    }
    const followUpRes = toolResults.find(
      (result) => result.toolName === toolNames.askUserFollowup,
    );
    if (followUpRes) {
      console.log(chalk.yellow("\n--- Waiting for user input ---"));
      logToFile("=== break loop: asked user followup ===");
      break;
    }
  }
}

async function main() {
  logToFile("\n========== Session Started ==========");
  console.log(chalk.cyan("AI Agent Ready!"));
  console.log(chalk.cyan("==============================\n"));
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
