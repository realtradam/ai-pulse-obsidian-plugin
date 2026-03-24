# Plugin Feature Ideas

Ideas for the AI Pulse plugin, drawn from the Obsidian and Ollama APIs.

---

## High Impact

### 1. Embedding-Based Semantic Search Tool

Use Ollama's `/api/embed` endpoint to generate vector embeddings for vault notes. Store them in a local index (Dexie/IndexedDB). Add a `semantic_search` tool that finds notes by meaning rather than exact text match.

**APIs**: Ollama `/api/embed`, Dexie (IndexedDB), cosine similarity
**Why**: Massive upgrade over `grep_search` — the AI can find conceptually related notes even when wording differs.

### 2. Frontmatter Management Tool ✅ IMPLEMENTED

A `set_frontmatter` tool using `app.fileManager.processFrontMatter()` to let the AI add/update tags, aliases, categories, dates, etc. Atomic read-modify-save on the YAML block. The `read_file` tool also automatically includes parsed frontmatter as JSON.

**APIs**: `FileManager.processFrontMatter(file, fn)`, `metadataCache.getFileCache()`
**Why**: Much safer than `edit_file` for metadata operations. No risk of breaking YAML formatting.

### 3. Auto-Process on File Creation

When a new note is created, automatically queue it for AI processing (tagging, linking suggestions, folder placement). Uses vault `create` events.

**APIs**: `vault.on('create')`, `workspace.onLayoutReady()` (to skip initial load events)
**Why**: This is the core "organizer" part of the plugin. Makes the AI proactive rather than reactive.

### 4. Vault Context Injection ✅ IMPLEMENTED

Before each message, automatically inject a summary of the vault structure (folder tree, tag taxonomy, recent files) so the AI understands the vault without needing to search first. Togglable in settings with configurable recent files count.

**APIs**: `metadataCache` (tags, links, headings, frontmatter), `vault.getAllFolders()`, `vault.getMarkdownFiles()`
**Why**: Gives the AI immediate awareness of the vault. Cheap to compute from the metadata cache.

---

## Medium Impact

### 5. Backlinks / Related Notes Tool

A `get_related_notes` tool that uses `metadataCache.resolvedLinks` to find backlinks and forward links for a given note.

**APIs**: `metadataCache.resolvedLinks`, `metadataCache.unresolvedLinks`
**Why**: Helps the AI understand note relationships and make better suggestions.

### 6. Batch Operations

A `batch_move` or `batch_tag` command that lets the AI propose bulk changes (move 20 notes into folders, add tags to untagged notes) with a single approval step instead of 20 individual approvals.

**APIs**: `FileManager.renameFile()`, `FileManager.processFrontMatter()`, custom approval UI
**Why**: Current per-file approval is tedious for bulk operations. A summary-and-confirm flow would be much smoother.

### 7. Conversation Persistence

Save chat history to a vault note (or `data.json`) so conversations survive plugin reloads. Allow users to resume previous conversations.

**APIs**: `Plugin.loadData()` / `Plugin.saveData()`, or `vault.create()` for markdown export
**Why**: Conversations are currently lost on reload. Persistence enables long-running workflows.

### 8. Streaming Thinking / Reasoning Display

If using thinking models (Qwen 3, DeepSeek R1), display the `<think>` reasoning trace in a collapsible block, separate from the main response.

**APIs**: Ollama `think` parameter, streaming two-phase output (thinking chunks then content chunks)
**Why**: Transparency into the AI's reasoning. Useful for debugging prompts and understanding decisions.

---

## Lower Effort / Polish

### 9. Template-Based File Creation

Let the AI use vault templates when creating notes. Read a template file, fill in variables, create the note.

**APIs**: `vault.cachedRead()` for template files, `vault.create()` for output
**Why**: Consistent note formatting without repeating instructions in every prompt.

### 10. Status Bar Indicator

Show connection status and current model in Obsidian's status bar.

**APIs**: `Plugin.addStatusBarItem()`
**Why**: At-a-glance awareness without opening the chat panel.

### 11. Command Palette Integration

Add commands like "AI: Organize current note", "AI: Suggest tags", "AI: Summarize note" that pre-fill the chat with specific prompts.

**APIs**: `Plugin.addCommand()`, editor commands with `editorCallback`
**Why**: Quick access to common workflows without typing prompts manually.

### 12. Multi-Model Support

Let users configure different models for different tasks (e.g. a small fast model for auto-tagging, a large model for chat, an embedding model for semantic search).

**APIs**: Ollama `/api/tags` (list models), settings UI
**Why**: Optimizes speed and quality per task. Embedding models are tiny and fast; chat models can be large.

### 13. Vision Preprocessing (Image-to-Text)

When a user attaches an image to a chat message, send it to a vision model (e.g. `moondream`, `llava`, `llama3.2-vision`) in a standalone request asking it to describe everything visible — objects, text, numbers, layout. The text summary is then injected into the main conversation as context, replacing the raw image.

**Flow**:
1. User attaches an image (from vault or clipboard)
2. Plugin reads the image binary, base64-encodes it
3. Standalone `/api/chat` request to the vision model with `images` field: "Describe everything you see in this image, including all text and numbers."
4. Vision model response (~100 tokens) is injected into the conversation as `[Image description: ...]`
5. Main chat model processes the text description as normal

**APIs**: Ollama `/api/chat` with `images` field, `vault.readBinary()`, base64 encoding
**Why**: Raw base64 images consume massive context (~1.3MB for a 1MB image). Preprocessing shrinks this to a small paragraph while preserving all useful information. Also enables non-vision chat models to reason about images. Pairs naturally with multi-model support (idea #12) — configure a dedicated small/fast vision model separately from the main chat model.
