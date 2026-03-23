# Obsidian Vault API — Files & Folders

## TAbstractFile (abstract base)

Base class for both files and folders. Check type with `instanceof TFile` or `instanceof TFolder`.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Filename with extension (e.g., `"note.md"`) |
| `path` | `string` | Vault-relative path (e.g., `"folder/note.md"`) |
| `parent` | `TFolder \| null` | Parent folder (`null` for vault root) |
| `vault` | `Vault` | Reference to the vault |

## TFile

Represents a file. Extends `TAbstractFile`.

| Property | Type | Description |
|----------|------|-------------|
| `basename` | `string` | Filename without extension (e.g., `"note"`) |
| `extension` | `string` | File extension (e.g., `"md"`) |
| `stat` | `FileStats` | File statistics |

### FileStats

| Property | Type | Description |
|----------|------|-------------|
| `ctime` | `number` | Creation time (unix ms) |
| `mtime` | `number` | Last modified time (unix ms) |
| `size` | `number` | Size in bytes |

## TFolder

Represents a folder. Extends `TAbstractFile`.

| Property | Type | Description |
|----------|------|-------------|
| `children` | `TAbstractFile[]` | Direct children (files and subfolders) |

| Method | Description |
|--------|-------------|
| `isRoot(): boolean` | Whether this is the vault root folder |

## Vault Class

Access via `this.app.vault`. Extends `Events`.

| Property | Type | Description |
|----------|------|-------------|
| `adapter` | `DataAdapter` | Low-level file system access |
| `configDir` | `string` | Config folder path (usually `.obsidian`) |

### Querying Files

| Method | Returns | Description |
|--------|---------|-------------|
| `getFiles()` | `TFile[]` | All files in vault |
| `getMarkdownFiles()` | `TFile[]` | All `.md` files |
| `getAllLoadedFiles()` | `TAbstractFile[]` | All files and folders |
| `getAllFolders(includeRoot?)` | `TFolder[]` | All folders |
| `getAbstractFileByPath(path)` | `TAbstractFile \| null` | Get file or folder by path |
| `getFileByPath(path)` | `TFile \| null` | Get file by path |
| `getFolderByPath(path)` | `TFolder \| null` | Get folder by path |
| `getRoot()` | `TFolder` | Vault root folder |
| `getName()` | `string` | Vault name |
| `getResourcePath(file)` | `string` | URI for browser engine (e.g., images) |

### Reading Files

| Method | Returns | Description |
|--------|---------|-------------|
| `read(file)` | `Promise<string>` | Read from disk. Use when you intend to modify the content. |
| `cachedRead(file)` | `Promise<string>` | Read from cache. Better performance for display-only. |
| `readBinary(file)` | `Promise<ArrayBuffer>` | Read binary file |

**When to use which**: Use `cachedRead()` for display. Use `read()` if you'll modify and write back (avoids stale data). Cache is flushed on save or external change.

### Writing Files

| Method | Description |
|--------|-------------|
| `create(path, data, options?)` | Create new plaintext file. Returns `Promise<TFile>`. |
| `createBinary(path, data, options?)` | Create new binary file |
| `createFolder(path)` | Create new folder |
| `modify(file, data, options?)` | Overwrite file content |
| `modifyBinary(file, data, options?)` | Overwrite binary content |
| `append(file, data, options?)` | Append text to file |
| `appendBinary(file, data, options?)` | Append binary data |
| `process(file, fn, options?)` | **Preferred**: Atomically read-modify-save. `fn(data) => newData` is synchronous. |

**Important**: Always prefer `process()` over separate `read()`/`modify()` to prevent data loss from concurrent changes.

#### Async Modification Pattern

```typescript
// For async operations between read and write:
const content = await vault.cachedRead(file);
const newContent = await transformAsync(content);
await vault.process(file, (data) => {
  if (data !== content) {
    // File changed since we read it — handle conflict
    return data; // or merge, or prompt user
  }
  return newContent;
});
```

### Moving/Renaming/Deleting Files

| Method | Description |
|--------|-------------|
| `rename(file, newPath)` | Rename/move. **Does NOT update links.** Use `FileManager.renameFile()` instead. |
| `copy(file, newPath)` | Copy file or folder |
| `delete(file, force?)` | Permanently delete |
| `trash(file, system?)` | Move to trash. `system=true` for OS trash, `false` for `.trash/` folder. |

### Static Methods

| Method | Description |
|--------|-------------|
| `Vault.recurseChildren(root, cb)` | Recursively iterate all children |

### Vault Events

Subscribe via `this.app.vault.on(...)`. Always wrap with `this.registerEvent(...)`.

| Event | Callback Args | Description |
|-------|--------------|-------------|
| `'create'` | `(file: TAbstractFile)` | File created. Also fires on vault load for existing files. Register inside `workspace.onLayoutReady()` to skip initial load events. |
| `'modify'` | `(file: TAbstractFile)` | File modified |
| `'delete'` | `(file: TAbstractFile)` | File deleted |
| `'rename'` | `(file: TAbstractFile, oldPath: string)` | File renamed/moved |

```typescript
// Example: Listen for file creation
this.registerEvent(
  this.app.vault.on('create', (file) => {
    if (file instanceof TFile) {
      console.log('New file:', file.path);
    }
  })
);
```

## FileManager Class

Access via `this.app.fileManager`. Higher-level file operations.

| Method | Description |
|--------|-------------|
| `renameFile(file, newPath)` | Rename/move and **auto-update all links** per user preferences |
| `trashFile(file)` | Delete respecting user's trash preferences |
| `promptForDeletion(file)` | Show confirmation dialog before deleting |
| `generateMarkdownLink(file, sourcePath, subpath?, alias?)` | Generate `[[link]]` or `[alias](path)` based on user preferences |
| `getNewFileParent(sourcePath, newFilePath)` | Get folder for new files based on user preferences |
| `getAvailablePathForAttachment(filename, sourcePath)` | Resolve unique attachment path, deduplicating if needed |
| `processFrontMatter(file, fn, options?)` | Atomically read/modify/save frontmatter as JS object |

### Frontmatter Processing

```typescript
// Add or update frontmatter properties
await this.app.fileManager.processFrontMatter(file, (fm) => {
  fm.tags = ['ai', 'organized'];
  fm.lastProcessed = new Date().toISOString();
});
```

The `fm` object is mutated directly. Handle errors from this method.

## DataAdapter Interface

Low-level filesystem access via `this.app.vault.adapter`. Prefer Vault API when possible.

| Method | Description |
|--------|-------------|
| `exists(path, sensitive?)` | Check if path exists |
| `read(path)` / `readBinary(path)` | Read file by path string |
| `write(path, data)` / `writeBinary(path, data)` | Write file (creates if needed) |
| `append(path, data)` | Append to file |
| `process(path, fn)` | Atomic read-modify-save |
| `mkdir(path)` | Create directory |
| `list(path)` | List files/folders (non-recursive) |
| `stat(path)` | Get file metadata |
| `remove(path)` | Delete file |
| `rmdir(path, recursive?)` | Remove directory |
| `rename(path, newPath)` | Rename/move |
| `copy(path, newPath)` | Copy file |
| `trashLocal(path)` | Move to `.trash/` |
| `trashSystem(path)` | Move to OS trash |
| `getResourcePath(path)` | Get browser-usable URI |

**Note**: Vault API only accesses files visible in the app. Hidden folders (like `.obsidian`) require the DataAdapter.

## AI Note Organizer Patterns

### Batch Processing All Notes

```typescript
async function processAllNotes(app: App) {
  const files = app.vault.getMarkdownFiles();
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    // Skip already-processed files
    if (cache?.frontmatter?.aiProcessed) continue;

    const content = await app.vault.cachedRead(file);
    // Send to AI, get results, then update:
    await app.fileManager.processFrontMatter(file, (fm) => {
      fm.tags = ['ai-suggested-tag'];
      fm.aiProcessed = new Date().toISOString();
    });
  }
}
```

### Moving Notes into Organized Folders

```typescript
async function organizeNote(app: App, file: TFile, targetFolder: string) {
  // Ensure folder exists
  if (!app.vault.getFolderByPath(targetFolder)) {
    await app.vault.createFolder(targetFolder);
  }
  // renameFile updates all links automatically
  const newPath = `${targetFolder}/${file.name}`;
  await app.fileManager.renameFile(file, newPath);
}
```

### Creating AI-Generated Summary Notes

```typescript
async function createSummaryNote(vault: Vault, folder: string, title: string, content: string) {
  const path = `${folder}/${title}.md`;
  const existing = vault.getFileByPath(path);
  if (existing) {
    await vault.modify(existing, content);
  } else {
    await vault.create(path, content);
  }
}
```

### Auto-Processing on File Change

```typescript
// In onload():
this.registerEvent(
  this.app.vault.on('modify', async (file) => {
    if (file instanceof TFile && file.extension === 'md') {
      // Debounce or queue for AI processing
      this.queueForProcessing(file);
    }
  })
);

// Skip initial vault load events:
this.app.workspace.onLayoutReady(() => {
  this.registerEvent(
    this.app.vault.on('create', async (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        this.queueForProcessing(file);
      }
    })
  );
});
```

### Building a Note Graph for AI Context

```typescript
function buildNoteGraph(app: App): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
    graph.set(source, Object.keys(targets));
  }
  return graph;
}

function getRelatedNotes(app: App, filePath: string): string[] {
  const related = new Set<string>();
  // Outgoing links
  const outgoing = app.metadataCache.resolvedLinks[filePath];
  if (outgoing) Object.keys(outgoing).forEach(p => related.add(p));
  // Incoming links (backlinks)
  for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (targets[filePath]) related.add(source);
  }
  return [...related];
}
```

```typescript
const item = this.app.vault.getAbstractFileByPath('path/to/something');
if (item instanceof TFile) {
  // It's a file
} else if (item instanceof TFolder) {
  // It's a folder
}
```
