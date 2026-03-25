import { streamText, type ModelMessage, type ToolContent } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import dotenv from "dotenv";
import * as readline from "readline";
import { tools } from "./tools.js";
import { assert } from "console";
import chalk from "chalk";

dotenv.config();

const baseUrl = process.env.API_BASE_URL || "";
const apiKey = process.env.API_KEY || "";
const modelName = process.env.MODEL_NAME || "";

assert(baseUrl, "API_BASE_URL is not defined in .env file");
assert(apiKey, "API_KEY is not defined in .env file");
assert(modelName, "MODEL_NAME is not defined in .env file");

const model = createOpenAI({
  baseURL: baseUrl,
  apiKey: apiKey,
})(modelName);
const systemPrompt = `
You are a helpful assistant for software developers.
When asked, think of tools you have and try to use them as much as possible.
However, before using a tool, explain what you're going to do in a text response, then call the tool with the necessary input.

CRITICAL RULE:
- You MUST call 'record_progress' after every step until it reaches 100%, before any tool call, and before finishing.
- if you need more information to complete the task, ask the user a follow-up question using 'ask_user_followup' tool. You can call this multiple times if needed.
- if the same tools are kept being called with the similar input and not leading to progress, try to think of a different approach or ask the user for clarification using 'ask_user_followup'.

Metadata:
- Today's date: ${new Date().toLocaleString()}`;

// - You are NOT allowed to provide the final answer in plain text.
// - To finish the task, you MUST call the 'deliver_final_answer' tool.
// - If you respond with plain text and no tool call, the user will not see your answer.

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
          console.log("\nAssistant: ");
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
    }

    // Display token usage
    console.log(
      chalk.gray(
        `\n\n[Token Usage] Input: ${usage.inputTokens || 0}, Output: ${usage.outputTokens || 0}, Total: ${usage.totalTokens || 0}`,
      ),
    );

    if (toolCalls.length === 0) {
      break;
    }
    const progressRes = toolResults.find(
      (result) => result.toolName === "record_progress",
    );
    if (progressRes && progressRes.output === 100) {
      console.log("\nTask completed with 100% progress!");
      break;
    }
  }
}

async function main() {
  while (true) {
    const userPrompt = await askQuestion("\nPrompt: ");

    if (
      userPrompt.toLowerCase() === "exit" ||
      userPrompt.toLowerCase() === "quit"
    ) {
      rl.close();
      break;
    }

    // TODO: print debug
    if (userPrompt.toLowerCase() === "debug") {
      console.log("\n--- Debug Info ---");
      console.log("Messages:", JSON.stringify(messages, null, 2));
      console.log("--- End Debug Info ---\n");
      continue;
    }

    await runLoop(userPrompt);
  }
}

main();
