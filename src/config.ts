import { homedir } from "os"
import { join } from "path"
import { readFileSync } from "fs"
import chalk from "chalk"

export interface ModelConfig {
  modelApiType: "openai" | "google"
  modelName: string
  apiBaseUrl: string
  apiKey: string
}

export function loadConfig(): ModelConfig {
  const modelsFile = join(homedir(), ".ai", "models.json")

  // Try to load from models.json first
  try {
    const fileContent = readFileSync(modelsFile, "utf-8")
    const models = JSON.parse(fileContent)
    const modelIndex = parseInt(process.env.AI_MODEL_INDEX || "0", 10)
    return models[modelIndex]
  } catch (error) {
    // models.json doesn't exist or is invalid
    // Check for environment variables as fallback
    const modelApiType = process.env.AI_MODEL_APITYPE
    const modelName = process.env.AI_MODEL_NAME
    const apiBaseUrl = process.env.AI_API_BASE_URL
    const apiKey = process.env.AI_API_KEY

    if (modelApiType && modelName && apiBaseUrl && apiKey) {
      console.log(
        chalk.yellow(
          `\nUsing environment variables for configuration (no ~/.ai/models.json found)\n`,
        ),
      )
      return {
        modelApiType: modelApiType as "openai" | "google",
        modelName,
        apiBaseUrl,
        apiKey,
      }
    }

    // No config available
    console.error(
      chalk.red(
        `Failed to load configuration from ${modelsFile}: ${(error as Error).message}`,
      ),
    )
    const sampleConfig = [
      {
        modelApiType: "openai (openai or google)",
        modelName: "gpt-4o",
        apiBaseUrl: "https://api.openai.com/v1",
        apiKey: "your-api-key-here",
      },
    ]
    console.log(
      chalk.yellow(
        "\nPlease create a ~/.ai/models.json file with the following format:",
      ),
    )
    console.log(chalk.yellow(JSON.stringify(sampleConfig, null, 2)))
    console.log(chalk.yellow("\nOr set these environment variables:\n"))
    console.log(
      chalk.yellow(`  AI_MODEL_APITYPE  - Either "openai" or "google"`),
    )
    console.log(
      chalk.yellow(`  AI_MODEL_NAME     - Model name (e.g., "gpt-4o")`),
    )
    console.log(chalk.yellow(`  AI_API_BASE_URL   - Base URL for the API`))
    console.log(chalk.yellow(`  AI_API_KEY        - Your API key`))
    process.exit(1)
  }
}
