import { generateText, type ToolContent } from "ai";
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

type Message =
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
    }
  | {
      role: "tool";
      content: ToolContent;
    };

const messages: Message[] = [];

async function runLoop(prompt: string) {
  messages.push({
    role: "user",
    content: prompt,
  });

  const res = await generateText({
    model,
    messages,
    tools,
    system: systemPrompt,
    // maxRetries: 3
  });

  // Display the assistant's response
  if (res.text) {
    console.log("\nAssistant:", res.text);
  }

  // Display tool calls if any
  if (res.toolCalls && res.toolCalls.length > 0) {
    console.log("\nTool calls:", JSON.stringify(res.toolCalls, null, 2));
  }

  // Display tool results if any
  if (res.toolResults && res.toolResults.length > 0) {
    for (const toolResult of res.toolResults) {
      const output = (toolResult as any).output;
      if (output && output.success) {
        console.log(output.output);
      } else if (output) {
        console.error(output.stderr || output.error);
      }
    }
  }

  // Add assistant message to history
  const assistantContent =
    res.text ||
    (res.toolCalls && res.toolCalls.length > 0
      ? `[tool calls: ${res.toolCalls.map((tc: any) => tc.toolName).join(", ")}]`
      : "");
  messages.push({
    role: "assistant",
    content: assistantContent,
  });
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

    await runLoop(userPrompt);
    // console.log("--------messages:", messages);
  }
}

main();
