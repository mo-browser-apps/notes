import { DEFAULT_FOLDER_ID, type Folder, type Note } from "@/lib/types"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The example workspace written on the very first launch only (see lib/db.ts), so the app
 * looks complete and every feature can be tried immediately. Timestamps are relative to
 * `now` so the date groups (Today, Yesterday, Previous 7 Days, …) are all populated.
 */
export function createSampleWorkspace(now: number): { folders: Folder[]; notes: Note[] } {
  const folder = (id: string, name: string, age: number): Folder => ({
    id,
    name,
    createdAt: now - age,
    updatedAt: now - age,
  })

  const folders = [
    folder(DEFAULT_FOLDER_ID, "Notes", 400 * DAY),
    folder("work", "Work", 300 * DAY),
    folder("projects", "Projects", 200 * DAY),
    folder("personal", "Personal", 200 * DAY),
    folder("ideas", "Ideas", 100 * DAY),
  ]

  let seq = 0
  const note = (
    folderId: string,
    title: string,
    content: string,
    modifiedAgo: number,
    createdAgo: number
  ): Note => ({
    id: `sample-${++seq}`,
    folderId,
    title,
    content,
    createdAt: now - createdAgo,
    updatedAt: now - modifiedAgo,
  })

  const notes: Note[] = [
    note(
      "projects",
      "Project Ideas",
      `Ideas for the next release of the notes app.

## Must have
- **Markdown** editing with a live preview
- Folders and a fast *search*
- ~~Cloud sync~~ — local-first, no accounts

## Nice to have
1. Pinned notes
2. Tags
3. Export everything as a ZIP archive

> Keep it small, fast, and focused.`,
      12 * MINUTE,
      9 * DAY
    ),
    note(
      "work",
      "Meeting Notes",
      `# Weekly sync — product roadmap

**Attendees:** Maya, Jonas, Priya, Sam

## Discussion
- Discussed the roadmap and priorities for Q4
- Search performance is the top customer request
- Design review moved to Thursday

## Decisions
1. Ship the Markdown editor first
2. Postpone collaboration features

## Action items
- [ ] Maya — draft the release notes
- [ ] Jonas — benchmark search on 10k notes
- [x] Priya — share the updated mockups`,
      26 * HOUR,
      26 * HOUR
    ),
    note(
      "personal",
      "Shopping List",
      `- [ ] Milk
- [ ] Bread
- [x] Coffee beans
- [ ] Apples
- [ ] Olive oil
- [x] Dish soap`,
      3 * DAY,
      20 * DAY
    ),
    note(
      "projects",
      "Debounce Snippet",
      `A tiny debounce helper used by the autosave:

\`\`\`ts
export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: T) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
\`\`\`

Call it with the delay in milliseconds, e.g. \`debounce(save, 500)\`.`,
      5 * DAY,
      30 * DAY
    ),
    note(
      "ideas",
      "Reading List",
      `Articles and references worth revisiting:

- [CommonMark spec](https://spec.commonmark.org/) — the Markdown standard
- [GitHub Flavored Markdown](https://github.github.com/gfm/) — tables, task lists, strikethrough
- [MDN: IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

---

*Tip:* switch to **Preview** to open a link.`,
      12 * DAY,
      60 * DAY
    ),
    note(
      DEFAULT_FOLDER_ID,
      "Welcome to Notes",
      `Your notes live **on this computer** — no account, no sync.

### Getting around
- Pick a folder on the left, or **All Notes** to see everything
- Press **⌘N** for a new note and **⌘F** to search
- Use the toolbar (or **⌘B**, **⌘I**, **⌘K**) to format text
- Switch to *Preview* to see the rendered Markdown

### Markdown basics
# Heading
**bold**, *italic*, ~~strikethrough~~, \`inline code\`
- [ ] a task
> a quote`,
      20 * DAY,
      20 * DAY
    ),
    note(
      "work",
      "Quarterly Goals",
      `# Q3 goals

## Product
- Launch the new onboarding flow
- Reduce time-to-first-note below **30 seconds**

## Team
- Hire two engineers
- Run a design critique every other week

## Metrics
1. Weekly active users +15%
2. Crash-free sessions above 99.8%`,
      45 * DAY,
      90 * DAY
    ),
    note(
      "personal",
      "Gift ideas",
      "A good fountain pen for Alex, a cookbook for Mom, and concert tickets for Sam's birthday.",
      70 * DAY,
      70 * DAY
    ),
    note(
      "ideas",
      "App name brainstorm",
      `- Quill
- Margin
- Inkwell
- Folio

Leaning towards **Folio**.`,
      110 * DAY,
      120 * DAY
    ),
    note(
      DEFAULT_FOLDER_ID,
      "Wi-Fi at the cabin",
      "Network: *Lakeside*\n\nThe password is on the fridge.",
      420 * DAY,
      420 * DAY
    ),
  ]

  return { folders, notes }
}
