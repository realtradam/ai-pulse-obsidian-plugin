# Obsidian Workspace & Views API

## Workspace

Access via `this.app.workspace`. Extends `Events`. Manages the UI layout as a tree of workspace items.

### Layout Structure

The workspace is a tree:
- **WorkspaceSplit**: Lays out children side by side (vertical or horizontal)
- **WorkspaceTabs**: Shows one child at a time with tab headers
- **WorkspaceLeaf**: Terminal node that displays a View

Three root splits: `leftSplit` (sidebar), `rootSplit` (main area), `rightSplit` (sidebar).

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `activeEditor` | `MarkdownFileInfo \| null` | Current editor component |
| `activeLeaf` | `WorkspaceLeaf \| null` | Currently focused leaf. Avoid using directly; prefer helper methods. |
| `layoutReady` | `boolean` | Whether layout is initialized |
| `containerEl` | `HTMLElement` | Workspace container |
| `leftSplit` | `WorkspaceSidedock \| WorkspaceMobileDrawer` | Left sidebar |
| `rightSplit` | `WorkspaceSidedock \| WorkspaceMobileDrawer` | Right sidebar |
| `rootSplit` | `WorkspaceRoot` | Main content area |
| `leftRibbon` / `rightRibbon` | `WorkspaceRibbon` | Ribbon bars |
| `requestSaveLayout` | `Debouncer` | Debounced layout save |

### Getting Leaves & Views

| Method | Returns | Description |
|--------|---------|-------------|
| `getActiveFile()` | `TFile \| null` | Active file from current FileView, or most recent |
| `getActiveViewOfType(type)` | `T \| null` | Get active view if it matches type |
| `getLeavesOfType(viewType)` | `WorkspaceLeaf[]` | All leaves of a view type |
| `getLeafById(id)` | `WorkspaceLeaf \| null` | Get leaf by ID |
| `getLastOpenFiles()` | `string[]` | 10 most recently opened filenames |
| `getMostRecentLeaf(root?)` | `WorkspaceLeaf \| null` | Most recent leaf in root split |
| `iterateAllLeaves(cb)` | `void` | Iterate all leaves (main + sidebars + floating) |
| `iterateRootLeaves(cb)` | `void` | Iterate main area leaves only |
| `getGroupLeaves(group)` | `WorkspaceLeaf[]` | Get leaves in a link group |

### Creating & Managing Leaves

| Method | Returns | Description |
|--------|---------|-------------|
| `getLeaf(newLeaf?)` | `WorkspaceLeaf` | Get/create leaf. `false`=reuse existing, `true`/`'tab'`=new tab, `'split'`=split adjacent, `'window'`=popout. |
| `getLeaf('split', direction)` | `WorkspaceLeaf` | Split: `'vertical'` (right) or `'horizontal'` (below) |
| `getLeftLeaf(split)` | `WorkspaceLeaf` | Create leaf in left sidebar |
| `getRightLeaf(split)` | `WorkspaceLeaf` | Create leaf in right sidebar |
| `ensureSideLeaf(type, side, options?)` | `WorkspaceLeaf` | Get or create sidebar leaf (v1.7.2) |
| `createLeafBySplit(leaf, direction?, before?)` | `WorkspaceLeaf` | Split an existing leaf |
| `createLeafInParent(parent, index)` | `WorkspaceLeaf` | Create leaf in specific parent |
| `duplicateLeaf(leaf, leafType?, direction?)` | `Promise<WorkspaceLeaf>` | Duplicate a leaf |
| `detachLeavesOfType(viewType)` | `void` | Remove all leaves of a type |

### Navigation

| Method | Description |
|--------|-------------|
| `setActiveLeaf(leaf, params?)` | Set the active leaf |
| `revealLeaf(leaf)` | Bring leaf to foreground, uncollapse sidebar if needed. `await` for full load. (v1.7.2) |
| `openLinkText(linktext, sourcePath, newLeaf?, openViewState?)` | Open internal link |
| `moveLeafToPopout(leaf, data?)` | Move leaf to popout window (desktop only) |
| `openPopoutLeaf(data?)` | Open new popout window with leaf (desktop only) |
| `onLayoutReady(callback)` | Run callback when layout is ready (or immediately if already ready). (v0.11.0) |

### Workspace Events

| Event | Callback Args | Description |
|-------|--------------|-------------|
| `'file-open'` | `(file: TFile \| null)` | Active file changed (new leaf, existing leaf, or embed) |
| `'active-leaf-change'` | `(leaf: WorkspaceLeaf \| null)` | Active leaf changed |
| `'layout-change'` | `()` | Layout changed |
| `'editor-change'` | `(editor: Editor, info: MarkdownView \| MarkdownFileInfo)` | Editor content changed |
| `'editor-paste'` | `(evt: ClipboardEvent, editor: Editor, info)` | Editor paste. Check `evt.defaultPrevented`. |
| `'editor-drop'` | `(evt: DragEvent, editor: Editor, info)` | Editor drop. Check `evt.defaultPrevented`. |
| `'editor-menu'` | `(menu: Menu, editor: Editor, info)` | Editor context menu (v1.1.0) |
| `'file-menu'` | `(menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf)` | File context menu |
| `'files-menu'` | `(menu: Menu, files: TAbstractFile[], source: string, leaf?: WorkspaceLeaf)` | Multi-file context menu (v1.4.10) |
| `'url-menu'` | `(menu: Menu, url: string)` | External URL context menu (v1.5.1) |
| `'quick-preview'` | `(file: TFile, data: string)` | Active markdown file modified (pre-save) |
| `'resize'` | `()` | Window/item resized |
| `'quit'` | `()` | App about to quit (best-effort, not guaranteed) |
| `'window-open'` | `(win: WorkspaceWindow)` | Popout window created |
| `'window-close'` | `(win: WorkspaceWindow)` | Popout window closed |
| `'css-change'` | `()` | CSS changed |

## WorkspaceLeaf

A leaf hosts a single View.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `view` | `View` | The view in this leaf. Check `instanceof` before casting. |
| `parent` | `WorkspaceTabs \| WorkspaceMobileDrawer` | Parent container |
| `isDeferred` | `boolean` (readonly) | Whether leaf is deferred/background (v1.7.2) |

### Methods

| Method | Description |
|--------|-------------|
| `openFile(file, openState?)` | Open a file in this leaf |
| `setViewState(viewState, eState?)` | Set the view state (type, state, active) |
| `getViewState()` | Get current view state |
| `getDisplayText()` | Display text for tab |
| `detach()` | Remove this leaf |
| `setPinned(pinned)` / `togglePinned()` | Pin/unpin leaf |
| `setGroup(group)` | Set link group |
| `loadIfDeferred()` | Load deferred leaf. Await for full load. (v1.7.2) |

## Custom Views

### ItemView (for custom panels)

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE = 'my-view';

export class MyView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'My View'; }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.createEl('h4', { text: 'Hello' });
  }

  async onClose() {
    // Cleanup
  }
}
```

### View Properties

| Property | Type | Description |
|----------|------|-------------|
| `app` | `App` | App reference |
| `leaf` | `WorkspaceLeaf` | Parent leaf |
| `containerEl` | `HTMLElement` | Container element |
| `contentEl` | `HTMLElement` | Content area (ItemView) |
| `icon` | `IconName` | View icon |
| `navigation` | `boolean` | `true` if navigable (file views). `false` for static panels (explorer, calendar). |
| `scope` | `Scope \| null` | Optional hotkey scope |

### View Methods

| Method | Description |
|--------|-------------|
| `getViewType()` | Return unique view type string (abstract) |
| `getDisplayText()` | Return human-readable name (abstract) |
| `onOpen()` | Build view content |
| `onClose()` | Cleanup resources |
| `onResize()` | Handle size changes |
| `onPaneMenu(menu, source)` | Populate pane context menu |
| `addAction(icon, title, callback)` | Add action button to view header |
| `getState()` / `setState(state, result)` | Serialize/restore state |
| `getEphemeralState()` / `setEphemeralState(state)` | Non-persistent state (scroll position, etc.) |

### MarkdownView

Extends `TextFileView`. The built-in markdown editor view.

| Property | Type | Description |
|----------|------|-------------|
| `editor` | `Editor` | The editor instance |
| `file` | `TFile \| null` | Currently open file |
| `data` | `string` | In-memory file content |
| `currentMode` | `MarkdownSubView` | Current editing subview |
| `previewMode` | `MarkdownPreviewView` | Preview renderer |

| Method | Description |
|--------|-------------|
| `getMode()` | Get current mode |
| `getViewData()` | Get view data |
| `setViewData(data, clear)` | Set view data |
| `showSearch(replace?)` | Show search (and optionally replace) |

### Registering & Activating Views

```typescript
// Register in onload()
this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));

// Activate view
async activateView() {
  const { workspace } = this.app;
  let leaf: WorkspaceLeaf | null = null;
  const leaves = workspace.getLeavesOfType(VIEW_TYPE);

  if (leaves.length > 0) {
    leaf = leaves[0];
  } else {
    leaf = workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
  }
  workspace.revealLeaf(leaf);
}
```

**Warning**: Never store view references in your plugin. Obsidian may call the factory multiple times. Use `getLeavesOfType()` to access views.

```typescript
this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
  if (leaf.view instanceof MyView) {
    // Access view instance
  }
});
```

Plugins must remove their leaves when disabled. `detachLeavesOfType(viewType)` removes all.
