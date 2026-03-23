# Obsidian Editor API

## Editor Class

Access via `MarkdownView.editor` or through editor commands. Abstracts CodeMirror 5/6.

```typescript
// Get editor from active view
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  const editor = view.editor;
  // ...
}

// Or use editorCallback in commands
this.addCommand({
  id: 'my-cmd',
  name: 'My Command',
  editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
    // editor is available here
  },
});
```

### Cursor & Selection

| Method | Returns | Description |
|--------|---------|-------------|
| `getCursor(side?)` | `EditorPosition` | Get cursor position. `side`: `'from'`, `'to'`, `'head'`, `'anchor'` |
| `setCursor(pos)` | `void` | Set cursor position |
| `getSelection()` | `string` | Get selected text |
| `setSelection(anchor, head?)` | `void` | Set selection range |
| `setSelections(ranges, main?)` | `void` | Set multiple selections |
| `listSelections()` | `EditorSelection[]` | Get all selections |
| `somethingSelected()` | `boolean` | Check if anything is selected |
| `wordAt(pos)` | `EditorRange \| null` | Get word boundaries at position |

### EditorPosition

```typescript
interface EditorPosition {
  line: number;  // 0-based line number
  ch: number;    // 0-based character offset in line
}
```

### Reading Content

| Method | Returns | Description |
|--------|---------|-------------|
| `getValue()` | `string` | Entire document content |
| `getLine(line)` | `string` | Text at line (0-indexed) |
| `getRange(from, to)` | `string` | Text in range |
| `lineCount()` | `number` | Total lines |
| `lastLine()` | `number` | Last line number |

### Modifying Content

| Method | Description |
|--------|-------------|
| `setValue(content)` | Replace entire document |
| `setLine(n, text)` | Replace line content |
| `replaceRange(text, from, to?, origin?)` | Replace text in range. If only `from`, inserts at position. |
| `replaceSelection(text, origin?)` | Replace current selection |
| `transaction(tx, origin?)` | Batch multiple changes atomically |
| `processLines(read, write, ignoreEmpty?)` | Process each line |

### Navigation

| Method | Description |
|--------|-------------|
| `scrollTo(x, y)` | Scroll to position |
| `scrollIntoView(range, center?)` | Scroll range into view |
| `getScrollInfo()` | Get current scroll info |
| `posToOffset(pos)` | Convert position to character offset |
| `offsetToPos(offset)` | Convert character offset to position |

### Other

| Method | Description |
|--------|-------------|
| `focus()` / `blur()` | Focus/blur editor |
| `hasFocus()` | Check if editor has focus |
| `undo()` / `redo()` | Undo/redo |
| `exec(command)` | Execute an editor command |
| `refresh()` | Refresh editor display |

### Common Patterns

**Insert at cursor:**
```typescript
editor.replaceRange(text, editor.getCursor());
```

**Replace selection:**
```typescript
const sel = editor.getSelection();
editor.replaceSelection(sel.toUpperCase());
```

**Insert at end of document:**
```typescript
const lastLine = editor.lastLine();
const lastLineText = editor.getLine(lastLine);
editor.replaceRange('\nNew content', { line: lastLine, ch: lastLineText.length });
```

## Markdown Post Processing

Change how markdown renders in Reading view.

### Post Processor

```typescript
this.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
  // element = rendered HTML fragment
  // Modify DOM as needed
  const codeblocks = element.findAll('code');
  for (const block of codeblocks) {
    // Transform code blocks
  }
});
```

### Code Block Processor

Register custom fenced code block handlers (like Mermaid):

```typescript
this.registerMarkdownCodeBlockProcessor('csv', (source: string, el: HTMLElement, ctx) => {
  // source = raw text inside the code block
  // el = container div (replaces <pre><code>)
  const rows = source.split('\n').filter(r => r.length > 0);
  const table = el.createEl('table');
  // Build table from CSV data...
});
```

Usage in markdown:
````
```csv
Name,Age
Alice,30
Bob,25
```
````

## MarkdownRenderer

Static utility for rendering markdown to HTML:

```typescript
import { MarkdownRenderer } from 'obsidian';

// Render markdown string to element
await MarkdownRenderer.render(
  this.app,        // App instance
  '**bold** text', // Markdown string
  containerEl,     // Target HTMLElement
  sourcePath,      // Source file path (for link resolution)
  this             // Component (for lifecycle management)
);

// Alternative (older API)
await MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component);
```
