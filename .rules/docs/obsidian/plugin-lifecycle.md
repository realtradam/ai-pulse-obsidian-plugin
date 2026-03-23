# Obsidian Plugin Lifecycle & Structure

## manifest.json

Every plugin requires a `manifest.json` in the plugin root:

```json
{
  "id": "my-plugin-id",
  "name": "Display Name",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "What the plugin does",
  "author": "Author Name",
  "authorUrl": "https://example.com",
  "isDesktopOnly": false,
  "fundingUrl": "https://buymeacoffee.com"
}
```

- `id` (string, required): Globally unique. Cannot contain `obsidian`. Must match plugin folder name for local dev.
- `name` (string, required): Display name.
- `version` (string, required): Semantic versioning `x.y.z`.
- `minAppVersion` (string, required): Minimum Obsidian version.
- `description` (string, required): Plugin description.
- `isDesktopOnly` (boolean, required): Set `true` if using NodeJS/Electron APIs.
- `fundingUrl` (string|object, optional): Single URL string or `{ "Label": "url" }` object.

## Plugin Class

```typescript
import { Plugin } from 'obsidian';

export default class MyPlugin extends Plugin {
  async onload() {
    // Called when plugin is enabled. Register all resources here.
  }

  async onunload() {
    // Called when plugin is disabled. Release all resources.
  }
}
```

`Plugin extends Component`. Access `this.app` (App) and `this.manifest` (PluginManifest).

### Key Plugin Methods

| Method | Description |
|--------|-------------|
| `onload()` | Setup: register commands, views, events, settings |
| `onunload()` | Cleanup: runs automatically for registered resources |
| `onUserEnable()` | Called when user explicitly enables plugin. Safe to open views here. (v1.7.2) |
| `loadData(): Promise<any>` | Load `data.json` from plugin folder |
| `saveData(data: any): Promise<void>` | Save to `data.json` in plugin folder |
| `onExternalSettingsChange()` | Called when `data.json` modified externally (e.g., Sync). (v1.5.7) |
| `addCommand(command)` | Register global command (auto-prefixed with plugin id/name) |
| `addRibbonIcon(icon, title, callback)` | Add icon to left sidebar ribbon |
| `addStatusBarItem(): HTMLElement` | Add status bar item (desktop only) |
| `addSettingTab(tab)` | Register settings tab |
| `registerView(type, factory)` | Register custom view type |
| `registerEvent(eventRef)` | Register event (auto-detached on unload) |
| `registerDomEvent(el, type, cb)` | Register DOM event (auto-detached on unload) |
| `registerInterval(id)` | Register interval (auto-cancelled on unload). Use `window.setInterval()`. |
| `registerMarkdownPostProcessor(fn, sortOrder)` | Register reading-mode post processor |
| `registerMarkdownCodeBlockProcessor(lang, handler)` | Register custom code block handler |
| `registerEditorExtension(extension)` | Register CodeMirror 6 extension |
| `registerEditorSuggest(suggest)` | Register live typing suggestions (v0.12.7) |
| `registerObsidianProtocolHandler(action, handler)` | Handle `obsidian://` URLs |
| `registerExtensions(exts, viewType)` | Register file extensions for a view type |
| `removeCommand(commandId)` | Dynamically remove a command (v1.7.2) |

## Component Class (Base)

`Plugin` extends `Component`. All Component methods are available:

| Method | Description |
|--------|-------------|
| `addChild(component)` | Add child component (loaded if parent loaded) |
| `removeChild(component)` | Remove and unload child component |
| `register(cb)` | Register cleanup callback for unload |
| `load()` / `unload()` | Manually control lifecycle |

## App Object

Access via `this.app` in Plugin or any View. Core properties:

| Property | Type | Description |
|----------|------|-------------|
| `vault` | `Vault` | File/folder operations |
| `workspace` | `Workspace` | UI layout, leaves, views |
| `metadataCache` | `MetadataCache` | Cached file metadata (links, tags, frontmatter) |
| `fileManager` | `FileManager` | High-level file operations (rename with link updates, frontmatter) |
| `keymap` | `Keymap` | Keyboard shortcut management |
| `scope` | `Scope` | Current keyboard scope |
| `secretStorage` | `SecretStorage` | Secure storage for secrets (v1.11.4) |

### App Methods

- `isDarkMode(): boolean` - Check if dark mode is active (v1.10.0)
- `loadLocalStorage(key): string | null` - Load vault-specific localStorage value
- `saveLocalStorage(key, data)` - Save vault-specific localStorage value. Pass `null` to clear.

## Settings Pattern (AI Note Organizer)

```typescript
interface AIOrganizerSettings {
  ollamaUrl: string;
  model: string;
  embeddingModel: string;
  autoProcessOnCreate: boolean;
  autoProcessOnModify: boolean;
  excludeFolders: string[];
  systemPrompt: string;
  batchSize: number;
}

const DEFAULT_SETTINGS: Partial<AIOrganizerSettings> = {
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3.2',
  embeddingModel: 'nomic-embed-text',
  autoProcessOnCreate: false,
  autoProcessOnModify: false,
  excludeFolders: ['.obsidian', 'templates'],
  systemPrompt: 'You are a note organization assistant.',
  batchSize: 10,
};

export default class AIOrganizer extends Plugin {
  settings: AIOrganizerSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AIOrganizerSettingTab(this.app, this));

    // Register commands for AI operations
    this.addCommand({
      id: 'analyze-current-note',
      name: 'Analyze current note with AI',
      editorCallback: async (editor, ctx) => { /* ... */ },
    });

    this.addCommand({
      id: 'batch-organize',
      name: 'Batch organize all notes',
      callback: async () => { /* ... */ },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

**Warning**: `Object.assign` does shallow copy. Deep copy nested objects (like `excludeFolders` array) manually.

## File Structure

A typical plugin folder in `.obsidian/plugins/<plugin-id>/`:
- `manifest.json` - Plugin metadata
- `main.js` - Compiled plugin code
- `styles.css` - Optional CSS styles
- `data.json` - Auto-created by `saveData()`
