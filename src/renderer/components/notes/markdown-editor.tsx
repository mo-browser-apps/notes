import * as React from "react"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language"
import { EditorState, RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"

import { claimCommand, FORMAT_COMMANDS, FORMAT_KEYS } from "@/lib/format-commands"

/**
 * Markdown source editing with live styling: headings render large, **bold** renders bold,
 * and the syntax characters fade back. What's stored is exactly what's typed.
 */

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700", lineHeight: "1.3" },
  { tag: tags.heading2, fontSize: "1.3em", fontWeight: "700", lineHeight: "1.35" },
  { tag: tags.heading3, fontSize: "1.12em", fontWeight: "600" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--primary)" },
  { tag: tags.url, color: "var(--muted-foreground)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.labelName], color: "var(--muted-foreground)" },
  { tag: tags.atom, color: "var(--primary)" },
])

const theme = EditorView.theme({
  "&": {
    color: "var(--foreground)",
    backgroundColor: "transparent",
    fontSize: "15px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
    lineHeight: "1.65",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0 0 40vh",
    caretColor: "var(--foreground)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 25%, transparent)",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-codeblock": {
    backgroundColor: "var(--muted)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    paddingInline: "0.75rem",
  },
  ".cm-codeblock-first": { borderTopLeftRadius: "6px", borderTopRightRadius: "6px", paddingTop: "4px" },
  ".cm-codeblock-last": { borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px", paddingBottom: "4px" },
})

const codeLine = Decoration.line({ class: "cm-codeblock" })
const codeLineFirst = Decoration.line({ class: "cm-codeblock cm-codeblock-first" })
const codeLineLast = Decoration.line({ class: "cm-codeblock cm-codeblock-last" })
const codeLineOnly = Decoration.line({ class: "cm-codeblock cm-codeblock-first cm-codeblock-last" })

function codeBlockDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "FencedCode") return
        const first = view.state.doc.lineAt(node.from).number
        const last = view.state.doc.lineAt(node.to).number
        for (let n = first; n <= last; n++) {
          const line = view.state.doc.line(n)
          if (line.from < from || line.from > to) continue
          const deco =
            first === last ? codeLineOnly : n === first ? codeLineFirst : n === last ? codeLineLast : codeLine
          builder.add(line.from, line.from, deco)
        }
        return false
      },
    })
  }
  return builder.finish()
}

/** Shades fenced code blocks so they read as blocks while editing. */
const codeBlocks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = codeBlockDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = codeBlockDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

export interface MarkdownEditorProps {
  /** The initial Markdown. Mount a new editor (React `key`) per note so undo history doesn't cross notes. */
  value: string
  onChange: (value: string) => void
  onRequestLink: () => void
  onViewChange?: (view: EditorView | null) => void
  /** Up from the first line (to the title). */
  onExitTop?: () => void
  label: string
}

export function MarkdownEditor({
  value,
  onChange,
  onRequestLink,
  onViewChange,
  onExitTop,
  label,
}: MarkdownEditorProps) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  // The view is created once; these refs give its extensions the latest callbacks.
  const callbacks = React.useRef({ onChange, onRequestLink, onExitTop })
  callbacks.current = { onChange, onRequestLink, onExitTop }

  React.useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            ...FORMAT_KEYS.map(([key, command]) => ({
              key,
              run: (v: EditorView) => {
                if (claimCommand(`format.${command}`)) FORMAT_COMMANDS[command](v)
                return true
              },
            })),
            {
              key: "Mod-k",
              run: () => {
                if (claimCommand("format.link")) callbacks.current.onRequestLink()
                return true
              },
            },
            {
              key: "ArrowUp",
              run: (v) => {
                // Only from the first *visual* line — a wrapped first paragraph moves up first.
                const range = v.state.selection.main
                if (!range.empty || !callbacks.current.onExitTop) return false
                if (v.moveVertically(range, false).head !== range.head) return false
                callbacks.current.onExitTop()
                return true
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(highlightStyle),
          codeBlocks,
          theme,
          EditorView.lineWrapping,
          placeholder("Start writing…"),
          EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", spellcheck: "true" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    onViewChange?.(view)
    return () => {
      onViewChange?.(null)
      view.destroy()
      viewRef.current = null
    }
    // Deliberately no dependencies: the view lives for the whole mount.
  }, [])

  // Content changed from outside the editor (e.g. a task checked in the preview).
  React.useEffect(() => {
    const view = viewRef.current
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={hostRef} data-slot="markdown-editor" className="min-h-40" />
}
