import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import dotenv from "dotenv";
dotenv.config();
const model = openai("qwen3-coder-next", {
    baseURL: "http://localhost:11434/v1",
});
const { text } = await generateText({
    model,
    prompt: "Write a haiku about the changing seasons.",
});
console.log(text);
//# sourceMappingURL=main.js.map