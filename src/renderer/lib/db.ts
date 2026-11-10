import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb"

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

/** Every write transaction spans all stores, so a replayed write can touch any of them. */
const WRITE_STORES = ["folders", "notes", "meta"] as const
type WriteTransaction = IDBPTransaction<NotesSchema, ["folders", "notes", "meta"], "readwrite">

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
  const tx: WriteTransaction = database.transaction([...WRITE_STORES], "readwrite")
  const folderStore = tx.objectStore("folders")
  const noteStore = tx.objectStore("notes")
  const metaStore = tx.objectStore("meta")

  if (!(await metaStore.get(INITIALIZED_KEY))) {
    const sample = createSampleWorkspace(Date.now())
    for (const folder of sample.folders) await folderStore.put(folder)
    for (const note of sample.notes) await noteStore.put(note)
    await metaStore.put(true, INITIALIZED_KEY)
  }

  // Writes still queued while the window was closing, in their original order — creates,
  // deletes, moves, restores — then the edits journaled with them; keep whichever edit is newer.
  for (const write of recovered?.writes ?? []) await applyWrite(tx, write)
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
  /** The debounced save of an edited note (journaled separately, see `UnsavedChanges.notes`). */
  async put(note: Note): Promise<void> {
    await (await db()).put("notes", note)
  },
}

/** Every other write: the writes of one UI action, together in one transaction. */
export const writesRepository = {
  async apply(writes: QueuedWrite[]): Promise<void> {
    const tx: WriteTransaction = (await db()).transaction([...WRITE_STORES], "readwrite")
    for (const write of writes) await applyWrite(tx, write)
    await tx.done
  },
}

/**
 * Deletes a folder and either deletes its notes or moves them to the default folder, in the
 * caller's transaction — a failure leaves both untouched, never a folder-less note.
 */
async function deleteFolderIn(tx: WriteTransaction, folderId: string, notes: "delete" | "move") {
  const noteStore = tx.objectStore("notes")
  const owned = await noteStore.index("folderId").getAll(folderId)
  for (const note of owned) {
    if (notes === "delete") await noteStore.delete(note.id)
    else await noteStore.put({ ...note, folderId: DEFAULT_FOLDER_ID })
  }
  await tx.objectStore("folders").delete(folderId)
}

/**
 * A database write the UI has queued, described as data so that it can be journaled when the
 * window closes before the write ran, and replayed by the next `loadWorkspace`. Every one is
 * idempotent: replaying a write that did reach the database changes nothing.
 */
export type QueuedWrite =
  | { type: "put-notes"; notes: Note[] }
  | { type: "delete-note"; noteId: string }
  | { type: "put-folder"; folder: Folder }
  | { type: "delete-folder"; folderId: string; notes: "delete" | "move" }

async function applyWrite(tx: WriteTransaction, write: QueuedWrite) {
  switch (write.type) {
    case "put-notes":
      for (const note of write.notes) await tx.objectStore("notes").put(note)
      break
    case "delete-note":
      await tx.objectStore("notes").delete(write.noteId)
      break
    case "put-folder":
      await tx.objectStore("folders").put(write.folder)
      break
    case "delete-folder":
      await deleteFolderIn(tx, write.folderId, write.notes)
      break
  }
}

/**
 * A write-ahead journal for the moment the window closes or reloads. IndexedDB writes started
 * during unload can be aborted, so the writes still queued and the edits still waiting for
 * their debounced save are also written synchronously here, and replayed into the database by
 * the next `loadWorkspace`. It is a recovery log only — never the place notes are kept.
 */
export interface UnsavedChanges {
  /** Queued writes, oldest first. Absent in journals written before writes were journaled. */
  writes?: QueuedWrite[]
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
