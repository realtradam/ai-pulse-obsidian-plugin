# Project Conventions — AI Pulse

---

## 1. Context Separation (JSON Context Files)

**All AI/LLM context, prompts, tool descriptions, and display text that is injected into prompts or shown to users MUST be stored in JSON files, not hardcoded in TypeScript source code.**

This is the **most important convention** in this project. It ensures that anyone — including non-developers — can review and improve the context the AI receives without needing to understand TypeScript.

### Directory Structure

```
src/context/
├── system-prompt.json          # The system prompt injected when tools are available
├── vault-context-template.json # Template for formatting vault context into the system prompt
└── tools/                      # One file per tool — metadata + Ollama definition
    ├── search-files.json
    ├── read-file.json
    ├── delete-file.json
    ├── get-current-note.json
    ├── edit-file.json
    ├── grep-search.json
    ├── create-file.json
    ├── move-file.json
    ├── set-frontmatter.json
    ├── batch-search-files.json
    ├── batch-grep-search.json
    ├── batch-delete-file.json
    ├── batch-move-file.json
    ├── batch-set-frontmatter.json
    └── batch-edit-file.json
```

### What Goes in JSON

- Tool definitions sent to Ollama (name, description, parameters, parameter descriptions)
- Tool metadata shown in the UI (label, friendlyName, description)
- Tool configuration (id, requiresApproval, batchOf)
- System prompt text and structure
- Vault context formatting templates

### What Stays in TypeScript

- Runtime logic: `execute` functions, `summarize` callbacks, `approvalMessage` builders
- Type definitions and interfaces
- Business logic (agent loop, streaming, approval flow)

### How to Add a New Tool

1. Create `src/context/tools/<tool-name>.json` with id, label, description, friendlyName, requiresApproval, and the full Ollama tool definition.
2. Import the JSON in `src/tools.ts`.
3. Add a `TOOL_REGISTRY` entry that spreads the JSON context and adds only the runtime callbacks (`summarize`, `summarizeResult`, `execute`, and optionally `approvalMessage`).

### How to Edit Context

To change what the AI "knows" or how it behaves:
1. Edit the relevant JSON file in `src/context/`.
2. Rebuild. The changes are picked up automatically since JSON files are imported at build time.

---

## 2. TypeScript Standards

- **Strict mode** is enabled. See `tsconfig.json` for the full list of strict flags.
- **Never use `any`.** Use `unknown` and narrow with type guards.
- **`resolveJsonModule`** is enabled so JSON files can be imported with type safety.
- Follow the rules in `.rules/default/typescript.md` (if present) or the project's `.cursorrules`.

---

## 3. File Organization

| Directory | Purpose |
|-----------|---------|
| `src/` | All TypeScript source code |
| `src/context/` | JSON context files (prompts, tool definitions, templates) |
| `src/context/tools/` | One JSON file per tool |
| `.rules/` | Project rules, docs, and changelog |
| `.rules/default/` | Convention documents |
| `.rules/docs/` | API reference documentation |
| `.rules/changelog/` | Change history |

---

## 4. Build System

- **esbuild** bundles everything (including JSON imports) into `main.js`.
- JSON imports are resolved at build time — no runtime file reads needed.
- Run `npm run dev` for watch mode, `npm run build` for production.

---

## 5. Naming Conventions

- Tool JSON files: `kebab-case.json` matching the tool id with underscores replaced by hyphens (e.g. `search_files` → `search-files.json`).
- TypeScript files: `kebab-case.ts`.
- Interfaces: `PascalCase`.
- Functions and variables: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` for true module-level constants.
