import { openDB, type DBSchema, type IDBPDatabase } from "idb"

import { createSampleWorkspace } from "@/lib/sample-data"
import {
  DEFAULT_FOLDER_ID,
  DEFAULT_PREFERENCES,
  type AppPreferences,
  type Folder,
  type Note,
} from "@/lib/types"

/**
 * The storage layer. The UI talks to these repositories, never to IndexedDB directly, so the
 * persistence can be swapped (SQLite, files) without touching components.
 */

interface NotesSchema extends DBSchema {
  folders: { key: string; value: Folder }
  notes: { key: string; value: Note; indexes: { folderId: string } }
  meta: { key: string; value: unknown }
}

const DB_NAME = "notes"
const DB_VERSION = 1
/** Set once the first-launch sample data was written; never cleared, so samples never return. */
const INITIALIZED_KEY = "initialized"
const PREFERENCES_KEY = "preferences"

let dbPromise: Promise<IDBPDatabase<NotesSchema>> | null = null

function db(): Promise<IDBPDatabase<NotesSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<NotesSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore("folders", { keyPath: "id" })
        const notes = database.createObjectStore("notes", { keyPath: "id" })
        notes.createIndex("folderId", "folderId")
        database.createObjectStore("meta")
      },
    }).catch((error) => {
      // Let the next call retry instead of caching the failure forever.
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

export interface Workspace {
  folders: Folder[]
  notes: Note[]
  preferences: AppPreferences
}

/**
 * Opens the database and returns everything the UI needs. On the very first launch it writes
 * the sample workspace. The check and the write share one transaction, so two concurrent
 * loads (React StrictMode) can't both seed. It also repairs what would break the UI: a
 * missing default folder and notes whose folder no longer exists.
 */
export async function loadWorkspace(recovered: UnsavedChanges | null = null): Promise<Workspace> {
  const database = await db()
  const tx = database.transaction(["folders", "notes", "meta"], "readwrite")
  const folderStore = tx.objectStore("folders")
  const noteStore = tx.objectStore("notes")
  const metaStore = tx.objectStore("meta")

  if (!(await metaStore.get(INITIALIZED_KEY))) {
    const sample = createSampleWorkspace(Date.now())
    for (const folder of sample.folders) await folderStore.put(folder)
    for (const note of sample.notes) await noteStore.put(note)
    await metaStore.put(true, INITIALIZED_KEY)
  }

  // Edits journaled while the window was closing; keep whichever version is newer.
  for (const note of recovered?.notes ?? []) {
    const stored = await noteStore.get(note.id)
    if (!stored || stored.updatedAt <= note.updatedAt) await noteStore.put(note)
  }
  if (recovered?.preferences) await metaStore.put(recovered.preferences, PREFERENCES_KEY)

  const folders = await folderStore.getAll()
  if (!folders.some((folder) => folder.id === DEFAULT_FOLDER_ID)) {
    const now = Date.now()
    const inbox: Folder = { id: DEFAULT_FOLDER_ID, name: "Notes", createdAt: now, updatedAt: now }
    await folderStore.put(inbox)
    folders.push(inbox)
  }

  const folderIds = new Set(folders.map((folder) => folder.id))
  const notes = await noteStore.getAll()
  for (const [index, note] of notes.entries()) {
    if (!folderIds.has(note.folderId)) {
      notes[index] = { ...note, folderId: DEFAULT_FOLDER_ID }
      await noteStore.put(notes[index])
    }
  }

  const stored = (await metaStore.get(PREFERENCES_KEY)) as Partial<AppPreferences> | undefined
  await tx.done

  return { folders, notes, preferences: { ...DEFAULT_PREFERENCES, ...stored } }
}

export const notesRepository = {
  async put(note: Note): Promise<void> {
    await (await db()).put("notes", note)
  },
  async putMany(notes: Note[]): Promise<void> {
    const tx = (await db()).transaction("notes", "readwrite")
    await Promise.all([...notes.map((note) => tx.store.put(note)), tx.done])
  },
  async delete(id: string): Promise<void> {
    await (await db()).delete("notes", id)
  },
}

export const foldersRepository = {
  async put(folder: Folder): Promise<void> {
    await (await db()).put("folders", folder)
  },

  /**
   * Deletes a folder and, in the same transaction, either deletes its notes or moves them to
   * the default folder — a failure leaves both untouched, never a folder-less note.
   */
  async delete(folderId: string, notes: "delete" | "move"): Promise<void> {
    const tx = (await db()).transaction(["folders", "notes"], "readwrite")
    const noteStore = tx.objectStore("notes")
    const owned = await noteStore.index("folderId").getAll(folderId)
    for (const note of owned) {
      if (notes === "delete") await noteStore.delete(note.id)
      else await noteStore.put({ ...note, folderId: DEFAULT_FOLDER_ID })
    }
    await tx.objectStore("folders").delete(folderId)
    await tx.done
  },

  /** Puts a folder and its notes back exactly as they were (undo of `delete`). */
  async restore(folder: Folder, notes: Note[]): Promise<void> {
    const tx = (await db()).transaction(["folders", "notes"], "readwrite")
    await tx.objectStore("folders").put(folder)
    for (const note of notes) await tx.objectStore("notes").put(note)
    await tx.done
  },
}

/**
 * A write-ahead journal for the moment the window closes or reloads. IndexedDB writes started
 * during unload can be aborted, so the edits still waiting for their debounced save are also
 * written synchronously here, and replayed into the database by the next `loadWorkspace`.
 * It is a recovery log only — never the place notes are kept.
 */
export interface UnsavedChanges {
  notes: Note[]
  preferences: AppPreferences | null
}

const JOURNAL_KEY = "notes:unsaved-changes"

export const unsavedChangesJournal = {
  write(changes: UnsavedChanges) {
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(changes))
    } catch {
      // Storage full or unavailable: the regular IndexedDB writes are still in flight.
    }
  },
  read(): UnsavedChanges | null {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY)
      return raw ? (JSON.parse(raw) as UnsavedChanges) : null
    } catch {
      return null
    }
  },
  clear() {
    try {
      localStorage.removeItem(JOURNAL_KEY)
    } catch {
      // Nothing to clear.
    }
  },
}

export const preferencesRepository = {
  async save(preferences: AppPreferences): Promise<void> {
    await (await db()).put("meta", preferences, PREFERENCES_KEY)
  },
}
