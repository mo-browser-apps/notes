import * as React from "react"

import { useNotesActions } from "@/components/notes/notes-actions-context"
import { SEARCH_INPUT_ID } from "@/components/notes/notes-list"
import { useSidebar } from "@/components/ui/sidebar"
import { ipc } from "@/gen/ipc"
import { useNotes } from "@/hooks/use-notes"
import {
  activeEditorRegistry,
  claimCommand,
  FORMAT_COMMANDS,
  type ActiveEditor,
  type FormatCommand,
} from "@/lib/format-commands"
import { hasModKey, isMac } from "@/lib/platform"
import type { SortMode } from "@/lib/types"

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .cm-content')
}

function dialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"]:not([data-closed]), [role="alertdialog"]:not([data-closed])')
}

function menuOpen(): boolean {
  return !!document.querySelector('[role="menu"]')
}

/**
 * The editor a Format command would act on, or null when it would be ignored. Formatting applies
 * where the caret is, so only while the note body has focus — not the title, the note list, the
 * toolbar or nothing, where there is no caret to show where it would land. (The toolbar's own
 * buttons keep the body focused.) The menu enables its Format items from this same check, so an
 * enabled item always acts.
 */
function formatTarget(): ActiveEditor | null {
  const editor = activeEditorRegistry.get()
  const focused = document.activeElement
  return editor && focused && editor.view.contentDOM.contains(focused) ? editor : null
}

/**
 * What the menu needs to know about focus and dialogs. Neither is React state, so this listens
 * for focus moving and for dialogs opening or closing, and re-renders only when the answer changes.
 */
function useFocusContext() {
  const read = () => ({ canFormat: !dialogOpen() && formatTarget() !== null, modal: dialogOpen() })
  const [context, setContext] = React.useState(read)
  React.useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      // After the event: focusout fires before focus lands, and a closing dialog leaves the DOM later.
      frame = requestAnimationFrame(() => {
        const next = read()
        setContext((prev) => (prev.canFormat === next.canFormat && prev.modal === next.modal ? prev : next))
      })
    }
    // Dialogs are portalled into <body> and mark themselves open/closed with data attributes.
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributeFilter: ["data-open", "data-closed"] })
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", update)
    }
    // Deliberately no dependencies: reads the DOM, not props.
  }, [])
  return context
}

/**
 * The app's commands, run from the application menu (streamed from the main process) and from
 * keyboard shortcuts. On macOS and Windows a shortcut bound to a menu item reaches the menu; the
 * page's own handling below covers Linux (no menu bar) and keys the menu doesn't bind (⌘⌫).
 * Renders nothing; mounted inside SidebarProvider so it can toggle the sidebar.
 */
export function AppCommands() {
  const notes = useNotes()
  const actions = useNotesActions()
  const sidebar = useSidebar()

  const execute = (id: string, value = "") => {
    // The same command delivered twice for one keystroke (menu + page) runs once.
    if (!claimCommand(value ? `${id}:${value}` : id)) return
    // Nothing runs behind a dialog: it would act on what the dialog is about.
    if (dialogOpen()) return
    const note = notes.selectedNote

    if (id.startsWith("format.")) {
      const editor = formatTarget()
      if (!editor) return
      const name = id.slice("format.".length)
      if (name === "link") editor.requestLink()
      else if (name in FORMAT_COMMANDS) FORMAT_COMMANDS[name as FormatCommand](editor.view)
      return
    }

    switch (id) {
      case "note.new":
        notes.createNote()
        break
      case "folder.new":
        actions.newFolder()
        break
      case "file.import":
        void actions.importMarkdown()
        break
      case "note.export":
        if (note) void actions.exportNote(note.id)
        break
      case "notes.exportAll":
        void actions.exportAll()
        break
      case "search.focus": {
        const search = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null
        search?.focus()
        search?.select()
        break
      }
      case "note.duplicate":
        if (note) notes.duplicateNote(note.id)
        break
      case "note.delete":
        if (note) actions.requestDeleteNote(note.id)
        break
      case "view.sidebar":
        sidebar.toggleSidebar()
        break
      case "view.mode":
        if (note) notes.setEditorMode(notes.preferences.editorMode === "edit" ? "preview" : "edit")
        break
      case "view.sort":
        notes.setSortMode(value as SortMode)
        break
    }
  }
  const executeRef = React.useRef(execute)
  executeRef.current = execute

  // Commands chosen from the native menu.
  React.useEffect(() => {
    const subscription = ipc.menu.OnCommand({}).subscribe({
      next: (command) => executeRef.current(command.id, command.value),
      error: (error: unknown) => console.warn("Menu commands unavailable:", error),
    })
    return () => subscription.unsubscribe()
  }, [])

  // Keyboard shortcuts (the menu shows the same keys).
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || menuOpen()) return
      const key = event.key.toLowerCase()
      const run = (id: string) => {
        event.preventDefault()
        executeRef.current(id)
      }

      // Show/Hide Sidebar: ⌃⌘S on macOS, Ctrl+Shift+S elsewhere.
      if (key === "s" && (isMac ? event.metaKey && event.ctrlKey && !event.shiftKey : event.ctrlKey && event.shiftKey)) {
        return run("view.sidebar")
      }
      if (!hasModKey(event) || event.altKey) return

      // Settings: the menu binds ⌘, on macOS and Windows; this covers Linux (no menu bar).
      if (key === "," && !event.shiftKey) {
        event.preventDefault()
        ipc.app.OpenSettings({ section: "general" }).catch((error: unknown) => console.warn("Couldn't open Settings:", error))
        return
      }
      if (key === "n") run(event.shiftKey ? "folder.new" : "note.new")
      else if (key === "f" && !event.shiftKey) run("search.focus")
      else if (key === "p" && event.shiftKey) run("view.mode")
      else if (key === "d" && !event.shiftKey) run("note.duplicate")
      else if (key === "e" && event.shiftKey) run("note.export")
      else if (key === "i" && event.shiftKey) run("file.import")
      // In a text field ⌘⌫ deletes to the start of the line; elsewhere it deletes the note.
      else if (key === "backspace" && !event.shiftKey && !isEditable(event.target)) run("note.delete")
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Tell the menu what to enable, label, and check. Each flag must come from the same check the
  // command above runs before acting (e.g. formatTarget), so an enabled item never does nothing.
  const { status, selectedNote, preferences } = notes
  const { canFormat, modal } = useFocusContext()
  const state = {
    canFormat,
    modal,
    ready: status === "ready",
    hasNote: selectedNote !== null,
    editing: preferences.editorMode === "edit",
    sidebarOpen: sidebar.isMobile ? sidebar.openMobile : sidebar.open,
    sortMode: preferences.sortMode,
    hasNotes: notes.notes.length > 0,
  }
  const stateKey = JSON.stringify(state)
  React.useEffect(() => {
    ipc.menu.SetState(JSON.parse(stateKey)).catch((error: unknown) => {
      console.warn("Couldn't update the menu:", error)
    })
  }, [stateKey])

  return null
}
