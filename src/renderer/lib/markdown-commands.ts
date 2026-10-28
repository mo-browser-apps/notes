import { EditorSelection, type ChangeSpec, type Line } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

/**
 * Formatting actions for the Markdown editor. Each one edits the Markdown source (the
 * canonical content), so the toolbar, the shortcuts and hand-typed syntax all produce the
 * same text. Every command toggles: applying it to already-formatted text removes it.
 */

function runLength(text: string, char: string, fromEnd: boolean): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[fromEnd ? text.length - 1 - i : i] !== char) break
    count++
  }
  return count
}

/** Is a run of `marker` chars `run` long made of this marker? `*` vs `**` share a char. */
function runHasMarker(run: number, marker: string): boolean {
  if (run < marker.length) return false
  // A single-char marker (italic `*`) is present in runs of 1 or 3 (`***both***`).
  return marker.length === 1 && marker !== "`" ? run % 2 === 1 : true
}

/** Bold (`**`), italic (`*`), strikethrough (`~~`) and inline code (`` ` ``). */
export function toggleInline(view: EditorView, marker: string): boolean {
  const char = marker[0]
  const { state } = view
  view.dispatch(
    state.changeByRange((range) => {
      const before = state.sliceDoc(Math.max(0, range.from - 3), range.from)
      const after = state.sliceDoc(range.to, range.to + 3)
      const runBefore = runLength(before, char, true)
      const runAfter = runLength(after, char, false)
      const m = marker.length

      // Markers right outside the selection (or around the cursor) → remove them.
      if (runHasMarker(Math.min(runBefore, runAfter), marker)) {
        return {
          changes: [
            { from: range.from - m, to: range.from },
            { from: range.to, to: range.to + m },
          ],
          range: EditorSelection.range(range.anchor - m, range.head - m),
        }
      }

      const selected = state.sliceDoc(range.from, range.to)
      // Markers inside the selection (`**bold**` selected) → remove them.
      if (
        selected.length > 2 * m &&
        runHasMarker(runLength(selected, char, false), marker) &&
        runHasMarker(runLength(selected, char, true), marker)
      ) {
        return {
          changes: { from: range.from, to: range.to, insert: selected.slice(m, -m) },
          range: EditorSelection.range(range.from, range.to - 2 * m),
        }
      }

      // Otherwise wrap. Keep surrounding whitespace outside the markers (`** bold**` is not bold).
      const leading = selected.length - selected.trimStart().length
      const trailing = selected.length - selected.trimEnd().length
      const from = range.from + leading
      const to = Math.max(from, range.to - trailing)
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + m, to + m),
      }
    }),
    { scrollIntoView: true, userEvent: "input.format" }
  )
  view.focus()
  return true
}

function selectedLines(view: EditorView): Line[] {
  const { state } = view
  const lines: Line[] = []
  const seen = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    // A selection ending at the very start of a line doesn't include that line.
    let last = state.doc.lineAt(range.to).number
    if (range.to > range.from && state.doc.lineAt(range.to).from === range.to) last--
    for (let n = first; n <= Math.max(first, last); n++) {
      if (!seen.has(n)) {
        seen.add(n)
        lines.push(state.doc.line(n))
      }
    }
  }
  return lines
}

function applyLineChanges(view: EditorView, changes: ChangeSpec[]) {
  view.dispatch({ changes, scrollIntoView: true, userEvent: "input.format" })
  view.focus()
}

const HEADING = /^(\s{0,3})(#{1,6})\s+/

function textFrom(line: Line, from: number): string {
  return line.text.slice(from - line.from)
}

/** Heading levels 1–3; `0` (or the line's current level) turns it back into body text. */
export function setHeading(view: EditorView, level: number): boolean {
  const lines = selectedLines(view)
  const allAtLevel =
    level > 0 && lines.every((line) => HEADING.exec(line.text)?.[2].length === level)
  const changes = lines.map((line) => {
    const insert = allAtLevel || level === 0 ? "" : "#".repeat(level) + " "
    // A line is a heading or a list item, not both: the heading replaces a list marker.
    const block = insert ? (LIST_PREFIX.exec(line.text) ?? PREFIX.quote.exec(line.text)) : null
    const rest = line.text.slice(block ? block[0].length : 0)
    const existing = HEADING.exec(rest)
    const stripTo = line.from + (block ? block[0].length : 0) + (existing ? existing[0].length : 0)
    return { from: line.from, to: stripTo, insert }
  })
  applyLineChanges(view, changes)
  return true
}

export type BlockKind = "bullet" | "ordered" | "task" | "quote"

const LIST_PREFIX = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/
const PREFIX: Record<BlockKind, RegExp> = {
  task: /^(\s*)[-*+]\s+\[[ xX]\]\s+/,
  bullet: /^(\s*)[-*+]\s+(?!\[[ xX]\]\s)/,
  ordered: /^(\s*)\d+[.)]\s+/,
  quote: /^(\s*)>\s?/,
}

/** Bullet list, numbered list, checklist, or blockquote for the selected lines. */
export function toggleBlock(view: EditorView, kind: BlockKind): boolean {
  const lines = selectedLines(view)
  const content = lines.filter((line) => line.text.trim() !== "")
  const target = content.length > 0 ? content : lines
  const remove = target.every((line) => PREFIX[kind].test(line.text))

  let number = 0
  const changes = target.map((line) => {
    const pattern = kind === "quote" ? PREFIX.quote : LIST_PREFIX
    const existing = pattern.exec(line.text)
    const indent = existing ? existing[1] : (/^\s*/.exec(line.text)?.[0] ?? "")
    let stripTo = line.from + (existing ? existing[0].length : indent.length)
    if (remove) return { from: line.from, to: stripTo, insert: indent }
    // …and the list marker replaces a heading marker.
    if (kind !== "quote") {
      const heading = /^#{1,6}\s+/.exec(textFrom(line, stripTo))
      if (heading) stripTo += heading[0].length
    }
    const prefix =
      kind === "bullet" ? "- " : kind === "task" ? "- [ ] " : kind === "quote" ? "> " : `${++number}. `
    return { from: line.from, to: stripTo, insert: indent + prefix }
  })
  applyLineChanges(view, changes)
  return true
}

/** Fences the selected lines as a code block, or inserts an empty one at the cursor. */
export function insertCodeBlock(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  if (!range.empty) {
    const lines = selectedLines(view)
    const from = lines[0].from
    const to = lines[lines.length - 1].to
    view.dispatch({
      changes: { from, to, insert: "```\n" + state.sliceDoc(from, to) + "\n```" },
      selection: EditorSelection.cursor(from + 3),
      scrollIntoView: true,
      userEvent: "input.format",
    })
  } else {
    const line = state.doc.lineAt(range.head)
    const prefix = line.text.trim() ? "\n" : ""
    const at = line.text.trim() ? line.to : line.from
    view.dispatch({
      changes: { from: at, to: line.text.trim() ? at : line.to, insert: prefix + "```\n\n```" },
      selection: EditorSelection.cursor(at + prefix.length + 4),
      scrollIntoView: true,
      userEvent: "input.format",
    })
  }
  view.focus()
  return true
}

export function insertHorizontalRule(view: EditorView): boolean {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const blank = !line.text.trim()
  const insert = blank ? "---\n" : "\n\n---\n"
  const at = blank ? line.from : line.to
  view.dispatch({
    changes: { from: at, to: blank ? line.to : at, insert },
    selection: EditorSelection.cursor(at + insert.length),
    scrollIntoView: true,
    userEvent: "input.format",
  })
  view.focus()
  return true
}

export interface LinkTarget {
  from: number
  to: number
  text: string
  url: string
}

const LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g

/** The link under the cursor (to edit it), or the selection (to turn it into a link). */
export function linkAtSelection(view: EditorView): LinkTarget {
  const { state } = view
  const range = state.selection.main
  const line = state.doc.lineAt(range.head)
  for (const match of line.text.matchAll(LINK)) {
    const from = line.from + (match.index ?? 0)
    const to = from + match[0].length
    if (range.from >= from && range.to <= to) {
      return { from, to, text: match[1], url: match[2] }
    }
  }
  const text = state.sliceDoc(range.from, range.to)
  const looksLikeUrl = /^(https?:\/\/|mailto:)\S+$/i.test(text.trim())
  return {
    from: range.from,
    to: range.to,
    text: looksLikeUrl ? "" : text,
    url: looksLikeUrl ? text.trim() : "",
  }
}

/** Adds https:// to bare domains and escapes what would end the Markdown link early. */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ""
  const withScheme =
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith("#") || trimmed.startsWith("/")
      ? trimmed
      : `https://${trimmed}`
  return withScheme.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
}

export function applyLink(view: EditorView, target: LinkTarget, text: string, url: string) {
  const href = normalizeUrl(url)
  const label = (text.trim() || url.trim()).replace(/([[\]])/g, "\\$1")
  const insert = href ? `[${label}](${href})` : label
  view.dispatch({
    changes: { from: target.from, to: target.to, insert },
    selection: EditorSelection.cursor(target.from + insert.length),
    scrollIntoView: true,
    userEvent: "input.format",
  })
  view.focus()
}

const TASK_LINE = /^(\s*[-*+]\s+\[)([ xX])(\])/

/** Checks or unchecks the task on a 1-based line of the Markdown (used by the preview). */
export function toggleTaskInMarkdown(markdown: string, lineNumber: number): string {
  const lines = markdown.split("\n")
  const line = lines[lineNumber - 1]
  if (line === undefined || !TASK_LINE.test(line)) return markdown
  lines[lineNumber - 1] = line.replace(TASK_LINE, (_, open, mark, close) =>
    `${open}${mark === " " ? "x" : " "}${close}`
  )
  return lines.join("\n")
}
