import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import dotenv from "dotenv";
import { execSync } from "child_process";
import * as readline from "readline";
import { z } from "zod";

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

async function executeBashCommand(prompt: string) {
  const result = await generateText({
    model,
    prompt: `Convert this natural language request to a bash command. Return ONLY the command in raw JSON format with "command" key (no markdown, no extra text):

${prompt}`,
    output: Output.object({
      schema: z.object({ command: z.string() }),
    }),
  });

  console.log("Result:", result);
  const command = result.output.command.trim();
  console.log(`Executing: ${command}`);

  try {
    const result = execSync(command, { encoding: "utf-8", stdio: "pipe" });
    console.log("Output:", result);
  } catch (error) {
    console.error("Error executing command:", error);
  }
}

async function main() {
  while (true) {
    const userPrompt = await askQuestion("\nWhat would you like to do? ");
    
    if (userPrompt.toLowerCase() === "exit" || userPrompt.toLowerCase() === "quit") {
      rl.close();
      break;
    }

    await executeBashCommand(userPrompt);
  }
}

main();
