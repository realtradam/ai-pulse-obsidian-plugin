# AI Organizer — Stage 1: Chat Sidebar with Ollama Connection

## Goal

Replace the sample plugin scaffolding with a functional Ollama chat sidebar. The sidebar view contains a chat area (top half) and a settings panel (bottom half). The user configures the Ollama URL, tests the connection, selects a model, and chats with the AI.

---

## Existing State

- Project is the Obsidian sample plugin template (TypeScript, esbuild).
- `manifest.json` has `id: "sample-plugin"`, `isDesktopOnly: false`.
- `src/main.ts` contains `MyPlugin` with boilerplate commands, ribbon icon, status bar, and a modal.
- `src/settings.ts` contains `MyPluginSettings` with a single `mySetting: string` field and `SampleSettingTab`.
- `styles.css` is empty (comments only).
- Build: `npm run dev` (esbuild watch), `npm run build` (tsc + esbuild production).

---

## File Plan

| File | Action | Purpose |
|------|--------|---------|
| `manifest.json` | Modify | Update `id`, `name`, `description`, `author`, `authorUrl`. Remove `fundingUrl`. |
| `package.json` | Modify | Update `name` and `description`. |
| `src/main.ts` | Rewrite | New plugin class `AIOrganizer`. Register view, register command, load/save settings. Remove all sample code. |
| `src/settings.ts` | Rewrite | New `AIOrganizerSettings` interface with `ollamaUrl` and `model`. New `DEFAULT_SETTINGS`. Remove `SampleSettingTab` (settings live in the sidebar view, not a settings tab). |
| `src/chat-view.ts` | Create | `ItemView` subclass for the sidebar. Contains chat UI (top) and settings panel (bottom). |
| `src/ollama-client.ts` | Create | Functions: `testConnection`, `listModels`, `sendChatMessage`. All use `requestUrl`. |
| `styles.css` | Rewrite | Styles for the chat view layout, messages, input area, settings panel. |

---

## Step-by-Step Tasks

### Step 1 — Update Metadata

**`manifest.json`**:
- Set `id` to `"ai-organizer"`.
- Set `name` to `"AI Organizer"`.
- Set `description` to `"Organize notes via AI powered by Ollama."`.
- Set `author` to the repo owner's name.
- Set `authorUrl` to the repo URL.
- Remove `fundingUrl`.
- Keep `isDesktopOnly` as `false`.
- Keep `minAppVersion` as `"0.15.0"`.

**`package.json`**:
- Set `name` to `"ai-organizer"`.
- Set `description` to match `manifest.json`.

### Step 2 — Settings Interface

**`src/settings.ts`** — delete all existing content and replace:

- Define `AIOrganizerSettings` interface:
  - `ollamaUrl: string` — the Ollama server base URL.
  - `model: string` — the selected model name (empty string means none selected).
- Define `DEFAULT_SETTINGS: AIOrganizerSettings`:
  - `ollamaUrl`: `"http://localhost:11434"`
  - `model`: `""`
- Export both.
- Do NOT create a `PluginSettingTab`. Settings are embedded in the sidebar view.

### Step 3 — Ollama Client

**`src/ollama-client.ts`** — create:

#### `testConnection(ollamaUrl: string): Promise<string>`
- `GET {ollamaUrl}/api/version` using `requestUrl` with `throw: false`.
- On success (status 200): return the version string from `response.json.version`.
- On failure: throw an `Error` with a descriptive message. If `status` is 0 or the error message contains `"net"` or `"fetch"`, the message must say Ollama is unreachable. Otherwise include the status code.

#### `listModels(ollamaUrl: string): Promise<string[]>`
- `GET {ollamaUrl}/api/tags` using `requestUrl`.
- Return `response.json.models.map((m: {name: string}) => m.name)`.
- On failure: throw an `Error` with a descriptive message.

#### `sendChatMessage(ollamaUrl: string, model: string, messages: ChatMessage[]): Promise<string>`
- Define `ChatMessage` interface: `{ role: "system" | "user" | "assistant"; content: string }`. Export it.
- `POST {ollamaUrl}/api/chat` using `requestUrl`.
- Body: `{ model, messages, stream: false }`.
- Return `response.json.message.content`.
- On failure: throw an `Error` with a descriptive message.

All three functions are standalone exports (no class). All use `import { requestUrl } from "obsidian"`.

### Step 4 — Chat View

**`src/chat-view.ts`** — create:

- Export `VIEW_TYPE_CHAT = "ai-organizer-chat"`.
- Export class `ChatView extends ItemView`.

#### Constructor
- Accept `leaf: WorkspaceLeaf` and a reference to the plugin instance (`AIOrganizer`). Store the plugin reference as a private property.

#### `getViewType()` → return `VIEW_TYPE_CHAT`.

#### `getDisplayText()` → return `"AI Chat"`.

#### `getIcon()` → return `"message-square"`.

#### `onOpen()`

Build the entire UI inside `this.contentEl`. The layout is a vertical flexbox split into two regions:

**Top region — Chat area** (flexbox column, `flex: 1`, overflow-y scroll):
- A message container `div` that holds chat message elements.
- Each message is a `div` with a CSS class indicating the role (`"user"` or `"assistant"`).
- Below the message container: an input row (flexbox row) with:
  - A `textarea` for user input (flex: 1, placeholder: `"Type a message..."`). Pressing Enter (without Shift) sends the message. Shift+Enter inserts a newline.
  - A send `button` (text: `"Send"`).
- The send button and Enter key trigger the send flow (defined below).
- While waiting for a response, disable the textarea and send button and change the button text to `"..."`.

**Bottom region — Settings panel** (fixed height, border-top separator, padding, overflow-y auto):
- A heading element: `"Settings"`.
- **Ollama URL**: Use an Obsidian `Setting` component.
  - Name: `"Ollama URL"`.
  - Description: `"Base URL of the Ollama server."`.
  - `addText` input pre-filled with `plugin.settings.ollamaUrl`.
  - `onChange`: update `plugin.settings.ollamaUrl` and call `plugin.saveSettings()`.
- **Test Connection**: Use an Obsidian `Setting` component.
  - Name: `"Test Connection"`.
  - Description: initially empty. This description element will be used to display the result.
  - `addButton` with text `"Test"`.
  - `onClick`: call `testConnection(plugin.settings.ollamaUrl)`.
    - On success: set the description to `"Connected — Ollama v{version}"`. Then automatically call `listModels` and populate the model dropdown (see below).
    - On failure: set the description to the error message.
- **Model Selection**: Use an Obsidian `Setting` component.
  - Name: `"Model"`.
  - Description: `"Select the model to use."`.
  - `addDropdown`.
  - Initially the dropdown has one option: `{ value: "", display: "Test connection first" }` and is disabled.
  - After a successful `testConnection` + `listModels`:
    - Clear the dropdown options (use `selectEl.empty()` on the underlying `<select>` element).
    - Add a placeholder option `{ value: "", display: "Select a model..." }`.
    - Add one option per model name returned by `listModels` (value and display are both the model name).
    - If `plugin.settings.model` matches one of the returned models, set the dropdown value to it.
    - Enable the dropdown.
  - `onChange`: update `plugin.settings.model` and call `plugin.saveSettings()`.

#### Send flow

1. Read the textarea value. If empty (after trim), do nothing.
2. If `plugin.settings.model` is empty, show a `Notice`: `"Select a model first."` and return.
3. Append a user message `div` to the message container with the textarea content.
4. Clear the textarea.
5. Scroll the message container to the bottom.
6. Maintain a local `ChatMessage[]` array as instance state on the view. Push `{ role: "user", content: text }`.
7. Disable input (textarea + button).
8. Call `sendChatMessage(plugin.settings.ollamaUrl, plugin.settings.model, messages)`.
9. On success:
   - Push `{ role: "assistant", content: response }` to the messages array.
   - Append an assistant message `div` to the message container.
   - Scroll to bottom.
10. On failure:
    - Show a `Notice` with the error message.
    - Append an assistant message `div` with class `"error"` and the text `"Error: {message}"`.
11. Re-enable input.

#### `onClose()`
- Empty `this.contentEl`.

#### Instance state
- `messages: ChatMessage[]` — starts as empty array. Resets when the view is re-opened.

### Step 5 — Main Plugin Class

**`src/main.ts`** — delete all existing content and replace:

- Import `Plugin`, `WorkspaceLeaf`, `Notice` from `"obsidian"`.
- Import `AIOrganizerSettings`, `DEFAULT_SETTINGS` from `"./settings"`.
- Import `ChatView`, `VIEW_TYPE_CHAT` from `"./chat-view"`.

- Export default class `AIOrganizer extends Plugin`:
  - Property: `settings: AIOrganizerSettings`.

  - `async onload()`:
    1. Call `await this.loadSettings()`.
    2. Register the chat view: `this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this))`.
    3. Add a ribbon icon:
       - Icon: `"message-square"`.
       - Tooltip: `"Open AI Chat"`.
       - Callback: call `this.activateView()`.
    4. Add a command:
       - `id`: `"open-chat"`.
       - `name`: `"Open AI Chat"`.
       - `callback`: call `this.activateView()`.

  - `onunload()`:
    1. `this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT)`.

  - `async activateView()`:
    1. Get existing leaves: `this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)`.
    2. If a leaf exists, call `this.app.workspace.revealLeaf(leaf)` on the first one.
    3. Otherwise:
       - Get a right sidebar leaf: `this.app.workspace.getRightLeaf(false)`.
       - Set its view state: `await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true })`.
       - Reveal it: `this.app.workspace.revealLeaf(leaf)`.

  - `async loadSettings()`:
    - `this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`.

  - `async saveSettings()`:
    - `await this.saveData(this.settings)`.

### Step 6 — Styles

**`styles.css`** — delete all existing content and replace with styles for:

- `.ai-organizer-chat-container`: vertical flexbox, full height (`height: 100%`).
- `.ai-organizer-messages-area`: top region. `flex: 1`, `overflow-y: auto`, `display: flex`, `flex-direction: column`.
- `.ai-organizer-messages`: the scrollable message list inside the messages area. `flex: 1`, `overflow-y: auto`, padding.
- `.ai-organizer-message`: individual message. Padding, margin-bottom, border-radius.
- `.ai-organizer-message.user`: right-aligned background. Use `--interactive-accent` for background, `--text-on-accent` for text color.
- `.ai-organizer-message.assistant`: left-aligned background. Use `--background-secondary` for background.
- `.ai-organizer-message.error`: use `--text-error` for text color.
- `.ai-organizer-input-row`: flexbox row, gap, padding.
- `.ai-organizer-input-row textarea`: `flex: 1`, resize vertical, use Obsidian CSS variables for background/border/text.
- `.ai-organizer-settings-panel`: bottom region. Fixed `min-height` (do NOT use a fixed pixel height — let it size to content). `border-top: 1px solid var(--background-modifier-border)`, padding, `overflow-y: auto`.

All class names are prefixed with `ai-organizer-` to avoid collisions. Use Obsidian CSS variables everywhere (no hardcoded colors).

---

## Verification Checklist

After completing all steps, verify:

1. `npm run build` succeeds with zero errors.
2. The plugin loads in Obsidian without console errors.
3. The ribbon icon and command `"Open AI Chat"` both open the chat sidebar.
4. The sidebar opens in the right panel on desktop.
5. The sidebar opens in the right drawer on mobile.
6. Entering an Ollama URL and clicking "Test" with Ollama running shows the version and populates the model dropdown.
7. Clicking "Test" with Ollama stopped shows an error in the description.
8. Selecting a model persists across plugin reload.
9. Typing a message and pressing Enter sends it and displays the AI response.
10. Pressing Shift+Enter in the textarea inserts a newline instead of sending.
11. The send button and textarea are disabled while waiting for a response.
12. A network error during chat shows a `Notice` and an error message in the chat.
13. The Ollama URL persists across plugin reload.

---

## Constraints

- Do NOT use `PluginSettingTab`. All settings are in the sidebar view.
- Do NOT use streaming for chat in this stage. Set `stream: false` on all Ollama requests.
- Do NOT store chat history in `data.json`. Chat history lives only in view instance memory and resets on close/reopen.
- Do NOT hardcode colors. Use Obsidian CSS variables.
- All CSS class names must be prefixed with `ai-organizer-`.
- `manifest.json` must have `isDesktopOnly: false`.
