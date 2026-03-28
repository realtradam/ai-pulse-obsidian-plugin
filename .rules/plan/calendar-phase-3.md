# Phase 3: Calendar Renderer (`src/calendar/calendar-renderer.ts`)

**Status:** Not started
**Depends on:** Phase 2 (calendar-state.ts — reads state for rendering)
**Output file:** `src/calendar/calendar-renderer.ts`

---

## Overview

Pure DOM rendering — replaces `Calendar.svelte` and `obsidian-calendar-ui`. Builds the month grid using Obsidian's `createEl`/`createDiv` helpers. Subscribes to `CalendarState` and re-renders on changes.

---

## Design

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
        - Dots container (word count, tasks — uses settings from Phase 5)
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

---

## Notes

- All rendering uses Obsidian's `createEl`/`createDiv` helpers — no innerHTML.
- CSS classes follow the `ai-pulse-calendar-*` naming convention (see Phase 9).
- The renderer needs access to settings (week start, show week numbers, show quarter, words per dot) — these are passed via constructor or a settings reference.
- Word count dots: read the file's cached metadata or content to count words, show N dots where N = floor(wordCount / wordsPerDot), capped at a reasonable max.
