# AI Agent Test

A lightweight, extensible agentic workflow system built with TypeScript and the AI SDK. This project serves as a testbed for implementing mini agentic flows with support for small-sized local LLMs (30B-80B parameters) and few tool integrations.

## 🌟 Features

- **Agentic Architecture**: Multi-iteration agent loop with tool calling capabilities
- **Local LLM Support**: Connect to any OpenAI-compatible API endpoint or Google Generative AI
- **Extensible Tools**: Built-in tools for file operations, bash execution, web search, and more
- **Interactive CLI**: Real-time chat interface with streaming responses
- **Debug Mode**: Inspect conversation history and token usage
- **Logging**: Session logging to track agent behavior and progress

## 🛠️ Prerequisites

- A local LLM server (e.g., LM Studio, Ollama) or cloud API key

## 📦 Installation

```bash
npm install
cp .env.example .env
# Edit .env with your configuration
```

## ⚙️ Configuration

Create a `.env` file with the following variables:

```env
MODEL_PROVIDER=openai
API_BASE_URL=http://localhost:1234/v1
API_KEY=dummy
MODEL_NAME=qwen3-coder-next
BRAVE_API_KEY=your_brave_api_key_here
```

## 🚀 Usage

```bash
npx tsx src/index.ts  # Start the agent
```

### CLI Commands

- Type your prompt and press Enter to start the agent loop
- `exit` or `quit` to terminate the session
- `debug <n>` to view last n messages (or all if no number provided)
