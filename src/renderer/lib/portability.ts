import { strToU8, zipSync, type Zippable } from "fflate"

import { displayTitle } from "@/lib/note-text"
import type { Folder, Note } from "@/lib/types"

/** A file name that is valid on macOS, Windows, and Linux. */
export function sanitizeFileName(name: string, fallback = "Untitled"): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 120)
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback
  return cleaned
}

/** The exported file: the title as a level-1 heading, then the Markdown body untouched. */
export function noteToMarkdown(note: Note): string {
  const title = note.title.trim()
  const body = note.content.replace(/\s+$/, "")
  if (!title) return body + "\n"
  return body ? `# ${title}\n\n${body}\n` : `# ${title}\n`
}

export function noteFileName(note: Note): string {
  return `${sanitizeFileName(displayTitle(note))}.md`
}

function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ""
  let candidate = name
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    candidate = `${stem} ${n}${extension}`
  }
  taken.add(candidate.toLowerCase())
  return candidate
}

/** Every note as a Markdown file, one directory per folder. */
export function buildNotesZip(folders: Folder[], notes: Note[]): Uint8Array {
  const tree: Zippable = {}
  const takenDirs = new Set<string>()
  for (const folder of folders) {
    const folderNotes = notes.filter((note) => note.folderId === folder.id)
    if (folderNotes.length === 0) continue
    const dir: Zippable = {}
    const takenFiles = new Set<string>()
    for (const note of folderNotes) {
      dir[uniqueName(noteFileName(note), takenFiles)] = [
        strToU8(noteToMarkdown(note)),
        { mtime: new Date(note.updatedAt) },
      ]
    }
    tree[uniqueName(sanitizeFileName(folder.name, "Folder"), takenDirs)] = dir
  }
  return zipSync(tree, { level: 6 })
}

/**
 * An imported file becomes a note titled after the file name. A leading `# Heading` equal to
 * that name is dropped, so a note exported from here and imported back isn't titled twice.
 */
export function parseImportedFile(fileName: string, text: string): { title: string; content: string } {
  const title = fileName.replace(/\.(md|markdown|txt)$/i, "").trim()
  let content = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const heading = content.match(/^#\s+(.+?)\s*#*\s*(?:\n|$)/)
  if (heading && heading[1].trim().toLowerCase() === title.toLowerCase()) {
    content = content.slice(heading[0].length).replace(/^\n+/, "")
  }
  return { title, content }
}
