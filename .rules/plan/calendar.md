# Plan: Calendar View Integration

## Goal

Incorporate the functionality of `liamcain/obsidian-calendar-plugin` into AI Pulse, rewritten from Svelte to plain TypeScript (DOM API only), with a new daily-note storage structure: `year/month/day/note.md`. The calendar view will later serve as an AI-aware interface for reading/writing notes by date.

---

## Phase Files

Each phase is documented in its own file for independent implementation:

| Phase | File | Summary |
|-------|------|---------|
| 1 | [calendar-phase-1.md](calendar-phase-1.md) | Daily Note Manager — path computation, CRUD, indexing |
| 2 | [calendar-phase-2.md](calendar-phase-2.md) | Calendar State — observable state container |
| 3 | [calendar-phase-3.md](calendar-phase-3.md) | Calendar Renderer — pure DOM month grid |
| 4 | [calendar-phase-4.md](calendar-phase-4.md) | Calendar View — ItemView subclass wiring |
| 5 | [calendar-phase-5.md](calendar-phase-5.md) | Settings Integration — calendar settings UI |
| 6 | [calendar-phase-6.md](calendar-phase-6.md) | Main Plugin Wiring — commands, ribbon, lifecycle |
| 7 | [calendar-phase-7.md](calendar-phase-7.md) | AI Tools — read_daily_note, write_daily_note |
| 8 | [calendar-phase-8.md](calendar-phase-8.md) | System Prompt Update — daily notes context for AI |
| 9 | [calendar-phase-9.md](calendar-phase-9.md) | Calendar CSS — styles for the calendar grid |

---

## Implementation Order

1. **Phase 1** — `daily-notes.ts` (core logic, testable in isolation)
2. **Phase 2** — `calendar-state.ts` (state management)
3. **Phase 3** — `calendar-renderer.ts` (DOM rendering)
4. **Phase 4** — `calendar-view.ts` (ItemView wiring)
5. **Phase 5** — Settings integration
6. **Phase 6** — Main plugin wiring + commands
7. **Phase 9** — CSS styles
8. **Phase 7** — AI tools (read/write daily note)
9. **Phase 8** — System prompt update

Phases 1–6 and 9 deliver a fully working calendar view. Phases 7–8 add the AI integration.

---

## Reference Plugin Analysis

### What It Does (Features to Keep)
- **Sidebar calendar view** — month grid in the right sidebar (`ItemView`)
- **Click a day** — opens or creates a daily note for that date
- **Click month/year/quarter labels** — opens or creates the corresponding monthly/quarterly/yearly note (from fork)
- **Visual indicators** — dots for word count, tasks; CSS classes for days with notes ("has-note" streak)
- **Navigation** — prev/next month buttons, "today" highlight
- **Context menu on day/week/month/year/quarter** — delete file, open in new tab (from fork)
- **Hover preview on day/week/month/year/quarter** — Ctrl/Cmd hover shows page preview (from fork)
- **Reveal active note** — scroll calendar to the date of the currently open note; checks daily, weekly, monthly, quarterly, and yearly note formats (from fork)
- **Commands** — "Open calendar view", "Reveal active note"
- **Week numbers** (optional column, can be shown on left or right side — from fork)
- **Quarter display** (optional, toggleable — from fork)
- **Confirm before create** toggle
- **Ctrl+Click behavior** — configurable: open in new tab or new split (from fork)
- **Locale override** and **week start** settings

### What It Uses That We Drop
| Dependency | Replacement |
|---|---|
| Svelte (`Calendar.svelte`, stores, reactivity) | Plain TypeScript + DOM API (`contentEl.createEl`, `createDiv`, etc.) |
| `obsidian-calendar-ui` (CalendarBase component) | Custom calendar grid renderer in TypeScript |
| `obsidian-daily-notes-interface` (getDailyNote, getAllDailyNotes, createDailyNote, getMonthlyNote, getQuarterlyNote, getYearlyNote, etc.) | Our own note manager using the vault API directly |
| `svelte/store` (writable stores for settings, dailyNotes, weeklyNotes, monthlyNotes, quarterlyNotes, yearlyNotes, activeFile) | Simple class-based state or plain callbacks |

### What We Intentionally Omit (for now)
- **Weekly notes** — not part of the new structure; can add later
- **Monthly notes** — the fork supports them, but we use our own storage structure; can add later
- **Quarterly notes** — the fork supports them (Q1–Q4 display + click-to-create), but not part of MVP; can add later
- **Yearly notes** — the fork supports them (click year label to create), but not part of MVP; can add later
- **`obsidian-daily-notes-interface` integration** — we own the note format
- **External source plugins** (`calendar:open` trigger) — not needed
- **Periodic Notes plugin interop** — not needed

---

## New Daily Note Storage Structure

```
Calendar/
├── 2026/
│   ├── 01/
│   │   ├── 01/
│   │   │   └── 2026-01-01.md
│   │   ├── 02/
│   │   │   └── 2026-01-02.md
│   │   └── ...
│   ├── 02/
│   │   └── ...
│   └── 12/
│       └── ...
└── ...
```

### Path Format

```
{rootFolder}/{YYYY}/{MM}/{DD}/{YYYY-MM-DD}.md
```

- **`rootFolder`** — configurable, defaults to `"Calendar"`
- **Year** — 4-digit (`2026`)
- **Month** — 2-digit zero-padded (`01`–`12`)
- **Day** — 2-digit zero-padded (`01`–`31`)
- **Filename** — `YYYY-MM-DD.md` (ISO date)

### Why This Structure
- Predictable: the AI can compute any note path from a date without searching
- Hierarchical: collapsible in the file explorer by year/month
- Future-proof: the `day/` folder can hold multiple notes per day (journal entries, meeting notes, etc.) if needed later
- AI-friendly: "read today's note" or "write to March 15" becomes a simple path computation

---

## New Files to Create

| File | Purpose |
|---|---|
| `src/calendar/calendar-view.ts` | `ItemView` subclass — the sidebar calendar panel |
| `src/calendar/calendar-renderer.ts` | Pure DOM calendar grid builder (month view) |
| `src/calendar/daily-notes.ts` | Daily note CRUD: path computation, create, open, index, detect |
| `src/calendar/calendar-state.ts` | Simple observable state (displayed month, active file, note index) |
| `src/calendar/calendar-settings.ts` | Calendar-specific settings UI section |
| `src/context/tools/read-daily-note.json` | AI tool definition: read a note by date |
| `src/context/tools/write-daily-note.json` | AI tool definition: write/append to a note by date |

### Files to Modify

| File | Change |
|---|---|
| `src/main.ts` | Register calendar view, load/save calendar settings, add commands |
| `src/settings.ts` | Add calendar settings to `AIPulseSettings` interface |
| `src/tools.ts` | Register `read_daily_note` and `write_daily_note` tools |
| `src/context/system-prompt.json` | Add section explaining the date-based note structure to the AI |
| `styles.css` | Add calendar grid styles |

---

## Considerations

- **No new dependencies** — everything is built with Obsidian API + DOM + `moment` (already available globally via `window.moment`)
- **No Svelte** — all rendering is imperative DOM manipulation using Obsidian's `createEl`/`createDiv` helpers
- **`moment.js`** — available globally in Obsidian as `window.moment()`. Used for all date math. No need to import.
- **Performance** — `indexDailyNotes()` scans only the calendar root folder, not the entire vault. Re-indexing is triggered by vault events, not polling.
- **Template support** — if `calendarDailyNoteTemplate` is set, new daily notes copy that file's content (with `{{date}}` placeholder replacement).
- **Multiple notes per day** — the folder structure (`day/` folder) supports this for future expansion, but the calendar UI currently shows one note per day.
- **Migration** — no migration from existing daily notes plugin format. Users who have existing daily notes in a flat folder will need to reorganize manually or we can add a migration command later.

---

## Fork Reference Analysis (FBarrca/obsidian-calendar-plugin)

The fork (`reference/obsidian-calendar-plugin2/`) adds the following features on top of the original `liamcain/obsidian-calendar-plugin`:

### New Note Types
| Type | IO File | Store | View Handlers |
|------|---------|-------|---------------|
| Monthly | `src/io/monthlyNotes.ts` | `createMonthlyNotesStore()` | `onClickMonth`, `onHoverMonth`, `onContextMenuMonth` |
| Quarterly | `src/io/quarterlyNotes.ts` | `createQuarterlyNotesStore()` | `onClickQuarter`, `onHoverQuarter`, `onContextMenuQuarter` |
| Yearly | `src/io/yearlyNotes.ts` | `createYearlyNotesStore()` | `onClickYear`, `onHoverYear`, `onContextMenuYear` |

All three follow the same pattern as daily/weekly notes: confirmation dialog before create, `getXxxNoteSettings()` for format, and stores with `reindex()` method.

### New Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ctrlClickOpensInNewTab` | boolean | `false` | When Ctrl+Click on a day: `true` = open in new tab, `false` = open in new vertical split |
| `showWeeklyNoteRight` | boolean | `false` | Display week number column on the right side instead of left |
| `showQuarter` | boolean | `false` | Show quarter labels (Q1–Q4) in the calendar; clicking navigates to quarterly note |

### Ctrl+Click Behavior Change
The original used `splitActiveLeaf()` / `getUnpinnedLeaf()` for daily note opening. The fork uses the newer `workspace.getLeaf("tab")` / `workspace.getLeaf("split", "vertical")` / `workspace.getLeaf(false)` API for both daily and weekly notes, controlled by the `ctrlClickOpensInNewTab` setting.

### Enhanced `revealActiveNote`
Now checks active file against monthly, quarterly, and yearly note formats in addition to daily and weekly, allowing the calendar to scroll to the correct month when any periodic note is open.

### Context Menu Enhancement
File context menu now includes an "Open in new tab" option alongside "Delete".

### Svelte Component Changes
The `Calendar.svelte` component passes additional props to `CalendarBase`:
- `onClickMonth`, `onClickYear`, `onClickQuarter`
- `onHoverMonth`, `onHoverYear`, `onHoverQuarter` (not yet wired in the Svelte component, but handler exists in view)
- `onContextMenuMonth`, `onContextMenuYear`, `onContextMenuQuarter` (not yet wired in Svelte, but handler exists in view)
- `quarterVisible` — controls quarter label visibility
- `showWeekNumsRight` — controls week number column position

### What We Adopt (adapted to our TypeScript/DOM approach)
- **Ctrl+Click behavior setting** — useful UX, adopt as `calendarCtrlClickOpensInNewTab`
- **Week number positioning** — adopt as `calendarShowWeekNumbersRight`
- **Quarter display toggle** — adopt as `calendarShowQuarter`
- **Clickable month/year/quarter labels** — adopt in renderer with callbacks (initially no-op until periodic note types are implemented)
- **Hover preview on all note types** — adopt with `link-hover` trigger
- **Context menu for all note types** — adopt with "Delete" and "Open in new tab" items
- **Enhanced revealActiveNote** — adopt the expanded format-checking logic
- **"Open in new tab" context menu item** — adopt in file menu

### What We Defer
- **Monthly/quarterly/yearly note CRUD** — our storage structure is different; we'll add these later as the calendar matures
- **Monthly/quarterly/yearly stores and reindexing** — not needed until those note types are implemented

