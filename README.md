# MiMo Chatbot

A sidebar chatbot plugin for [Markdown Viewer](https://github.com/erfan-ashtari/markdown-viewer) that brings AI-powered assistance directly into your Markdown reader. Ask questions about your files, get summaries, or chat about anything — all without leaving your workspace.

## Features

- **Streaming responses** — watch the answer appear in real time as the AI generates it
- **Thinking panel** — expand the "Thinking" section to see the model's reasoning process
- **File context awareness** — automatically knows which file you have open and passes it to the model
- **One-click summarizer** — hit the star button to instantly summarize the active file
- **Stop generation** — cancel a long-running response mid-stream with the stop button
- **Session continuity** — follow-up messages keep the same conversation context
- **Activity log** — see which tools the AI is using (web search, file read, etc.) as it works
- **Auto mode switching** — asks that involve research or file ops automatically get full tool access; simple questions run in fast/pure mode

## Requirements

- [Markdown Viewer](https://github.com/erfan-ashtari/markdown-viewer) with plugin support
- [MiMoCode](https://github.com/nicepkg/mimo) CLI installed and available on your `PATH`

Install the CLI globally:

```bash
npm install -g @mimo-ai/cli
mimo --version
```

## Installation

1. Clone or copy this plugin into your Markdown Viewer plugins directory:
   ```
   <plugins>/plugin-mimo-chatbot/
   ```
2. Restart Markdown Viewer — the plugin loads automatically at runtime.
3. The **MiMo Chat** panel will appear in the sidebar.

## Usage

1. Open a Markdown (or any) file in Markdown Viewer.
2. Click the **MiMo Chat** icon in the sidebar to open the chat panel.
3. Type your question and press **Enter** or click the send button.
4. Click the **star** icon to summarize the currently open file.
5. Expand the **Thinking** block to see the model's reasoning.
6. Use the **trash** icon to clear the conversation and start a new session.

## How it works

The plugin spawns a `mimo run` subprocess in JSON mode and streams its output back to the chat UI. Two modes are used:

| Mode | When | What it does |
|------|------|--------------|
| `--pure` | Simple questions | No tools, no plugins — fast and lightweight |
| `--dangerously-skip-permissions` | Research / file requests | Full access to tools, skills, and the file system |

The model decides which mode to use based on keywords like "summarize", "search", "fetch", "run code", etc.

## Configuration

The system prompt and tool-detection keywords are defined in `index.js`. You can customize:

- **`SYSTEM_PROMPT`** — the instructions the model follows at the start of each session
- **`wantsTools()`** — the regex that decides when to enable full tool mode
- **`--agent`** flag (default: `compose`) — the MiMo agent to use

## File structure

```
plugin-mimo-chatbot/
├── index.js       # Plugin entry point — sidebar registration, message handling, mimo execution
├── chat.html      # Chat UI (HTML/CSS/JS) rendered inside an iframe
└── package.json   # Plugin manifest
```

## License

MIT
