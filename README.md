# AI Agent Test

[![npm version](https://img.shields.io/npm/v/ai-agent-test.svg)](https://www.npmjs.com/package/ai-agent-test)

A lightweight, extensible agentic workflow system built with TypeScript and the AI SDK. This project serves as a testbed for implementing mini agentic flows with support for small-sized local LLMs (30B-80B parameters) and few tool integrations.

It works well with highend models like MiniMax too (OpenRouter). The agent sends minimum context which means a lot less money spent 💰.

See [TODOs.md](./TODOs.md) for roadmap, features in development, and known bugs.

## 🌟 Features

- Agentic Architecture: Multi-iteration agent loop with tool calling capabilities
- Local LLM Support: Connect to any OpenAI-compatible API endpoint or Google Generative AI
- Extensible Tools: Built-in tools for file operations, bash execution, web search, and more
  - See [src/tools/](./src/tools/) for all available tools
- Interactive CLI: Real-time chat interface with streaming responses
- Session Management: Session messages are stored in `~/.ai/sessions/` and session can be restored for continued conversations
- Custom System Prompt: Create `~/.ai/SYSTEM.md` or use `--system` CLI option to provide custom instructions that augment the agent's system prompt

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
ai models          # List all available models
ai --model 1       # Select the second model (Google Gemini)

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
- `AI_SYSTEM_PROMPT`: Additional system prompt content (set via `--system` CLI option)

### Session Management

View and restore previous sessions:

```bash
ai sessions            # List last 20 sessions with 0-based indexing
ai --session 2         # Load and restart from session 2
```

You can also combine model and session options:

```bash
ai --model 1 --session 2    # Use model 1 and load session 2
ai -m 1 -s 2                # Short form of the above command
```

When loading a session, the conversation history is restored and logged to the current session file.
