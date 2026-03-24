# AI Pulse

The Obsidian AI Note Management Plugin — powered by [Ollama](https://ollama.com).

Chat with a local AI that has full access to your vault. Search files, read and edit notes, manage frontmatter, create and move files — all through natural conversation with tool-calling support.

## Features

### AI Chat Sidebar

- Streaming responses with real-time token-by-token display (desktop) or full-response delivery (mobile)
- Markdown rendering with clickable `[[wiki-links]]` in AI responses
- Multi-turn conversation with full message history
- Abort generation mid-stream with a Stop button
- FAB speed dial for quick access to Settings, Tools, and Clear Chat

### Vault Tools

Enable tools to give the AI direct access to your vault. Each tool can be individually toggled on/off. Destructive actions require user approval before executing.

| Tool | Description | Approval |
|------|-------------|----------|
| **Search Files** | Find files by name or path | No |
| **Read File** | Read file content (includes parsed frontmatter as JSON) | No |
| **Search Contents** | Grep-style text search across all markdown files | No |
| **Get Current Note** | Get the path of the currently open note | No |
| **Edit File** | Find-and-replace text in a file | Yes |
| **Create File** | Create a new note (auto-creates parent folders) | Yes |
| **Delete File** | Move a file to system trash | Yes |
| **Move/Rename File** | Move or rename a file (auto-updates all links) | Yes |
| **Set Frontmatter** | Add, update, or remove YAML frontmatter properties | Yes |

The AI follows a mandatory read-before-edit workflow to prevent data loss. Approval dialogs show full diffs for review before any changes are applied.

### Vault Context Injection

Optionally inject a summary of your vault structure into every conversation so the AI understands your vault without searching first:

- **Folder tree** — indented ASCII tree of all vault folders
- **Tag taxonomy** — all tags sorted by usage count
- **Recent files** — most recently modified notes (configurable count)
- **Stats** — vault name, total notes, total folders

All data comes from the metadata cache — no file reads, instant computation.

### Custom System Prompt

Point the plugin at any vault note to use as persistent AI instructions (writing style, formatting rules, etc.). The note content is injected into the system prompt alongside tool instructions and vault context.

### Settings

- **Ollama URL** — connect to any Ollama instance (localhost, LAN IP, remote)
- **Model selection** — auto-populated from connected Ollama server
- **Temperature** — control response randomness (0–2)
- **Context window** — set `num_ctx` with model max display and one-click apply
- **Max output tokens** — set `num_predict` (-1 for unlimited)

### Mobile Support

Fully functional on Obsidian Mobile. Uses Obsidian's `requestUrl()` for network requests (non-streaming fallback) to reach Ollama over LAN. Set the Ollama URL to your computer's LAN IP instead of localhost.

## Prerequisites

- [Obsidian](https://obsidian.md) v0.15.0 or later
- [Ollama](https://ollama.com) installed and running (default: `http://localhost:11434`)
- [Node.js](https://nodejs.org) v16 or later (for building from source)

## Building from Source

```bash
git clone https://github.com/your-repo/ai-pulse.git
cd ai-pulse
npm install
npm run build
```

For development with auto-rebuild on file changes:

```bash
npm run dev
```

## Installing the Plugin

### Manual Installation

1. Build the plugin (see above).
2. Copy `main.js`, `styles.css`, and `manifest.json` into your vault at:
   ```
   <VaultFolder>/.obsidian/plugins/ai-pulse/
   ```
3. Open Obsidian, go to **Settings > Community Plugins**, and enable **AI Pulse**.

### Development Installation

Clone or symlink this repo directly into your vault's plugin folder for live development:

```bash
cd /path/to/your/vault/.obsidian/plugins
ln -s /path/to/ai-pulse ai-pulse
```

Then run `npm run dev` and reload Obsidian to pick up changes.

## Quick Start

1. Click the **message icon** in the left ribbon or run **"Open AI Chat"** from the command palette.
2. Click the **gear icon** (FAB) → **AI Settings**:
   - Set the **Ollama URL** if not using the default.
   - Click **Connect** to verify the connection and load models.
   - Select a **Model** from the dropdown.
3. Click **Tools** to enable vault tools (optional but recommended).
4. Type a message and press **Enter** to chat.
   - **Shift+Enter** inserts a newline.
   - Click **Stop** to abort a streaming response.

## License

[0-BSD](LICENSE)
