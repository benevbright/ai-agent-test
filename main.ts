import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import dotenv from "dotenv";

dotenv.config();

const model = createOpenAI({
  baseURL: "http://localhost:8090/v1",
  apiKey: "dummy",
})("qwen3-coder-next");

console.log("Generating text...");
const { text } = await generateText({
  model,
  prompt: "Write a haiku about the changing seasons.",
});

console.log(text);
