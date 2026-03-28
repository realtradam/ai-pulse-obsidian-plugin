# Phase 5: Settings Integration (`src/calendar/calendar-settings.ts` + `src/settings.ts`)

**Status:** Not started
**Depends on:** Nothing (can be implemented independently, but wired in Phase 6)
**Output files:** `src/calendar/calendar-settings.ts`, modifications to `src/settings.ts`

---

## Overview

Add calendar-specific settings to the plugin's settings interface and settings UI.

---

## New Settings Fields

Add to `AIPulseSettings` interface in `src/settings.ts`:

```
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
```

---

## Settings UI (`CalendarSettingsSection`)

In `src/calendar/calendar-settings.ts`, create a function or class that adds a "Calendar" section to the settings modal:

- Root folder picker (text field)
- Week start dropdown
- Confirm before create toggle
- Ctrl+Click behavior dropdown ("Open in new tab" vs "Open in new split") — from fork
- Show week numbers toggle
- Show week numbers on right side toggle — from fork
- Show quarter toggle — from fork
- Word count dots toggle + words per dot number
- Daily note template path (text field)

---

## Notes

- Settings must be added to the default settings object so existing users get sane defaults on upgrade.
- The settings UI section should be visually grouped under a "Calendar" heading in the settings tab.
- The template path field should accept a vault-relative path to a markdown file.
