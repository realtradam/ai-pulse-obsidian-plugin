# Phase 8: System Prompt Update

**Status:** Not started
**Depends on:** Phase 7 (AI tools must exist for the prompt to reference them)
**Modifies:** `src/context/system-prompt.json`

---

## Overview

Add a section to the system prompt that explains the date-based note structure to the AI, so it knows when and how to use the daily note tools.

---

## Addition to `system-prompt.json`

```json
"dailyNotes": {
  "header": "DAILY NOTES — DATE-BASED NOTE STRUCTURE:",
  "description": "The vault uses a calendar-based daily note system. Notes are stored at Calendar/{YYYY}/{MM}/{DD}/{YYYY-MM-DD}.md.",
  "tools": "Use read_daily_note and write_daily_note to interact with daily notes by date. These accept natural date references like 'today', 'yesterday', 'tomorrow', or explicit YYYY-MM-DD dates.",
  "rules": [
    "When the user refers to 'today's note', 'my daily note', or a specific date, use read_daily_note or write_daily_note.",
    "Do NOT use create_file or read_file for daily notes — always use the dedicated daily note tools.",
    "The daily note tools handle folder creation and path computation automatically.",
    "When appending to a daily note, the content is added at the end of the file."
  ]
}
```

---

## Notes

- The `rootFolder` in the description should ideally reference the actual configured value, but since the system prompt is static JSON, use the default `"Calendar"` and note that it's configurable.
- This section ensures the AI prefers the dedicated daily note tools over generic file operations for date-based notes.
