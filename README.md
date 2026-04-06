# AI Agent Test

A lightweight, extensible agentic workflow system built with TypeScript and the AI SDK. This project serves as a testbed for implementing mini agentic flows with support for small-sized local LLMs (30B-80B parameters) and few tool integrations.

## 🌟 Features

- **Agentic Architecture**: Multi-iteration agent loop with tool calling capabilities
- **Local LLM Support**: Connect to any OpenAI-compatible API endpoint or Google Generative AI
- **Extensible Tools**: Built-in tools for file operations, bash execution, web search, and more
  - See [src/tools/](./src/tools/) for all available tools
- **Interactive CLI**: Real-time chat interface with streaming responses
- **Debug Mode**: Inspect conversation history and token usage
- **Logging**: Session logging to track agent behavior and progress

## 🛠️ Prerequisites

- A local LLM server (e.g., LM Studio, Ollama) or cloud API key

## 📦 Installation

```bash
npm install
# Create ~/.ai/models.json with your configuration (see Configuration section below)
```

## ⚙️ Configuration

Create a JSON configuration file at `~/.ai/models.json` with the following structure:

```json
[
  {
    "modelApiType": "openai",
    "modelName": "qwen3-coder-next",
    "apiBaseUrl": "http://localhost:8090/v1",
    "apiKey": "dummy",
    "braveApiKey": "your_brave_api_key_here"
  }
]
```

### Configuration Options

- `modelApiType`: Either `openai` or `google`
- `modelName`: The name of the model to use
- `apiBaseUrl`: The base URL for the API endpoint (e.g., `http://localhost:8090/v1` for LM Studio)
- `apiKey`: Your API key (use `dummy` for local LLM servers)
- `braveApiKey`: Optional API key for web search functionality

The application uses the first model configuration from the array.

## 🚀 Usage

```bash
npx tsx src/index.ts  # Start the agent
```

### CLI Commands

- Type your prompt and press Enter to start the agent loop
- `exit` or `quit` to terminate the session
- `debug <n>` to view last n messages (or all if no number provided)
