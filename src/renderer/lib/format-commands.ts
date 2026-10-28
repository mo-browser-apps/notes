import type { EditorView } from "@codemirror/view"

import {
  insertCodeBlock,
  insertHorizontalRule,
  setHeading,
  toggleBlock,
  toggleInline,
} from "@/lib/markdown-commands"

/**
 * The Markdown formatting commands, by id. The toolbar, the editor's keymap and the application
 * menu (`format.<id>`) all run these, so each command behaves the same from every entry point.
 */
export const FORMAT_COMMANDS = {
  title: (view: EditorView) => setHeading(view, 1),
  heading: (view: EditorView) => setHeading(view, 2),
  subheading: (view: EditorView) => setHeading(view, 3),
  body: (view: EditorView) => setHeading(view, 0),
  bold: (view: EditorView) => toggleInline(view, "**"),
  italic: (view: EditorView) => toggleInline(view, "*"),
  strikethrough: (view: EditorView) => toggleInline(view, "~~"),
  code: (view: EditorView) => toggleInline(view, "`"),
  bullets: (view: EditorView) => toggleBlock(view, "bullet"),
  numbers: (view: EditorView) => toggleBlock(view, "ordered"),
  checklist: (view: EditorView) => toggleBlock(view, "task"),
  quote: (view: EditorView) => toggleBlock(view, "quote"),
  codeBlock: insertCodeBlock,
  rule: insertHorizontalRule,
} satisfies Record<string, (view: EditorView) => boolean>

export type FormatCommand = keyof typeof FORMAT_COMMANDS

/** Editor key bindings (CodeMirror notation) — the same keys the Format menu shows. */
export const FORMAT_KEYS: [key: string, command: FormatCommand][] = [
  ["Mod-b", "bold"],
  ["Mod-i", "italic"],
  ["Mod-Shift-x", "strikethrough"],
  ["Mod-e", "code"],
  ["Mod-Alt-1", "title"],
  ["Mod-Alt-2", "heading"],
  ["Mod-Alt-3", "subheading"],
  ["Mod-Alt-0", "body"],
  ["Mod-Shift-8", "bullets"],
  ["Mod-Shift-7", "numbers"],
  ["Mod-Shift-l", "checklist"],
]

/** The editor that menu commands act on, registered by the note editor while it is mounted. */
export interface ActiveEditor {
  view: EditorView
  requestLink: () => void
}

let activeEditor: ActiveEditor | null = null

export const activeEditorRegistry = {
  set(editor: ActiveEditor | null) {
    activeEditor = editor
  },
  get(): ActiveEditor | null {
    return activeEditor
  },
}

// A shortcut can arrive twice — from the page's own key handling and from the native menu item
// bound to the same key (platforms differ in which one sees the key first). The second arrival
// of the same command within this window is the same keystroke, not a new one.
const DUPLICATE_WINDOW_MS = 150
const lastRun = new Map<string, number>()

/** Records a command run; false when it is the duplicate delivery of one that just ran. */
export function claimCommand(id: string): boolean {
  const now = performance.now()
  const previous = lastRun.get(id)
  lastRun.set(id, now)
  return previous === undefined || now - previous > DUPLICATE_WINDOW_MS
}
