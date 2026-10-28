import { displayTitle } from "@/lib/note-text"
import type { Note, SortMode } from "@/lib/types"

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "modified-desc", label: "Date Modified — Newest First" },
  { value: "modified-asc", label: "Date Modified — Oldest First" },
  { value: "created-desc", label: "Date Created — Newest First" },
  { value: "created-asc", label: "Date Created — Oldest First" },
  { value: "title-asc", label: "Title — A to Z" },
  { value: "title-desc", label: "Title — Z to A" },
]

const titleCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true })

/** The timestamp a date-based sort orders (and groups) by; null for title sorts. */
export function sortDateField(mode: SortMode): "updatedAt" | "createdAt" | null {
  if (mode.startsWith("modified")) return "updatedAt"
  if (mode.startsWith("created")) return "createdAt"
  return null
}

export function sortNotes(notes: Note[], mode: SortMode): Note[] {
  const field = sortDateField(mode)
  const direction = mode.endsWith("desc") ? -1 : 1
  return [...notes].sort((a, b) => {
    const primary = field
      ? a[field] - b[field]
      : titleCollator.compare(displayTitle(a), displayTitle(b))
    if (primary !== 0) return primary * direction
    // Stable, deterministic tie-breaks: most recently edited first, then id.
    return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)
  })
}

export interface NoteGroup {
  key: string
  /** null renders the group without a heading (title sorts). */
  label: string | null
  notes: Note[]
}

const DAY = 24 * 60 * 60 * 1000
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long" })

function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Today / Yesterday / Previous 7 Days / Previous 30 Days / month name / year — like Notes. */
export function dateGroup(time: number, now: number): { key: string; label: string } {
  const today = startOfDay(now)
  if (time >= today) return { key: "today", label: "Today" }
  if (time >= today - DAY) return { key: "yesterday", label: "Yesterday" }
  if (time >= today - 7 * DAY) return { key: "7days", label: "Previous 7 Days" }
  if (time >= today - 30 * DAY) return { key: "30days", label: "Previous 30 Days" }
  const date = new Date(time)
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return { key: `month-${date.getMonth()}`, label: monthFormat.format(date) }
  }
  return { key: `year-${date.getFullYear()}`, label: String(date.getFullYear()) }
}

/**
 * Groups already-sorted notes. Date sorts group by the date they sort on, so the headings
 * always agree with the order; title sorts get one flat, unlabelled group.
 */
export function groupNotes(sorted: Note[], mode: SortMode, now: number): NoteGroup[] {
  const field = sortDateField(mode)
  if (!field) return sorted.length ? [{ key: "all", label: null, notes: sorted }] : []

  const groups: NoteGroup[] = []
  for (const note of sorted) {
    const { key, label } = dateGroup(note[field], now)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.notes.push(note)
    else groups.push({ key, label, notes: [note] })
  }
  return groups
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" })
const monthDayFormat = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" })
const fullDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
const longDateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
})

/** The short date in a list row: 11:29 AM, Yesterday, Monday, October 10, Oct 10, 2024. */
export function formatListDate(time: number, now: number): string {
  const today = startOfDay(now)
  if (time >= today) return timeFormat.format(time)
  if (time >= today - DAY) return "Yesterday"
  if (time >= today - 6 * DAY) return weekdayFormat.format(time)
  if (new Date(time).getFullYear() === new Date(now).getFullYear()) {
    return monthDayFormat.format(time)
  }
  return fullDateFormat.format(time)
}

/** The date above the editor: October 13, 2026 at 11:29 AM. */
export function formatLongDate(time: number): string {
  return longDateTimeFormat.format(time)
}
