export interface Note {
  id: string
  folderId: string
  title: string
  /** The original Markdown source — the canonical content. */
  content: string
  /** Unix milliseconds. */
  createdAt: number
  /** Unix milliseconds. */
  updatedAt: number
}

export interface Folder {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type SortMode =
  | "modified-desc"
  | "modified-asc"
  | "created-desc"
  | "created-asc"
  | "title-asc"
  | "title-desc"

export type EditorMode = "edit" | "preview"

/** The virtual "All Notes" view — not a folder that owns notes. */
export const ALL_NOTES = "all"

export interface AppPreferences {
  /** A folder id, or ALL_NOTES. */
  selectedFolderId: string
  selectedNoteId: string | null
  sortMode: SortMode
  sidebarOpen: boolean
  editorMode: EditorMode
}

/** Where notes go when they aren't explicitly organized. It can't be deleted. */
export const DEFAULT_FOLDER_ID = "default"

export const DEFAULT_PREFERENCES: AppPreferences = {
  selectedFolderId: ALL_NOTES,
  selectedNoteId: null,
  sortMode: "modified-desc",
  sidebarOpen: true,
  editorMode: "edit",
}
