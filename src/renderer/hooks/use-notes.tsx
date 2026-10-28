import * as React from "react"
import { toast } from "sonner"

import {
  foldersRepository,
  loadWorkspace,
  notesRepository,
  preferencesRepository,
  unsavedChangesJournal,
} from "@/lib/db"
import { sortNotes } from "@/lib/note-order"
import { displayTitle, isBlank, matchesSearch, searchTerms } from "@/lib/note-text"
import { parseImportedFile } from "@/lib/portability"
import {
  ALL_NOTES,
  DEFAULT_FOLDER_ID,
  DEFAULT_PREFERENCES,
  type AppPreferences,
  type EditorMode,
  type Folder,
  type Note,
  type SortMode,
} from "@/lib/types"

/** Edits are written this long after the last keystroke (and immediately on hide/unload). */
const SAVE_DELAY_MS = 400

export interface DeletedFolder {
  folder: Folder
  notes: Note[]
  mode: "delete" | "move"
}

interface NotesContextValue {
  status: "loading" | "ready" | "error"
  loadError: string | null
  reload: () => void

  /** Default folder first, then alphabetical. */
  folders: Folder[]
  notes: Note[]
  noteCounts: Map<string, number>
  preferences: AppPreferences
  selectedFolder: Folder | null
  selectedNote: Note | null
  /** The notes in the current folder that match the search, sorted. */
  visibleNotes: Note[]
  query: string
  /** True while the latest edits failed to save. */
  saveFailed: boolean
  /** Changes whenever the editor should move focus to the title (a new note). */
  focusTitleToken: number

  setQuery: (query: string) => void
  selectFolder: (folderId: string) => void
  selectNote: (noteId: string | null) => void
  setSortMode: (mode: SortMode) => void
  setSidebarOpen: (open: boolean) => void
  setEditorMode: (mode: EditorMode) => void

  /** Null while the workspace is still loading. */
  createNote: () => Note | null
  updateNote: (noteId: string, patch: Partial<Pick<Note, "title" | "content">>) => void
  deleteNote: (noteId: string) => Note | null
  restoreNote: (note: Note) => void
  duplicateNote: (noteId: string) => void
  moveNote: (noteId: string, folderId: string) => void
  importFiles: (files: { name: string; content: string }[]) => Note[]

  createFolder: () => Folder | null
  renameFolder: (folderId: string, name: string) => void
  deleteFolder: (folderId: string, mode: "delete" | "move") => DeletedFolder | null
  restoreFolder: (deleted: DeletedFolder) => void
}

const NotesContext = React.createContext<NotesContextValue | null>(null)

export function useNotes(): NotesContextValue {
  const context = React.useContext(NotesContext)
  if (!context) throw new Error("useNotes must be used within a NotesProvider.")
  return context
}

const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true })

function newId(): string {
  return crypto.randomUUID()
}

/** The note to select after `noteId` leaves the list: the next one, else the previous one. */
function neighbour(list: Note[], noteId: string): string | null {
  const index = list.findIndex((note) => note.id === noteId)
  if (index < 0) return list[0]?.id ?? null
  return list[index + 1]?.id ?? list[index - 1]?.id ?? null
}

function computeVisible(
  notes: Note[],
  preferences: AppPreferences,
  query: string,
  keepNoteId: string | null
): Note[] {
  const { selectedFolderId, sortMode } = preferences
  const terms = searchTerms(query)
  const visible = notes.filter(
    (note) =>
      (selectedFolderId === ALL_NOTES || note.folderId === selectedFolderId) &&
      // The note being edited stays listed even if an edit makes it stop matching the search.
      (note.id === keepNoteId || matchesSearch(note, terms))
  )
  return sortNotes(visible, sortMode)
}

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading")
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [folders, setFolders] = React.useState<Folder[]>([])
  const [notes, setNotes] = React.useState<Note[]>([])
  const [preferences, setPreferences] = React.useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [query, setQueryState] = React.useState("")
  const [saveFailed, setSaveFailed] = React.useState(false)
  const [focusTitleToken, setFocusTitleToken] = React.useState(0)

  const deferredQuery = React.useDeferredValue(query)

  // Latest state for callbacks that run later (debounced saves, the write queue).
  const notesRef = React.useRef(notes)
  notesRef.current = notes
  const foldersRef = React.useRef(folders)
  foldersRef.current = folders
  const preferencesRef = React.useRef(preferences)
  preferencesRef.current = preferences
  const queryRef = React.useRef(query)
  queryRef.current = query
  // Nothing can be created before the workspace has loaded: loading would replace it.
  const readyRef = React.useRef(false)
  readyRef.current = status === "ready"

  // ---- Persistence -----------------------------------------------------------------------
  // Every write goes through one serial queue, so a slow older write can never land after a
  // newer one (a stale save overwriting fresh text, or a save resurrecting a deleted note).
  const writeQueue = React.useRef<Promise<void>>(Promise.resolve())
  const saveTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const failedNotes = React.useRef(new Set<string>())
  // Notes whose save was started but hasn't finished: note id → the latest save's number.
  const savesInFlight = React.useRef(new Map<string, number>())
  const lastSave = React.useRef(0)

  // Writes enqueued synchronously after a setState must pass the record they write: the
  // queue can run before React commits, so refs may still hold the previous state.
  const enqueue = React.useCallback((label: string, write: () => Promise<void>) => {
    writeQueue.current = writeQueue.current.then(write).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Storage write failed (${label}):`, message)
      setSaveFailed(true)
      toast.error("Couldn't save your changes", {
        id: "save-error",
        description: "Your notes are still open. Try again, or keep this window open.",
        action: { label: "Retry", onClick: () => retryFailedRef.current() },
      })
    })
  }, [])

  const persistNote = React.useCallback(
    (noteId: string) => {
      const timer = saveTimers.current.get(noteId)
      if (timer) clearTimeout(timer)
      saveTimers.current.delete(noteId)
      const save = ++lastSave.current
      savesInFlight.current.set(noteId, save)
      void enqueue("note", async () => {
        // Read the latest version when the write actually runs — never a captured copy.
        const note = notesRef.current.find((candidate) => candidate.id === noteId)
        if (!note) return
        try {
          await notesRepository.put(note)
          if (savesInFlight.current.get(noteId) === save) savesInFlight.current.delete(noteId)
          failedNotes.current.delete(noteId)
          if (failedNotes.current.size === 0) setSaveFailed(false)
        } catch (error) {
          failedNotes.current.add(noteId)
          throw error
        }
      })
    },
    [enqueue]
  )

  const retryFailedRef = React.useRef(() => {})
  retryFailedRef.current = () => {
    for (const noteId of failedNotes.current) persistNote(noteId)
  }

  const scheduleSave = React.useCallback(
    (noteId: string) => {
      const existing = saveTimers.current.get(noteId)
      if (existing) clearTimeout(existing)
      saveTimers.current.set(
        noteId,
        setTimeout(() => persistNote(noteId), SAVE_DELAY_MS)
      )
    },
    [persistNote]
  )

  const cancelSave = React.useCallback((noteId: string) => {
    const timer = saveTimers.current.get(noteId)
    if (timer) clearTimeout(timer)
    saveTimers.current.delete(noteId)
    savesInFlight.current.delete(noteId)
    failedNotes.current.delete(noteId)
  }, [])

  // The preferences last written to the database (to know whether a change is unsaved).
  const savedPreferences = React.useRef<AppPreferences | null>(null)

  // Write pending edits right away when the window is hidden or closing. On close/reload they
  // are also journaled synchronously, since the browser may abort IndexedDB writes it can't
  // finish before unloading (see unsavedChangesJournal). Closing fires both beforeunload and
  // pagehide, and the second must journal the same notes: the first one's flush has already
  // moved them from the timers to the saves in flight.
  React.useEffect(() => {
    const flush = () => {
      for (const noteId of [...saveTimers.current.keys()]) persistNote(noteId)
    }
    const flushOnUnload = () => {
      const pending = new Set([
        ...saveTimers.current.keys(),
        ...savesInFlight.current.keys(),
        ...failedNotes.current,
      ])
      const notes = notesRef.current.filter((note) => pending.has(note.id))
      const preferencesDirty = savedPreferences.current !== preferencesRef.current
      if (notes.length > 0 || preferencesDirty) {
        unsavedChangesJournal.write({ notes, preferences: preferencesDirty ? preferencesRef.current : null })
      }
      flush()
    }
    const onVisibility = () => document.visibilityState === "hidden" && flush()
    window.addEventListener("pagehide", flushOnUnload)
    window.addEventListener("beforeunload", flushOnUnload)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", flushOnUnload)
      window.removeEventListener("beforeunload", flushOnUnload)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [persistNote])

  // ---- Loading ---------------------------------------------------------------------------
  const load = React.useCallback(() => {
    setStatus("loading")
    setLoadError(null)
    loadWorkspace(unsavedChangesJournal.read())
      .then((workspace) => {
        // The journal is in the database now.
        unsavedChangesJournal.clear()
        const folderIds = new Set(workspace.folders.map((folder) => folder.id))
        const prefs = { ...workspace.preferences }
        if (prefs.selectedFolderId !== ALL_NOTES && !folderIds.has(prefs.selectedFolderId)) {
          prefs.selectedFolderId = ALL_NOTES
        }
        setFolders(workspace.folders)
        setNotes(workspace.notes)
        savedPreferences.current = prefs
        setPreferences(prefs)
        setStatus("ready")
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error))
        setStatus("error")
      })
  }, [])

  React.useEffect(load, [load])

  // Preferences are small; save them shortly after they settle.
  React.useEffect(() => {
    if (status !== "ready") return
    if (savedPreferences.current === preferences) return
    const timer = setTimeout(() => {
      preferencesRepository
        .save(preferences)
        .then(() => (savedPreferences.current = preferences))
        .catch((error: unknown) => console.warn("Couldn't save preferences:", error))
    }, 250)
    return () => clearTimeout(timer)
  }, [preferences, status])

  // ---- Derived state ---------------------------------------------------------------------
  const sortedFolders = React.useMemo(
    () =>
      [...folders].sort((a, b) =>
        a.id === DEFAULT_FOLDER_ID ? -1 : b.id === DEFAULT_FOLDER_ID ? 1 : nameCollator.compare(a.name, b.name)
      ),
    [folders]
  )

  const noteCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) counts.set(note.folderId, (counts.get(note.folderId) ?? 0) + 1)
    return counts
  }, [notes])

  const selectedNote = React.useMemo(
    () => notes.find((note) => note.id === preferences.selectedNoteId) ?? null,
    [notes, preferences.selectedNoteId]
  )
  const selectedFolder = React.useMemo(
    () => folders.find((folder) => folder.id === preferences.selectedFolderId) ?? null,
    [folders, preferences.selectedFolderId]
  )

  const visibleNotes = React.useMemo(
    () => computeVisible(notes, preferences, deferredQuery, preferences.selectedNoteId),
    [notes, preferences, deferredQuery]
  )
  const visibleRef = React.useRef(visibleNotes)
  visibleRef.current = visibleNotes

  const updatePreferences = React.useCallback((patch: Partial<AppPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }))
  }, [])

  // When the folder or the search changes (and on first load), keep the selected note if it
  // belongs to the new list, otherwise select the first match — or nothing.
  const selectedExists = selectedNote !== null
  React.useEffect(() => {
    if (status !== "ready") return
    const prefs = preferencesRef.current
    const matches = computeVisible(notesRef.current, prefs, deferredQuery, null)
    if (!matches.some((note) => note.id === prefs.selectedNoteId)) {
      updatePreferences({ selectedNoteId: matches[0]?.id ?? null })
    }
  }, [status, deferredQuery, preferences.selectedFolderId, selectedExists, updatePreferences])

  // A new note that is left without ever being written in is discarded, like in Notes.
  const freshNotes = React.useRef(new Set<string>())
  const previousSelection = React.useRef<string | null>(null)
  React.useEffect(() => {
    const previous = previousSelection.current
    previousSelection.current = preferences.selectedNoteId
    if (!previous || previous === preferences.selectedNoteId || !freshNotes.current.has(previous)) {
      return
    }
    freshNotes.current.delete(previous)
    const note = notesRef.current.find((candidate) => candidate.id === previous)
    if (note && isBlank(note)) {
      cancelSave(previous)
      setNotes((prev) => prev.filter((candidate) => candidate.id !== previous))
      void enqueue("discard empty note", () => notesRepository.delete(previous))
    }
  }, [preferences.selectedNoteId, cancelSave, enqueue])

  // ---- Actions ---------------------------------------------------------------------------
  const setQuery = React.useCallback((next: string) => setQueryState(next), [])

  const selectFolder = React.useCallback(
    (folderId: string) => updatePreferences({ selectedFolderId: folderId }),
    [updatePreferences]
  )
  const selectNote = React.useCallback(
    (noteId: string | null) => updatePreferences({ selectedNoteId: noteId }),
    [updatePreferences]
  )
  const setSortMode = React.useCallback(
    (sortMode: SortMode) => updatePreferences({ sortMode }),
    [updatePreferences]
  )
  const setSidebarOpen = React.useCallback(
    (sidebarOpen: boolean) => updatePreferences({ sidebarOpen }),
    [updatePreferences]
  )
  const setEditorMode = React.useCallback(
    (editorMode: EditorMode) => updatePreferences({ editorMode }),
    [updatePreferences]
  )

  const targetFolderId = React.useCallback(() => {
    const folderId = preferencesRef.current.selectedFolderId
    return folderId === ALL_NOTES ? DEFAULT_FOLDER_ID : folderId
  }, [])

  const createNote = React.useCallback((): Note | null => {
    if (!readyRef.current) return null
    const folderId = targetFolderId()
    const current = notesRef.current.find((note) => note.id === preferencesRef.current.selectedNoteId)
    setQueryState("")
    setFocusTitleToken((token) => token + 1)
    // Clicking New Note again on a still-empty new note just returns to it.
    if (current && freshNotes.current.has(current.id) && isBlank(current) && current.folderId === folderId) {
      updatePreferences({ editorMode: "edit" })
      return current
    }
    const now = Date.now()
    const note: Note = { id: newId(), folderId, title: "", content: "", createdAt: now, updatedAt: now }
    freshNotes.current.add(note.id)
    setNotes((prev) => [note, ...prev])
    updatePreferences({ selectedNoteId: note.id, editorMode: "edit" })
    void enqueue("create note", () => notesRepository.put(note))
    return note
  }, [enqueue, targetFolderId, updatePreferences])

  const updateNote = React.useCallback(
    (noteId: string, patch: Partial<Pick<Note, "title" | "content">>) => {
      setNotes((prev) =>
        prev.map((note) => {
          if (note.id !== noteId) return note
          const changed = Object.entries(patch).some(
            ([key, value]) => note[key as keyof typeof patch] !== value
          )
          return changed ? { ...note, ...patch, updatedAt: Date.now() } : note
        })
      )
      scheduleSave(noteId)
    },
    [scheduleSave]
  )

  const deleteNote = React.useCallback(
    (noteId: string): Note | null => {
      const note = notesRef.current.find((candidate) => candidate.id === noteId)
      if (!note) return null
      cancelSave(noteId)
      freshNotes.current.delete(noteId)
      if (preferencesRef.current.selectedNoteId === noteId) {
        updatePreferences({ selectedNoteId: neighbour(visibleRef.current, noteId) })
      }
      setNotes((prev) => prev.filter((candidate) => candidate.id !== noteId))
      void enqueue("delete note", () => notesRepository.delete(noteId))
      return note
    },
    [cancelSave, enqueue, updatePreferences]
  )

  const restoreNote = React.useCallback(
    (note: Note) => {
      const folderExists = foldersRef.current.some((folder) => folder.id === note.folderId)
      const restored = folderExists ? note : { ...note, folderId: DEFAULT_FOLDER_ID }
      setNotes((prev) => (prev.some((candidate) => candidate.id === note.id) ? prev : [restored, ...prev]))
      updatePreferences({ selectedNoteId: restored.id })
      void enqueue("restore note", () => notesRepository.put(restored))
    },
    [enqueue, updatePreferences]
  )

  const duplicateNote = React.useCallback(
    (noteId: string) => {
      const source = notesRef.current.find((note) => note.id === noteId)
      if (!source) return
      const now = Date.now()
      const copy: Note = {
        ...source,
        id: newId(),
        title: `${displayTitle(source)} copy`,
        createdAt: now,
        updatedAt: now,
      }
      setQueryState("")
      setNotes((prev) => [copy, ...prev])
      updatePreferences({ selectedNoteId: copy.id })
      void enqueue("duplicate note", () => notesRepository.put(copy))
    },
    [enqueue, updatePreferences]
  )

  // Moving is organizational: the note keeps its id, content, and both timestamps.
  const moveNote = React.useCallback(
    (noteId: string, folderId: string) => {
      const note = notesRef.current.find((candidate) => candidate.id === noteId)
      if (!note || note.folderId === folderId) return
      const view = preferencesRef.current.selectedFolderId
      if (view !== ALL_NOTES && preferencesRef.current.selectedNoteId === noteId) {
        updatePreferences({ selectedNoteId: neighbour(visibleRef.current, noteId) })
      }
      const moved = { ...note, folderId }
      setNotes((prev) => prev.map((candidate) => (candidate.id === noteId ? moved : candidate)))
      void enqueue("move note", () => notesRepository.put(moved))
    },
    [enqueue, updatePreferences]
  )

  const importFiles = React.useCallback(
    (files: { name: string; content: string }[]): Note[] => {
      if (!readyRef.current) return []
      const folderId = targetFolderId()
      const now = Date.now()
      const imported = files.map((file, index) => {
        const { title, content } = parseImportedFile(file.name, file.content)
        // A millisecond apart keeps the import order in date-sorted lists.
        const time = now - index
        return { id: newId(), folderId, title, content, createdAt: time, updatedAt: time }
      })
      if (imported.length === 0) return imported
      setQueryState("")
      setNotes((prev) => [...imported, ...prev])
      updatePreferences({ selectedNoteId: imported[0].id })
      void enqueue("import notes", () => notesRepository.putMany(imported))
      return imported
    },
    [enqueue, targetFolderId, updatePreferences]
  )

  const createFolder = React.useCallback((): Folder | null => {
    if (!readyRef.current) return null
    const names = new Set(foldersRef.current.map((folder) => folder.name.toLowerCase()))
    let name = "New Folder"
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `New Folder ${n}`
    const now = Date.now()
    const folder: Folder = { id: newId(), name, createdAt: now, updatedAt: now }
    setFolders((prev) => [...prev, folder])
    updatePreferences({ selectedFolderId: folder.id })
    void enqueue("create folder", () => foldersRepository.put(folder))
    return folder
  }, [enqueue, updatePreferences])

  const renameFolder = React.useCallback(
    (folderId: string, name: string) => {
      const trimmed = name.trim()
      const folder = foldersRef.current.find((candidate) => candidate.id === folderId)
      if (!folder || !trimmed || trimmed === folder.name) return
      const renamed = { ...folder, name: trimmed, updatedAt: Date.now() }
      setFolders((prev) => prev.map((candidate) => (candidate.id === folderId ? renamed : candidate)))
      void enqueue("rename folder", () => foldersRepository.put(renamed))
    },
    [enqueue]
  )

  const deleteFolder = React.useCallback(
    (folderId: string, mode: "delete" | "move"): DeletedFolder | null => {
      const folder = foldersRef.current.find((candidate) => candidate.id === folderId)
      if (!folder || folderId === DEFAULT_FOLDER_ID) return null
      const owned = notesRef.current.filter((note) => note.folderId === folderId)
      const ownedIds = new Set(owned.map((note) => note.id))

      for (const note of owned) {
        freshNotes.current.delete(note.id)
        // A pending save would write the note back after the folder's deletion.
        if (mode === "delete") cancelSave(note.id)
      }
      const prefs = preferencesRef.current
      const patch: Partial<AppPreferences> = {}
      if (prefs.selectedFolderId === folderId) patch.selectedFolderId = ALL_NOTES
      if (mode === "delete" && prefs.selectedNoteId && ownedIds.has(prefs.selectedNoteId)) {
        const remaining = visibleRef.current.filter((note) => !ownedIds.has(note.id))
        patch.selectedNoteId = remaining[0]?.id ?? null
      }
      updatePreferences(patch)
      setFolders((prev) => prev.filter((candidate) => candidate.id !== folderId))
      setNotes((prev) =>
        mode === "delete"
          ? prev.filter((note) => !ownedIds.has(note.id))
          : prev.map((note) => (ownedIds.has(note.id) ? { ...note, folderId: DEFAULT_FOLDER_ID } : note))
      )
      void enqueue("delete folder", () => foldersRepository.delete(folderId, mode))
      return { folder, notes: owned, mode }
    },
    [cancelSave, enqueue, updatePreferences]
  )

  const restoreFolder = React.useCallback(
    ({ folder, notes: owned, mode }: DeletedFolder) => {
      const current = new Map(notesRef.current.map((note) => [note.id, note]))
      // Moved notes may have been edited since: put back only their folder, keep the new text.
      const restored = owned.map((note) => {
        const latest = current.get(note.id)
        if (mode === "move" && latest) {
          return latest.folderId === DEFAULT_FOLDER_ID ? { ...latest, folderId: folder.id } : latest
        }
        return latest ?? note
      })
      const restoredIds = new Set(restored.map((note) => note.id))
      setFolders((prev) => (prev.some((candidate) => candidate.id === folder.id) ? prev : [...prev, folder]))
      setNotes((prev) => [...prev.filter((note) => !restoredIds.has(note.id)), ...restored])
      updatePreferences({ selectedFolderId: folder.id })
      void enqueue("restore folder", () => foldersRepository.restore(folder, restored))
    },
    [enqueue, updatePreferences]
  )

  const value: NotesContextValue = {
    status,
    loadError,
    reload: load,
    folders: sortedFolders,
    notes,
    noteCounts,
    preferences,
    selectedFolder,
    selectedNote,
    visibleNotes,
    query,
    saveFailed,
    focusTitleToken,
    setQuery,
    selectFolder,
    selectNote,
    setSortMode,
    setSidebarOpen,
    setEditorMode,
    createNote,
    updateNote,
    deleteNote,
    restoreNote,
    duplicateNote,
    moveNote,
    importFiles,
    createFolder,
    renameFolder,
    deleteFolder,
    restoreFolder,
  }

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}
