# Phase 2: Calendar State (`src/calendar/calendar-state.ts`)

**Status:** Not started
**Depends on:** Phase 1 (daily-notes.ts — for `indexDailyNotes`, `getDateFromDailyNote`)
**Output file:** `src/calendar/calendar-state.ts`

---

## Overview

Simple state container with change notifications — replaces Svelte stores. Holds the displayed month, today's date, active file tracking, and the note index. Notifies subscribers on any state change.

---

## Design

```
class CalendarState:
  - displayedMonth: Moment (current month being viewed)
  - today: Moment (refreshed by heartbeat)
  - activeFileDate: string | null (date UID of active file, if daily note)
  - noteIndex: Map<string, TFile> (date string → file)
  - listeners: Set<() => void>

  Methods:
  - subscribe(cb): () => void (unsubscribe function)
  - setDisplayedMonth(m: Moment): void
  - setActiveFile(file: TFile | null): void
  - reindex(app: App, rootFolder: string): void
  - tick(): void (refresh today)
  - notify(): void (call all listeners)
```

---

## Notes

- `reindex()` delegates to `indexDailyNotes()` from Phase 1.
- `setActiveFile()` uses `getDateFromDailyNote()` from Phase 1 to determine if the file is a daily note.
- `tick()` updates `today` and calls `notify()` only if the date has changed (day rollover).
- Subscribers are plain callbacks — no framework dependency.
