# Obsidian API Docs — AI Pulse

The Obsidian AI Note Management Plugin — powered by Ollama. Docs are in `.rules/docs/obsidian/`.

## Where to Look

| Need to... | File |
|------------|------|
| Set up plugin class, `onload`/`onunload`, manifest.json | `.rules/docs/obsidian/plugin-lifecycle.md` |
| Load/save settings, `loadData()`/`saveData()` | `.rules/docs/obsidian/plugin-lifecycle.md` |
| Read/write/create/delete/rename files | `.rules/docs/obsidian/vault-api.md` |
| Modify frontmatter (`processFrontMatter`) | `.rules/docs/obsidian/vault-api.md` |
| Move files into folders, auto-update links | `.rules/docs/obsidian/vault-api.md` |
| Batch process notes, build note graph | `.rules/docs/obsidian/vault-api.md` |
| Query tags, links, headings, frontmatter from cache | `.rules/docs/obsidian/metadata-cache.md` |
| Find untagged/orphan notes, backlinks | `.rules/docs/obsidian/metadata-cache.md` |
| Collect vault-wide metadata summary | `.rules/docs/obsidian/metadata-cache.md` |
| React to file create/modify/delete/rename events | `.rules/docs/obsidian/vault-api.md` + `.rules/docs/obsidian/events-utilities.md` |
| Wait for metadata cache readiness | `.rules/docs/obsidian/metadata-cache.md` |
| Call Ollama API (generate, chat, embeddings, list models) | `.rules/docs/obsidian/events-utilities.md` |
| Handle HTTP requests (`requestUrl`) | `.rules/docs/obsidian/events-utilities.md` |
| Create custom sidebar/panel views | `.rules/docs/obsidian/workspace-api.md` |
| Open/navigate files in workspace leaves | `.rules/docs/obsidian/workspace-api.md` |
| Register commands (global, editor, conditional) | `.rules/docs/obsidian/ui-components.md` |
| Build settings UI (text, toggle, dropdown, etc.) | `.rules/docs/obsidian/ui-components.md` |
| Show modals, suggest modals, fuzzy search | `.rules/docs/obsidian/ui-components.md` |
| Context menus, notices, ribbon, status bar | `.rules/docs/obsidian/ui-components.md` |
| Manipulate editor content (cursor, selection, insert) | `.rules/docs/obsidian/editor-api.md` |
| Custom markdown rendering / code blocks | `.rules/docs/obsidian/editor-api.md` |
| Detect platform (desktop/mobile/OS) | `.rules/docs/obsidian/events-utilities.md` |
| Use `moment.js`, debounce, protocol handlers | `.rules/docs/obsidian/events-utilities.md` |
