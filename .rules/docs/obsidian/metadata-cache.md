# Obsidian MetadataCache API

Access via `this.app.metadataCache`. Extends `Events`.

The MetadataCache provides parsed/indexed metadata for all vault files without reading file content directly.

## Terminology

- **Linktext**: Internal link with path + subpath, e.g., `My note#Heading`
- **Linkpath / path**: The path portion of a linktext
- **Subpath**: The heading/block ID portion of a linktext

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `resolvedLinks` | `Record<string, Record<string, number>>` | Map: source path → { dest path → link count }. All paths are vault-absolute. |
| `unresolvedLinks` | `Record<string, Record<string, number>>` | Map: source path → { unknown dest → count } |

## Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getFileCache(file: TFile)` | `CachedMetadata \| null` | Get cached metadata for a file |
| `getCache(path: string)` | `CachedMetadata \| null` | Get cached metadata by path (v0.14.5) |
| `getFirstLinkpathDest(linkpath, sourcePath)` | `TFile \| null` | Resolve a link path to a file (best match). (v0.12.5) |
| `fileToLinktext(file, sourcePath, omitMdExtension?)` | `string` | Generate linktext for a file. Uses filename if unique, full path otherwise. |

## MetadataCache Events

| Event | Callback Args | Description |
|-------|--------------|-------------|
| `'changed'` | `(file: TFile, data: string, cache: CachedMetadata)` | File indexed, cache updated. **Not fired on rename** — use vault `rename` event. |
| `'deleted'` | `(file: TFile, prevCache: CachedMetadata \| null)` | File deleted. Previous cache provided best-effort. |
| `'resolve'` | `(file: TFile)` | File's links resolved in `resolvedLinks`/`unresolvedLinks`. |
| `'resolved'` | `()` | All files resolved. Fires after initial load and each subsequent modification. |

```typescript
// Example: React to metadata changes
this.registerEvent(
  this.app.metadataCache.on('changed', (file, data, cache) => {
    if (cache.frontmatter?.tags?.includes('important')) {
      console.log('Important file changed:', file.path);
    }
  })
);
```

## CachedMetadata Interface

Returned by `getFileCache()` / `getCache()`. All properties are optional.

| Property | Type | Description |
|----------|------|-------------|
| `frontmatter` | `FrontMatterCache` | Parsed YAML frontmatter as key-value object |
| `frontmatterPosition` | `Pos` | Position of frontmatter block in file (v1.4.0) |
| `frontmatterLinks` | `FrontmatterLinkCache[]` | Links found in frontmatter (v1.4.0) |
| `headings` | `HeadingCache[]` | All headings |
| `links` | `LinkCache[]` | All internal `[[links]]` |
| `embeds` | `EmbedCache[]` | All `![[embeds]]` |
| `tags` | `TagCache[]` | All inline `#tags` |
| `listItems` | `ListItemCache[]` | All list items |
| `sections` | `SectionCache[]` | Root-level markdown blocks |
| `blocks` | `Record<string, BlockCache>` | Named blocks (by block ID) |
| `footnotes` | `FootnoteCache[]` | Footnote definitions (v1.6.6) |
| `footnoteRefs` | `FootnoteRefCache[]` | Footnote references (v1.8.7) |
| `referenceLinks` | `ReferenceLinkCache[]` | Reference-style links (v1.8.7) |

### FrontMatterCache

A plain object with YAML frontmatter keys as properties. Access properties directly:

```typescript
const cache = this.app.metadataCache.getFileCache(file);
if (cache?.frontmatter) {
  const title = cache.frontmatter.title;
  const tags = cache.frontmatter.tags; // string[]
  const aliases = cache.frontmatter.aliases; // string[]
}
```

### HeadingCache

| Property | Type | Description |
|----------|------|-------------|
| `heading` | `string` | Heading text |
| `level` | `number` | 1-6 |
| `position` | `Pos` | Position in file |

### LinkCache

| Property | Type | Description |
|----------|------|-------------|
| `link` | `string` | Link destination |
| `displayText` | `string?` | Display text if different (from `[[page|display]]`) |
| `original` | `string` | Raw text as written in document |
| `position` | `Pos` | Position in file |

### TagCache

| Property | Type | Description |
|----------|------|-------------|
| `tag` | `string` | Tag including `#` prefix (e.g., `"#mytag"`) |
| `position` | `Pos` | Position in file |

### Pos (Position)

```typescript
interface Pos {
  start: Loc;  // { line: number, col: number, offset: number }
  end: Loc;
}
```

### FrontMatterInfo

Returned by `getFrontMatterInfo(content: string)` standalone function:

| Property | Type | Description |
|----------|------|-------------|
| `exists` | `boolean` | Whether frontmatter block exists |
| `frontmatter` | `string` | String content of frontmatter |
| `from` | `number` | Start offset (excluding `---`) |
| `to` | `number` | End offset (excluding `---`) |
| `contentStart` | `number` | Offset where frontmatter block ends (including `---`) |

## Common Patterns

### Get all tags for a file
```typescript
const cache = this.app.metadataCache.getFileCache(file);
const inlineTags = cache?.tags?.map(t => t.tag) ?? [];
const fmTags = cache?.frontmatter?.tags ?? [];
const allTags = [...inlineTags, ...fmTags];
```

### Find all files linking to a file
```typescript
function getBacklinks(app: App, filePath: string): string[] {
  const backlinks: string[] = [];
  for (const [source, links] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (links[filePath]) {
      backlinks.push(source);
    }
  }
  return backlinks;
}
```

### Resolve a link
```typescript
const targetFile = this.app.metadataCache.getFirstLinkpathDest('My Note', currentFile.path);
if (targetFile) {
  const content = await this.app.vault.cachedRead(targetFile);
}
```

### Collect all vault metadata for AI context
```typescript
function collectVaultSummary(app: App): { path: string; tags: string[]; links: string[]; headings: string[] }[] {
  return app.vault.getMarkdownFiles().map(file => {
    const cache = app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      tags: [
        ...(cache?.tags?.map(t => t.tag) ?? []),
        ...(cache?.frontmatter?.tags ?? []),
      ],
      links: cache?.links?.map(l => l.link) ?? [],
      headings: cache?.headings?.map(h => h.heading) ?? [],
    };
  });
}
```

### Find untagged notes (candidates for AI tagging)
```typescript
function getUntaggedNotes(app: App): TFile[] {
  return app.vault.getMarkdownFiles().filter(file => {
    const cache = app.metadataCache.getFileCache(file);
    const inlineTags = cache?.tags ?? [];
    const fmTags = cache?.frontmatter?.tags ?? [];
    return inlineTags.length === 0 && fmTags.length === 0;
  });
}
```

### Find orphan notes (no inbound or outbound links)
```typescript
function getOrphanNotes(app: App): TFile[] {
  const { resolvedLinks } = app.metadataCache;
  const linked = new Set<string>();
  for (const [source, targets] of Object.entries(resolvedLinks)) {
    if (Object.keys(targets).length > 0) linked.add(source);
    for (const dest of Object.keys(targets)) linked.add(dest);
  }
  return app.vault.getMarkdownFiles().filter(f => !linked.has(f.path));
}
```

### Wait for metadata cache to be ready
```typescript
// In onload(), ensure all metadata is indexed before processing:
if (this.app.metadataCache.resolvedLinks) {
  // Already resolved
  this.startProcessing();
} else {
  this.registerEvent(
    this.app.metadataCache.on('resolved', () => {
      this.startProcessing();
    })
  );
}
```
