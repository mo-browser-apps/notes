import type { Note } from "@/lib/types"

export const UNTITLED = "New Note"

export function displayTitle(note: Pick<Note, "title">): string {
  return note.title.trim() || UNTITLED
}

export function isBlank(note: Pick<Note, "title" | "content">): boolean {
  return !note.title.trim() && !note.content.trim()
}

/**
 * Markdown → readable plain text, for list previews and search. Not a full parser: it drops
 * the syntax people type (markers, fences, link targets) and keeps the words.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^\s*(`{3,}|~{3,}).*$/gm, "") // code fences
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/<((?:https?:|mailto:)[^>]+)>/g, "$1") // autolinks
    .replace(/<\/?[a-z][^>]*>/gi, "") // inline HTML tags
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "") // task items
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "") // list items
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, "") // horizontal rules
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2") // bold, strikethrough
    .replace(/(^|[^*\w])[*_](?=\S)([^*_\n]*?\S)[*_](?![*\w])/g, "$1$2") // italic
    .replace(/`+([^`]*)`+/g, "$1") // inline code
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1") // escapes
}

// Notes are immutable objects, so the plain text can be cached per object: it's computed
// once per edit, not once per render or per keystroke in the search field.
const plainTextCache = new WeakMap<Note, string>()

export function notePlainText(note: Note): string {
  let text = plainTextCache.get(note)
  if (text === undefined) {
    text = markdownToPlainText(note.content).replace(/\s+/g, " ").trim()
    plainTextCache.set(note, text)
  }
  return text
}

export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Case-insensitive, partial-word: every term must appear in the title or the body text. */
export function matchesSearch(note: Note, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = `${note.title}\n${notePlainText(note)}`.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export interface TextSegment {
  text: string
  match: boolean
}

/** Splits `text` into segments with every occurrence of the terms marked. */
export function highlight(text: string, terms: string[]): TextSegment[] {
  if (terms.length === 0 || !text) return [{ text, match: false }]
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  )
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ text: part, match: terms.includes(part.toLowerCase()) }))
}

const PREVIEW_LENGTH = 160

/**
 * The preview line for the list. With a search, it starts near the first match in the body so
 * the matching text is visible.
 */
export function notePreview(note: Note, terms: string[]): string {
  const text = notePlainText(note)
  if (terms.length > 0) {
    const lower = text.toLowerCase()
    const hits = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0)
    if (hits.length > 0) {
      const first = Math.min(...hits)
      if (first > 40) {
        const start = text.lastIndexOf(" ", first - 30)
        return "…" + text.slice(start + 1, start + 1 + PREVIEW_LENGTH)
      }
    }
  }
  return text.slice(0, PREVIEW_LENGTH)
}
