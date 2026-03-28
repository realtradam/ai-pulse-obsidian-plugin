# Phase 9: Calendar CSS (`styles.css`)

**Status:** Not started
**Depends on:** Phase 3 (calendar-renderer.ts — must match the CSS classes used in rendering)
**Modifies:** `styles.css`

---

## Overview

Append calendar styles to the plugin's stylesheet. Use Obsidian CSS variables for theme compatibility (light/dark).

---

## CSS Classes

```
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

## Notes

- Use `var(--background-primary)`, `var(--text-normal)`, `var(--interactive-accent)`, etc. for theme compatibility.
- The grid should be responsive within the sidebar width.
- Day cells should have consistent sizing — use CSS Grid with `grid-template-columns: repeat(7, 1fr)` (or 8 when week numbers are shown).
- Today highlight should use `var(--interactive-accent)` with reduced opacity for the background.
- "has-note" dots should be small circles below the day number.
- "other-month" days should have reduced opacity.
- "active" day should have a distinct border or background to show it's the currently open note.
