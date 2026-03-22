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
function askQuestion(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => resolve(answer));
    });
}
const bashCommandSchema = z.object({
    command: z.string(),
    example: z.string(),
});
async function executeBashCommand(_prompt) {
    let result;
    let prompt;
    try {
        prompt = `Convert this natural language request to a bash command. Return ONLY the command in raw JSON format with "command" key:
${_prompt}`;
        result = await generateText({
            model,
            prompt,
            output: Output.object({
                schema: bashCommandSchema,
            }),
        });
    }
    catch (error) {
        let errorMessage = "";
        if (error && typeof error === "object" && "cause" in error) {
            const cause = error;
            if (cause.cause) {
                errorMessage = cause.cause.message;
            }
        }
        if (!errorMessage && error && typeof error === "object" && "message" in error) {
            errorMessage = error.message;
        }
        console.log("------error");
        prompt =
            prompt +
                "\n\nError: " +
                errorMessage +
                "\n\nPlease fix the output payload according to error message and return the correct output.";
        console.log("------prompt", prompt);
        // Retry with fixed prompt
        try {
            result = await generateText({
                model,
                prompt,
                output: Output.object({
                    schema: bashCommandSchema,
                }),
            });
        }
        catch (retryError) {
            console.error("Failed to generate valid output after retry:", retryError);
            return;
        }
    }
    console.log("Result:", result);
    const command = result.output.command.trim();
    console.log(`Executing: ${command}`);
    try {
        const result = execSync(command, { encoding: "utf-8", stdio: "pipe" });
        console.log("Output:", result);
    }
    catch (error) {
        console.error("Error executing command:", error);
    }
}
async function main() {
    while (true) {
        const userPrompt = await askQuestion("\nWhat would you like to do? ");
        if (userPrompt.toLowerCase() === "exit" ||
            userPrompt.toLowerCase() === "quit") {
            rl.close();
            break;
        }
        await executeBashCommand(userPrompt);
    }
}
main();
//# sourceMappingURL=main.js.map