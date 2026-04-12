# AI Agent Test

[![npm version](https://img.shields.io/npm/v/ai-agent-test.svg)](https://www.npmjs.com/package/ai-agent-test)

A lightweight, extensible agentic workflow system built with TypeScript and the AI SDK. This project serves as a testbed for implementing mini agentic flows with support for small-sized local LLMs (30B-80B parameters) and few tool integrations.

It works well with highend models like MiniMax (OpenRouter). The agent sends minimum context which means less money spent 💰.

## 🌟 Features

- **Agentic Architecture**: Multi-iteration agent loop with tool calling capabilities
- **Local LLM Support**: Connect to any OpenAI-compatible API endpoint or Google Generative AI
- **Extensible Tools**: Built-in tools for file operations, bash execution, web search, and more
  - See [src/tools/](./src/tools/) for all available tools
- **Interactive CLI**: Real-time chat interface with streaming responses
- **Debug Mode**: Inspect conversation history and token usage
- **Logging**: Session logs are stored in `~/.ai/logs/` to track agent behavior and progress

## 🛠️ Prerequisites

- A local LLM server (e.g., LM Studio, Ollama) or cloud API key

## 📦 Installation

### As a CLI tool (global)

```bash
npm install -g ai-agent-test
# Create ~/.ai/models.json with your configuration (see Configuration section below)
```

Then run:

```bash
ai
```

### Development installation

```bash
npm install
# Create ~/.ai/models.json with your configuration (see Configuration section below)
```

## ⚙️ Configuration

### Model Configuration

Create a JSON configuration file at `~/.ai/models.json` with an array of model configurations:

```json
[
  {
    "modelApiType": "openai",
    "modelName": "qwen3-coder-next",
    "apiBaseUrl": "http://localhost:1234/v1",
    "apiKey": "dummy"
  },
  {
    "modelApiType": "openai",
    "modelName": "minimax/minimax-m2.7",
    "apiBaseUrl": "https://openrouter.ai/api/v1",
    "apiKey": "your_openrouter_api_key_here"
  },
  {
    "modelApiType": "google",
    "modelName": "gemini-2.5-flash",
    "apiBaseUrl": "https://generativelanguage.googleapis.com/v1beta",
    "apiKey": "your_google_api_key_here"
  }
]
```

Start CLI with selected model (default is the first model in the array):

```bash
# option 1
ai models 1 # to select the second model (Google Gemini)

# option 2
export AI_MODEL_INDEX=1
ai

# option 3
AI_MODEL_INDEX=1 ai
```

### Using Environment Variables (CI/CD Friendly)

Instead of using `~/.ai/models.json`, you can configure the CLI entirely through environment variables. This is especially useful for CI/CD environments:

```bash
export AI_MODEL_APITYPE="openai"
export AI_MODEL_NAME="gpt-4o"
export AI_API_BASE_URL="https://api.openai.com/v1"
export AI_API_KEY="your_api_key_here"
ai
```

### Additional Environment Variables

- `BRAVE_API_KEY`: (Required) API key for Brave Search for the internet search tool

### CLI Commands

When installed globally, run `ai` to start the interactive CLI:

- Type your prompt and press Enter to start the agent loop
- `exit` or `quit` to terminate the session
- `debug <n>` to view last n messages (or all if no number provided)
- ESC key to interrupt the current agent iteration

### Session Management

View and restore previous sessions:

```bash
ai sessions ls          # List last 20 sessions with 0-based indexing
ai sessions 2           # Load and restart from session 2
```

When loading a session, the conversation history is restored and logged to the current session file.
