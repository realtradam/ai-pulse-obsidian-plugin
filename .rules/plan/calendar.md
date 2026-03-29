# Plan: Calendar View Integration

## Goal

Incorporate the functionality of `liamcain/obsidian-calendar-plugin` into AI Pulse, rewritten from Svelte to plain TypeScript (DOM API only), with a new daily-note storage structure: `year/month/day/note.md`. The calendar view will later serve as an AI-aware interface for reading/writing notes by date.

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

## Implementation Phases

### Phase 1: Daily Note Manager (`src/calendar/daily-notes.ts`)

Core module — no UI, just logic.

```
Functions:
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

### Phase 2: Calendar State (`src/calendar/calendar-state.ts`)

Simple state container with change notifications — replaces Svelte stores.

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

### Phase 3: Calendar Renderer (`src/calendar/calendar-renderer.ts`)

Pure DOM rendering — replaces `Calendar.svelte` and `obsidian-calendar-ui`.

```
class CalendarRenderer:
  constructor(containerEl: HTMLElement, state: CalendarState, callbacks: CalendarCallbacks)

  interface CalendarCallbacks:
    onClickDay(date: Moment, event: MouseEvent): void
    onClickWeek(date: Moment, event: MouseEvent): void
    onClickMonth(date: Moment, event: MouseEvent): void       // from fork: click month label
    onClickYear(date: Moment, event: MouseEvent): void        // from fork: click year label
    onClickQuarter(date: Moment, event: MouseEvent): void     // from fork: click quarter label
    onContextMenuDay(date: Moment, event: MouseEvent): void
    onContextMenuWeek(date: Moment, event: MouseEvent): void
    onContextMenuMonth(date: Moment, event: MouseEvent): void  // from fork
    onContextMenuYear(date: Moment, event: MouseEvent): void   // from fork
    onContextMenuQuarter(date: Moment, event: MouseEvent): void // from fork
    onHoverDay(date: Moment, targetEl: EventTarget, isMetaPressed: boolean): void
    onHoverWeek(date: Moment, targetEl: EventTarget, isMetaPressed: boolean): void
    onHoverMonth(date: Moment, targetEl: EventTarget, isMetaPressed: boolean): void    // from fork
    onHoverYear(date: Moment, targetEl: EventTarget, isMetaPressed: boolean): void     // from fork
    onHoverQuarter(date: Moment, targetEl: EventTarget, isMetaPressed: boolean): void  // from fork

  Methods:
  - render(): void
      Clears containerEl, builds:
        - Navigation bar: [<] [Month Year] [>] [Today]
          - Month and Year labels are clickable → callbacks.onClickMonth / onClickYear (from fork)
          - Quarter label (e.g. Q1) shown if calendarShowQuarter is true (from fork)
        - Weekday headers row (Mon, Tue, ...)
        - Optional week number column (left or right based on calendarShowWeekNumbersRight — from fork)
        - 6 rows × 7 day cells
      Each day cell:
        - CSS class: "today", "has-note", "active", "other-month"
        - Dots container (word count, tasks — Phase 5)
        - Click handler → callbacks.onClickDay
        - Context menu → callbacks.onContextMenuDay

  - destroy(): void
      Cleanup intervals, event listeners

  private:
  - renderNavBar(): HTMLElement
  - renderDayHeaders(): HTMLElement
  - renderWeeks(): HTMLElement
  - renderDay(date: Moment): HTMLElement
  - renderWeekNumber(date: Moment, position: "left" | "right"): HTMLElement  // from fork: position option
  - renderQuarterLabel(date: Moment): HTMLElement                            // from fork
  - getDaysInMonthGrid(month: Moment): Moment[][]
      Returns 6 rows of 7 days, padding with prev/next month days
```

### Phase 4: Calendar View (`src/calendar/calendar-view.ts`)

The `ItemView` subclass — wires everything together. Replaces `view.ts`.

```
VIEW_TYPE_CALENDAR = "ai-pulse-calendar"

class CalendarView extends ItemView:
  - state: CalendarState
  - renderer: CalendarRenderer

  getViewType(): "ai-pulse-calendar"
  getDisplayText(): "Calendar"
  getIcon(): "calendar"

  onOpen():
    - Initialize state (today, reindex notes)
    - Create renderer with callbacks
    - Register vault events (create, delete, modify, rename) → reindex + re-render
    - Register workspace events (file-open) → update active file highlight
    - Start 60s heartbeat for day rollover
    - Initial render

  onClose():
    - renderer.destroy()
    - Clear intervals

  Callbacks:
    onClickDay(date, event):
      - If note exists → open it (respecting Ctrl+Click behavior setting — from fork)
      - If not → create (with optional confirmation modal) then open

    onClickWeek(date, event):
      - If weekly note exists → open it (future expansion)
      - Same Ctrl+Click behavior setting (from fork)

    onClickMonth(date, event):       // from fork
      - If monthly note exists → open it
      - If not → create then open (future expansion)

    onClickYear(date, event):        // from fork
      - If yearly note exists → open it
      - If not → create then open (future expansion)

    onClickQuarter(date, event):     // from fork
      - If quarterly note exists → open it
      - If not → create then open (future expansion)

    onContextMenuDay(date, event):
      - Show file menu (delete, open in new tab, etc.) if note exists

    onContextMenuWeek/Month/Year/Quarter(date, event):  // from fork
      - Show file menu if note exists for that period

    onHoverDay/Week/Month/Year/Quarter(date, targetEl, isMetaPressed): // from fork
      - Trigger link-hover for page preview when Ctrl/Cmd held

  revealActiveNote():
    - If active file is a daily note, set displayedMonth to that date
    - Also check weekly, monthly, quarterly, and yearly note formats (from fork)
```

### Phase 5: Settings Integration (`src/calendar/calendar-settings.ts` + `src/settings.ts`)

Add calendar-specific settings to the plugin.

```
New settings fields in AIPulseSettings:
  - calendarRootFolder: string (default: "Calendar")
  - calendarConfirmBeforeCreate: boolean (default: true)
  - calendarWeekStart: "locale" | "sunday" | "monday" | ... (default: "locale")
  - calendarShowWeekNumbers: boolean (default: false)
  - calendarShowWeekNumbersRight: boolean (default: false) — from fork: option to display week numbers on the right side
  - calendarShowQuarter: boolean (default: false) — from fork: toggle quarter display (Q1–Q4)
  - calendarCtrlClickOpensInNewTab: boolean (default: false) — from fork: Ctrl+Click opens in new tab instead of new split
  - calendarShowWordCountDots: boolean (default: true)
  - calendarWordsPerDot: number (default: 250)
  - calendarDailyNoteTemplate: string (default: "")

CalendarSettingsSection:
  - Adds a "Calendar" section to the settings modal
  - Root folder picker (text field)
  - Week start dropdown
  - Confirm before create toggle
  - Ctrl+Click behavior dropdown ("Open in new tab" vs "Open in new split") — from fork
  - Show week numbers toggle
  - Show week numbers on right side toggle — from fork
  - Show quarter toggle — from fork
  - Word count dots toggle + words per dot number
  - Daily note template path (text field)
```

### Phase 6: Main Plugin Wiring (`src/main.ts`)

```
In onload():
  - registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this))
  - addRibbonIcon("calendar", "Open Calendar", () => activateCalendarView())
  - addCommand("open-calendar", "Open Calendar View", ...)
  - addCommand("reveal-active-note", "Reveal active note in calendar", ...)
  - addCommand("open-today", "Open today's daily note", ...)

In onunload():
  - detachLeavesOfType(VIEW_TYPE_CALENDAR)

activateCalendarView():
  - Same pattern as activateView() for the chat — check for existing leaf first
```

### Phase 7: AI Tools for Date-Based Notes

Two new tools the AI can use to interact with the calendar structure.

#### `read_daily_note` tool
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

**Execute logic:**
1. Parse the `date` argument — handle `"today"`, `"yesterday"`, `"tomorrow"`, or parse `YYYY-MM-DD` with `moment()`
2. Compute the path using `getDailyNotePath()`
3. If file exists: read and return content (same format as `read_file`)
4. If not: return `"No daily note exists for {date}."`

#### `write_daily_note` tool
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

**Execute logic:**
1. Parse date (same as read)
2. If file does not exist: create it with content (using `createDailyNote()` then write)
3. If file exists:
   - `"append"` (default): `app.vault.append(file, "\n" + content)`
   - `"overwrite"`: `app.vault.modify(file, content)`
4. Return confirmation message

### Phase 8: System Prompt Update

Add to `system-prompt.json`:

```
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

### Phase 9: Calendar CSS (`styles.css`)

Append calendar styles. Use Obsidian CSS variables for theme compatibility.

```
Key classes:
  .ai-pulse-calendar              — container
  .ai-pulse-calendar-nav          — month navigation bar
  .ai-pulse-calendar-nav-title    — "March 2026" (clickable → opens monthly note — from fork)
  .ai-pulse-calendar-nav-year     — year label (clickable → opens yearly note — from fork)
  .ai-pulse-calendar-nav-quarter  — quarter label, e.g. "Q1" (clickable → opens quarterly note — from fork)
  .ai-pulse-calendar-nav-btn      — < > Today buttons
  .ai-pulse-calendar-grid         — the 7-column grid (8-column when week numbers shown)
  .ai-pulse-calendar-weekday      — header cells (Mon, Tue...)
  .ai-pulse-calendar-weeknum      — week number cell (from fork: can be left or right column)
  .ai-pulse-calendar-day          — individual day cell
  .ai-pulse-calendar-day.today    — today highlight
  .ai-pulse-calendar-day.has-note — day with a note
  .ai-pulse-calendar-day.active   — currently open note's date
  .ai-pulse-calendar-day.other-month — padding days from adjacent months
  .ai-pulse-calendar-dots         — dot container within day cell
  .ai-pulse-calendar-dot          — individual dot (word count)
```

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

Phases 1–7 and 9 deliver a fully working calendar view. Phases 7–8 add the AI integration.

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
