# Phase 1: Daily Note Manager (`src/calendar/daily-notes.ts`)

**Status:** Not started
**Depends on:** Nothing (standalone)
**Output file:** `src/calendar/daily-notes.ts`

---

## Overview

Core module — no UI, just logic. All daily note path computation, CRUD, indexing, and date detection lives here.

---

## Storage Structure

```
{rootFolder}/{YYYY}/{MM}/{DD}/{YYYY-MM-DD}.md
```

- **`rootFolder`** — configurable, defaults to `"Calendar"`
- **Year** — 4-digit (`2026`)
- **Month** — 2-digit zero-padded (`01`–`12`)
- **Day** — 2-digit zero-padded (`01`–`31`)
- **Filename** — `YYYY-MM-DD.md` (ISO date)

---

## Functions

```
- getDailyNotePath(date: Moment, rootFolder: string): string
    Computes: `{rootFolder}/{YYYY}/{MM}/{DD}/{YYYY-MM-DD}.md`

- getDailyNote(app: App, date: Moment, rootFolder: string): TFile | null
    Looks up vault file at the computed path.

- createDailyNote(app: App, date: Moment, rootFolder: string, template?: string): Promise<TFile>
    Creates parent folders if needed, creates the file.
    Uses template content if configured, else empty with frontmatter:
      ---
      date: YYYY-MM-DD
      ---

- openDailyNote(app: App, date: Moment, rootFolder: string, opts: { newLeaf: boolean }): Promise<void>
    Opens existing note or creates then opens.

- indexDailyNotes(app: App, rootFolder: string): Map<string, TFile>
    Scans `{rootFolder}/` recursively, parses YYYY/MM/DD structure,
    returns Map<"YYYY-MM-DD", TFile>.

- getDateFromDailyNote(file: TFile, rootFolder: string): Moment | null
    Reverse lookup: given a TFile, extract the date if it lives
    in the daily note folder structure.
```

---

## Notes

- `moment.js` is available globally in Obsidian as `window.moment()`. No import needed.
- `indexDailyNotes()` scans only the calendar root folder, not the entire vault.
- Template support: if `calendarDailyNoteTemplate` is set, new daily notes copy that file's content (with `{{date}}` placeholder replacement).
- The `day/` folder can hold multiple notes per day for future expansion, but the calendar UI currently shows one note per day.
