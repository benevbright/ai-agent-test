import { generateText, type ToolContent } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import dotenv from "dotenv";
import * as readline from "readline";
import { tools } from "./tools.js";

dotenv.config();

const model = createOpenAI({
  baseURL: "http://localhost:8090/v1",
  apiKey: "dummy",
})("qwen3-coder-next");

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
  messages.push({
    role: "assistant",
    content: res.text || "",
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
