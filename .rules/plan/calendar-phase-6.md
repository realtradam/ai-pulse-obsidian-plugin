# Phase 6: Main Plugin Wiring (`src/main.ts`)

**Status:** Not started
**Depends on:** Phase 4 (calendar-view.ts), Phase 5 (settings)
**Modifies:** `src/main.ts`

---

## Overview

Wire the calendar view into the main plugin class: register the view, add ribbon icon, register commands, handle lifecycle.

---

## Changes to `src/main.ts`

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

---

## Notes

- Follow the existing pattern in `main.ts` for registering views (look at how the chat view is registered).
- The `activateCalendarView()` helper should check if a calendar leaf already exists before creating a new one.
- Calendar settings must be included in `loadData()`/`saveData()` — merge with defaults.
- The "Open today's daily note" command uses `openDailyNote()` from Phase 1 with `window.moment()` as the date.
