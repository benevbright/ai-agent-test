import { generateText, type ModelMessage, type ToolContent } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import dotenv from "dotenv";
import * as readline from "readline";
import { tools } from "./tools.js";
import { assert } from "console";

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
const systemPrompt = `You are a helpful assistant for software developers. When asked, think of tools you have and try to use them as much as possible.`;

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
    const res = await generateText({
      model,
      messages,
      tools,
      system: systemPrompt,
    });

    // Display the assistant's response
    if (res.text) {
      console.log("\nAssistant:", res.text);
      messages.push({
        role: "assistant",
        content: res.text,
      });

      if (!res.toolCalls || res.toolCalls.length === 0) {
        break; // no pending tool calls, model is done
      }
    }

    // Display tool calls if any
    for (const toolCall of res.toolCalls || []) {
      console.log("[appened tool call]", toolCall.toolName, toolCall.input);
      messages.push({
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.input,
          },
        ],
      });
    }

    // Display tool results if any
    for (const toolResult of res.toolResults || []) {
      const output = (toolResult as any).output;
      if (output && output.success) {
        // console.log(output.output);
        console.log("[appened tool result]", toolResult.toolName);
        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: toolResult.toolCallId,
              toolName: toolResult.toolName,
              output: {
                type: "text",
                value: output.output,
              },
            },
          ],
        });
      } else {
        // console.error(output.stderr || output.error);
        console.log("[appened FAILED tool result]", toolResult.toolName);
        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: toolResult.toolCallId,
              toolName: toolResult.toolName,
              output: {
                type: "text",
                value: output.stderr || output.error || "Unknown error",
              },
            },
          ],
        });
      }
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
