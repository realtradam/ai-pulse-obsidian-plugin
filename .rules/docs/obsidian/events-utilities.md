# Obsidian Events, Utilities & Platform

## Events System

Many Obsidian classes extend `Events` (Vault, MetadataCache, Workspace, WorkspaceLeaf).

### Events Base Class

| Method | Description |
|--------|-------------|
| `on(name, callback, ctx?)` | Subscribe to event. Returns `EventRef`. |
| `off(name, callback)` | Unsubscribe by callback |
| `offref(ref)` | Unsubscribe by `EventRef` |
| `trigger(name, ...data)` | Emit event |

### Registering Events in Plugins

**Always** use `this.registerEvent()` to auto-detach on unload:

```typescript
this.registerEvent(
  this.app.vault.on('create', (file) => {
    console.log('File created:', file.path);
  })
);
```

### Timing / Intervals

Use `this.registerInterval()` for auto-cleanup:

```typescript
this.registerInterval(
  window.setInterval(() => this.doPeriodicTask(), 60000)
);
```

Use `window.setInterval` (not plain `setInterval`) to avoid TypeScript NodeJS/Browser confusion.

### DOM Events

```typescript
this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
  // Auto-detached on unload
});
```

## Platform Detection

```typescript
import { Platform } from 'obsidian';

Platform.isDesktop      // true on desktop
Platform.isMobile       // true on mobile
Platform.isDesktopApp   // true on desktop app
Platform.isMobileApp    // true on mobile app
Platform.isIosApp       // iOS
Platform.isAndroidApp   // Android
Platform.isPhone        // phone form factor
Platform.isTablet       // tablet form factor
Platform.isMacOS        // macOS
Platform.isWin          // Windows
Platform.isLinux        // Linux
Platform.isSafari       // Safari engine
```

## HTTP Requests

Use `requestUrl` for cross-platform HTTP (bypasses CORS):

```typescript
import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';

const response: RequestUrlResponse = await requestUrl({
  url: 'https://api.example.com/data',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
  contentType: 'application/json',
  throw: true,  // throw on 400+ status (default: true)
});

// Response properties:
response.status;      // number
response.headers;     // Record<string, string>
response.text;        // string
response.json;        // any (parsed JSON)
response.arrayBuffer; // ArrayBuffer
```

### RequestUrlParam

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | `string` | Yes | Request URL |
| `method` | `string` | No | HTTP method (GET, POST, etc.) |
| `headers` | `Record<string, string>` | No | Request headers |
| `body` | `string \| ArrayBuffer` | No | Request body |
| `contentType` | `string` | No | Content-Type header shorthand |
| `throw` | `boolean` | No | Throw on 400+ (default `true`) |

## Moment.js

Obsidian bundles Moment.js. Import directly:

```typescript
import { moment } from 'obsidian';

const now = moment();
const formatted = now.format('YYYY-MM-DD HH:mm:ss');
const yesterday = moment().subtract(1, 'day');
```

## Debouncing

```typescript
import { debounce } from 'obsidian';

const debouncedSave = debounce((data: string) => {
  // Save logic
}, 1000, true); // fn, wait ms, immediate?
```

Debouncer interface methods: `cancel()`, `run()` (flush immediately).

## Obsidian Protocol Handler

Handle `obsidian://` URLs:

```typescript
this.registerObsidianProtocolHandler('my-action', (params) => {
  // params: ObsidianProtocolData (Record<string, string>)
  // URL: obsidian://my-action?param1=value1&param2=value2
  console.log(params.param1);
});
```

## Secret Storage

Secure credential storage (v1.11.4):

```typescript
const storage = this.app.secretStorage;

// Store a secret
await storage.set('api-key', 'sk-...');

// Retrieve a secret
const key = await storage.get('api-key');

// Delete a secret
await storage.delete('api-key');
```

## Ollama Communication Patterns

The AI note organizer communicates with a local Ollama instance via its REST API.

### Ollama API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `http://localhost:11434/api/generate` | POST | Single prompt completion |
| `http://localhost:11434/api/chat` | POST | Multi-turn chat completion |
| `http://localhost:11434/api/tags` | GET | List available models |
| `http://localhost:11434/api/embeddings` | POST | Generate text embeddings |
| `http://localhost:11434/api/show` | POST | Get model info |

### Generate Request

```typescript
import { requestUrl } from 'obsidian';

async function ollamaGenerate(
  ollamaUrl: string,
  model: string,
  prompt: string,
  system?: string
): Promise<string> {
  const response = await requestUrl({
    url: `${ollamaUrl}/api/generate`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system,
      stream: false,  // IMPORTANT: set false for non-streaming
    }),
  });
  return response.json.response;
}
```

### Chat Request

```typescript
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function ollamaChat(
  ollamaUrl: string,
  model: string,
  messages: OllamaMessage[]
): Promise<string> {
  const response = await requestUrl({
    url: `${ollamaUrl}/api/chat`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });
  return response.json.message.content;
}
```

### List Models

```typescript
async function ollamaListModels(ollamaUrl: string): Promise<string[]> {
  const response = await requestUrl({
    url: `${ollamaUrl}/api/tags`,
    method: 'GET',
  });
  return response.json.models.map((m: any) => m.name);
}
```

### Generate Embeddings

```typescript
async function ollamaEmbed(
  ollamaUrl: string,
  model: string,
  input: string
): Promise<number[]> {
  const response = await requestUrl({
    url: `${ollamaUrl}/api/embeddings`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: input }),
  });
  return response.json.embedding;
}
```

### Error Handling

```typescript
try {
  const result = await ollamaGenerate(url, model, prompt);
} catch (err) {
  if (err.status === 0 || err.message?.includes('net')) {
    new Notice('Cannot connect to Ollama. Is it running?');
  } else {
    new Notice(`Ollama error: ${err.message}`);
  }
}
```

### Settings Pattern for Ollama

```typescript
interface AISettings {
  ollamaUrl: string;       // default: 'http://localhost:11434'
  model: string;           // default: 'llama3.2'
  embeddingModel: string;  // default: 'nomic-embed-text'
  autoProcess: boolean;
  systemPrompt: string;
}
```

### Note Analysis Pattern

```typescript
async function analyzeNote(app: App, settings: AISettings, file: TFile) {
  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);

  const prompt = `Analyze this note and suggest tags, related topics, and a brief summary.

Title: ${file.basename}
Existing tags: ${cache?.frontmatter?.tags?.join(', ') || 'none'}
Content:
${content}`;

  const result = await ollamaGenerate(settings.ollamaUrl, settings.model, prompt);

  // Parse AI response and update frontmatter
  const parsed = JSON.parse(result); // assuming structured output
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.tags = parsed.tags;
    fm.summary = parsed.summary;
    fm.aiProcessed = new Date().toISOString();
  });
}
```

## Useful Import Summary

```typescript
import {
  // Core
  App, Plugin, Component, PluginManifest,
  // Files
  TFile, TFolder, TAbstractFile, Vault, FileManager,
  // Metadata
  MetadataCache, CachedMetadata, FrontMatterCache,
  // Workspace
  Workspace, WorkspaceLeaf, View, ItemView, MarkdownView,
  // UI
  Modal, SuggestModal, FuzzySuggestModal,
  Setting, PluginSettingTab,
  Menu, MenuItem, Notice,
  // Editor
  Editor, EditorPosition, EditorRange, MarkdownRenderer,
  // Events
  Events, EventRef,
  // Utilities
  Platform, moment, debounce, requestUrl,
  // Types
  Command, Hotkey, IconName, ViewCreator,
  RequestUrlParam, RequestUrlResponse,
} from 'obsidian';
```
