# Phase 4: Calendar View (`src/calendar/calendar-view.ts`)

**Status:** Not started
**Depends on:** Phase 1 (daily-notes.ts), Phase 2 (calendar-state.ts), Phase 3 (calendar-renderer.ts)
**Output file:** `src/calendar/calendar-view.ts`

---

## Overview

The `ItemView` subclass — wires everything together. Creates the state and renderer, registers vault/workspace events, and implements all callback handlers for user interactions.

---

## Design

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

---

## Notes

- Vault events to listen for: `create`, `delete`, `modify`, `rename` — all trigger `state.reindex()` + `renderer.render()`.
- The `file-open` workspace event updates `state.setActiveFile()`.
- Ctrl+Click behavior is controlled by the `calendarCtrlClickOpensInNewTab` setting (Phase 5).
- The confirmation modal before creating a note is controlled by `calendarConfirmBeforeCreate` (Phase 5).
- Week/month/year/quarter click handlers are initially no-ops (future expansion) except for daily notes.
- Hover preview uses Obsidian's `link-hover` workspace trigger.
