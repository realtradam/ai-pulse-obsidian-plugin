# Phase 7: AI Tools for Date-Based Notes

**Status:** Not started
**Depends on:** Phase 1 (daily-notes.ts)
**Output files:** `src/context/tools/read-daily-note.json`, `src/context/tools/write-daily-note.json`, modifications to `src/tools.ts`

---

## Overview

Two new tools the AI can use to interact with the calendar structure: `read_daily_note` and `write_daily_note`.

---

## `read_daily_note` Tool

### JSON Definition (`src/context/tools/read-daily-note.json`)

```json
{
  "id": "read_daily_note",
  "label": "Read Daily Note",
  "description": "Read the daily note for a specific date",
  "friendlyName": "Read Daily Note",
  "requiresApproval": false,
  "definition": {
    "type": "function",
    "function": {
      "name": "read_daily_note",
      "description": "Read the daily note for a given date. Use 'today' for the current date, or provide a date in YYYY-MM-DD format.",
      "parameters": {
        "type": "object",
        "required": ["date"],
        "properties": {
          "date": {
            "type": "string",
            "description": "The date to read. Use 'today', 'yesterday', 'tomorrow', or a YYYY-MM-DD date string."
          }
        }
      }
    }
  }
}
```

### Execute Logic

1. Parse the `date` argument — handle `"today"`, `"yesterday"`, `"tomorrow"`, or parse `YYYY-MM-DD` with `moment()`
2. Compute the path using `getDailyNotePath()`
3. If file exists: read and return content (same format as `read_file`)
4. If not: return `"No daily note exists for {date}."`

---

## `write_daily_note` Tool

### JSON Definition (`src/context/tools/write-daily-note.json`)

```json
{
  "id": "write_daily_note",
  "label": "Write Daily Note",
  "description": "Write or append to the daily note for a specific date",
  "friendlyName": "Write Daily Note",
  "requiresApproval": true,
  "definition": {
    "type": "function",
    "function": {
      "name": "write_daily_note",
      "description": "Write content to the daily note for a given date. Creates the note if it does not exist. Use mode 'append' to add to the end, or 'overwrite' to replace all content.",
      "parameters": {
        "type": "object",
        "required": ["date", "content"],
        "properties": {
          "date": {
            "type": "string",
            "description": "The date to write to. Use 'today', 'yesterday', 'tomorrow', or a YYYY-MM-DD date string."
          },
          "content": {
            "type": "string",
            "description": "The content to write."
          },
          "mode": {
            "type": "string",
            "description": "Write mode: 'append' (default) adds to the end, 'overwrite' replaces all content."
          }
        }
      }
    }
  }
}
```

### Execute Logic

1. Parse date (same as read)
2. If file does not exist: create it with content (using `createDailyNote()` then write)
3. If file exists:
   - `"append"` (default): `app.vault.append(file, "\n" + content)`
   - `"overwrite"`: `app.vault.modify(file, content)`
4. Return confirmation message

---

## Registration in `src/tools.ts`

- Import both JSON files
- Add `TOOL_REGISTRY` entries that spread the JSON context and add runtime callbacks (`summarize`, `summarizeResult`, `execute`, and optionally `approvalMessage`)
- Follow the existing pattern for other tools
