# AI Organizer

An Obsidian plugin that organizes notes via AI powered by [Ollama](https://ollama.com).

## Prerequisites

- [Obsidian](https://obsidian.md) v0.15.0 or later
- [Ollama](https://ollama.com) installed and running locally (default: `http://localhost:11434`)
- [Node.js](https://nodejs.org) v16 or later (for building from source)

## Building from Source

```bash
git clone https://github.com/your-repo/aiorganizer_obsidian.git
cd aiorganizer_obsidian
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
   <VaultFolder>/.obsidian/plugins/ai-organizer/
   ```
3. Open Obsidian, go to **Settings > Community Plugins**, and enable **AI Organizer**.

### Development Installation

Clone or symlink this repo directly into your vault's plugin folder for live development:

```bash
cd /path/to/your/vault/.obsidian/plugins
ln -s /path/to/aiorganizer_obsidian ai-organizer
```

Then run `npm run dev` and reload Obsidian to pick up changes.

## Usage

1. Click the **message icon** in the left ribbon or run the **"Open AI Chat"** command from the command palette.
2. The chat sidebar opens in the right panel.
3. In the **Settings** section at the bottom of the sidebar:
   - Set the **Ollama URL** (defaults to `http://localhost:11434`).
   - Click **Test** to verify the connection.
   - Select a **Model** from the dropdown.
4. Type a message and press **Enter** to chat with the AI.
   - **Shift+Enter** inserts a newline.

## License

[0-BSD](LICENSE)
