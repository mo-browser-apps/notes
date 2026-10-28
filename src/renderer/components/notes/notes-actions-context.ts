import * as React from "react"

/*
 * The NotesActions context, kept apart from its provider (notes-actions.tsx) so hot reload can't
 * split it in two. A module that exports a non-component (this hook) can't be hot-swapped in place:
 * Vite re-runs it, and if it also created the context, the re-run made a NEW context object. The
 * fresh provider then supplied the new one while components still holding the old module read the
 * old, empty one: "useNotesActions must be used within NotesActionsProvider", and a blank window.
 * Any change upstream triggered it, even `npm run gen` / `npm run test:e2e` rewriting src/renderer/gen
 * with identical content. Only React is imported here, so this module never re-runs and the context
 * object stays the same.
 */

/**
 * App-level actions reachable from several places (toolbar, context menus, shortcuts):
 * confirmed deletes with Undo, and Markdown import/export through the main process.
 */
export interface NotesActions {
  /** Creates a folder and starts renaming it in the sidebar. */
  newFolder: () => void
  renamingFolderId: string | null
  setRenamingFolderId: (folderId: string | null) => void
  requestDeleteNote: (noteId: string) => void
  requestDeleteFolder: (folderId: string) => void
  exportNote: (noteId: string) => Promise<void>
  exportAll: () => Promise<void>
  importMarkdown: () => Promise<void>
}

export const NotesActionsContext = React.createContext<NotesActions | null>(null)

export function useNotesActions(): NotesActions {
  const context = React.useContext(NotesActionsContext)
  if (!context) throw new Error("useNotesActions must be used within NotesActionsProvider.")
  return context
}

