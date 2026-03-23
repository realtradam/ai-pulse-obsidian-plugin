# Obsidian UI Components

## Commands

Register via `this.addCommand()` in `onload()`. Command `id` and `name` are auto-prefixed with plugin id/name.

### Command Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Globally unique ID |
| `name` | `string` | Yes | Human-friendly name for command palette |
| `icon` | `IconName` | No | Icon for toolbar |
| `hotkeys` | `Hotkey[]` | No | Default hotkeys. Avoid in shared plugins. |
| `repeatable` | `boolean` | No | Repeat on held hotkey |
| `mobileOnly` | `boolean` | No | Mobile-only command |

### Callback Types (mutually exclusive, pick one)

**`callback`**: Simple global command.
```typescript
this.addCommand({
  id: 'my-command',
  name: 'My Command',
  callback: () => { /* do something */ },
});
```

**`checkCallback`**: Conditional command. Called twice: first with `checking=true` (return `true` if available, `false` to hide), then `checking=false` to execute.
```typescript
this.addCommand({
  id: 'my-command',
  name: 'My Command',
  checkCallback: (checking: boolean) => {
    const canRun = someCondition();
    if (canRun) {
      if (!checking) { doAction(); }
      return true;
    }
    return false;
  },
});
```

**`editorCallback`**: Only available when editor is active. Overrides `callback`/`checkCallback`.
```typescript
this.addCommand({
  id: 'my-command',
  name: 'My Command',
  editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
    const selection = editor.getSelection();
    editor.replaceSelection(selection.toUpperCase());
  },
});
```

**`editorCheckCallback`**: Conditional editor command. Overrides all others.

### Hotkey Format
```typescript
hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'a' }]
// 'Mod' = Ctrl on Windows/Linux, Cmd on macOS
```

## Settings Tab

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';

export class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Section heading
    new Setting(containerEl).setName('General').setHeading();

    // Text input
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your API key')
      .addText(text => text
        .setPlaceholder('Enter key...')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

Register: `this.addSettingTab(new MySettingTab(this.app, this));`

### Setting Class

Constructor: `new Setting(containerEl)`. Chainable methods:

| Method | Description |
|--------|-------------|
| `setName(name)` | Set setting name |
| `setDesc(desc)` | Set description (string or DocumentFragment) |
| `setHeading()` | Make this a section heading |
| `setClass(cls)` | Add CSS class |
| `setDisabled(disabled)` | Disable setting (v1.2.3) |
| `setTooltip(tooltip, options?)` | Add tooltip (v1.1.0) |
| `clear()` | Clear all components |
| `then(cb)` | Chain callback |

### Input Components

| Method | Component | Description |
|--------|-----------|-------------|
| `addText(cb)` | `TextComponent` | Single-line text input |
| `addTextArea(cb)` | `TextAreaComponent` | Multi-line text |
| `addSearch(cb)` | `SearchComponent` | Searchable input |
| `addToggle(cb)` | `ToggleComponent` | Boolean toggle |
| `addDropdown(cb)` | `DropdownComponent` | Select dropdown. `.addOption(value, display)` |
| `addSlider(cb)` | `SliderComponent` | Numeric slider. `.setDynamicTooltip()` |
| `addButton(cb)` | `ButtonComponent` | Button. `.setButtonText()`, `.setCta()`, `.onClick()` |
| `addExtraButton(cb)` | `ExtraButtonComponent` | Small icon button. `.setIcon()` |
| `addColorPicker(cb)` | `ColorComponent` | Color picker. `.setValue('#hex')` |
| `addProgressBar(cb)` | `ProgressBarComponent` | Progress bar. `.setValue(0-100)` |
| `addMomentFormat(cb)` | `MomentFormatComponent` | Date format with live preview |
| `addComponent(cb)` | Any `BaseComponent` | Custom component (v1.11.0) |

Common component methods: `.setValue()`, `.getValue()`, `.onChange(cb)`, `.setPlaceholder()`, `.setDisabled()`.

## Modals

### Basic Modal

```typescript
import { App, Modal, Setting } from 'obsidian';

export class MyModal extends Modal {
  result: string;
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this.setTitle('Enter Value');

    new Setting(this.contentEl)
      .setName('Value')
      .addText(text => text.onChange(v => { this.result = v; }));

    new Setting(this.contentEl)
      .addButton(btn => btn.setButtonText('Submit').setCta()
        .onClick(() => { this.close(); this.onSubmit(this.result); }));
  }
}

// Usage:
new MyModal(this.app, (result) => {
  new Notice(`Got: ${result}`);
}).open();
```

### Modal Properties & Methods

| Property/Method | Description |
|-----------------|-------------|
| `app` | App reference |
| `containerEl` / `modalEl` / `contentEl` / `titleEl` | DOM elements |
| `scope` | Keyboard scope |
| `open()` | Show the modal |
| `close()` | Hide the modal |
| `onOpen()` | Override for setup |
| `onClose()` | Override for cleanup |
| `setTitle(title)` | Set title text |
| `setContent(content)` | Set content (string or DocumentFragment) |
| `setCloseCallback(cb)` | Custom close handler (v1.10.0) |

### SuggestModal<T>

List selection modal. User types to filter.

```typescript
export class FileSuggestModal extends SuggestModal<TFile> {
  getSuggestions(query: string): TFile[] {
    return this.app.vault.getMarkdownFiles()
      .filter(f => f.path.toLowerCase().includes(query.toLowerCase()));
  }

  renderSuggestion(file: TFile, el: HTMLElement) {
    el.createEl('div', { text: file.basename });
    el.createEl('small', { text: file.path });
  }

  onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
    new Notice(`Selected: ${file.path}`);
  }
}
```

Additional properties: `inputEl`, `resultContainerEl`, `emptyStateText`, `limit`.
Methods: `setPlaceholder()`, `setInstructions()`.

### FuzzySuggestModal<T>

Fuzzy search modal. Only need `getItems()`, `getItemText()`, `onChooseItem()`.

```typescript
export class MyFuzzyModal extends FuzzySuggestModal<TFile> {
  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }
  getItemText(file: TFile): string {
    return file.path;
  }
  onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
    new Notice(`Selected: ${file.path}`);
  }
}
```

## Context Menus

```typescript
import { Menu, Notice } from 'obsidian';

// Custom menu
const menu = new Menu();
menu.addItem(item => item.setTitle('Action').setIcon('icon-name').onClick(() => { ... }));
menu.addSeparator();
menu.addItem(item => item.setTitle('Another').onClick(() => { ... }));
menu.showAtMouseEvent(event);
// Or: menu.showAtPosition({ x: 20, y: 20 });
```

### Menu Methods

| Method | Description |
|--------|-------------|
| `addItem(cb: (item: MenuItem) => any)` | Add menu item |
| `addSeparator()` | Add separator |
| `showAtMouseEvent(evt)` | Show at mouse position |
| `showAtPosition(pos, doc?)` | Show at `{x, y}` position |
| `close()` / `hide()` | Close menu |
| `onHide(callback)` | Called when menu hides |
| `setNoIcon()` | Remove icon column |
| `setUseNativeMenu(bool)` | Force native/DOM menu (desktop) |

### MenuItem Methods

| Method | Description |
|--------|-------------|
| `setTitle(title)` | Item label |
| `setIcon(icon)` | Item icon |
| `onClick(callback)` | Click handler |
| `setChecked(checked)` | Show checkmark |
| `setDisabled(disabled)` | Disable item |
| `setSection(section)` | Set section (for ordering) |
| `setWarning(isWarning)` | Warning style |

### Adding to Built-in Menus

```typescript
// File context menu
this.registerEvent(
  this.app.workspace.on('file-menu', (menu, file) => {
    menu.addItem(item => item.setTitle('My Action').onClick(() => { ... }));
  })
);

// Editor context menu
this.registerEvent(
  this.app.workspace.on('editor-menu', (menu, editor, view) => {
    menu.addItem(item => item.setTitle('My Action').onClick(() => { ... }));
  })
);
```

## Notice (Toast Notifications)

```typescript
import { Notice } from 'obsidian';

// Basic notice (auto-hides)
new Notice('Operation complete!');

// Custom duration (ms). 0 = stays until clicked.
new Notice('Important message', 10000);

// Access elements
const notice = new Notice('Processing...');
notice.setMessage('Done!');  // Update message
notice.hide();               // Hide programmatically
// notice.noticeEl, notice.messageEl, notice.containerEl — DOM access
```

## Ribbon Actions

```typescript
this.addRibbonIcon('dice', 'Tooltip text', (evt: MouseEvent) => {
  console.log('Ribbon clicked');
});
```

First arg is icon name. Users can remove ribbon icons, so provide alternative access (commands).

## Status Bar (Desktop Only)

```typescript
const statusBarEl = this.addStatusBarItem();
statusBarEl.createEl('span', { text: 'Status text' });
```

Multiple items get auto-spaced. Group elements in one item for custom spacing.

## HTML Elements

Obsidian extends `HTMLElement` with helper methods:

```typescript
// Create elements
containerEl.createEl('h1', { text: 'Title' });
containerEl.createEl('div', { cls: 'my-class', text: 'Content' });
containerEl.createEl('a', { text: 'Link', attr: { href: '...', target: '_blank' } });

// Nested
const parent = containerEl.createEl('div');
parent.createEl('span', { text: 'Child' });

// createSpan / createDiv shortcuts
containerEl.createDiv({ cls: 'wrapper' });

// Conditional CSS class
el.toggleClass('active', isActive);

// Clear contents
containerEl.empty();
```

### Styling

Add `styles.css` in plugin root. Use Obsidian CSS variables for theme compatibility:
- `--background-modifier-border` — border color
- `--text-muted` — muted text color
- Many more available (see Obsidian CSS variable reference)
