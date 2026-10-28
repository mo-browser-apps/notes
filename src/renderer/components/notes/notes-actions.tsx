import * as React from "react"
import { strToU8 } from "fflate"
import { toast } from "sonner"

import { NotesActionsContext, type NotesActions } from "@/components/notes/notes-actions-context"
import { ipc } from "@/gen/ipc"
import { ConfirmDialog, undoToast } from "@/components/ui/confirm-dialog"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useNotes } from "@/hooks/use-notes"
import { displayTitle } from "@/lib/note-text"
import { buildNotesZip, noteFileName, noteToMarkdown } from "@/lib/portability"
import { DEFAULT_FOLDER_ID } from "@/lib/types"

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function NotesActionsProvider({ children }: { children: React.ReactNode }) {
  const {
    notes,
    folders,
    noteCounts,
    createFolder,
    deleteNote,
    restoreNote,
    deleteFolder,
    restoreFolder,
    importFiles,
  } = useNotes()
  const [renamingFolderId, setRenamingFolderId] = React.useState<string | null>(null)
  const [pendingNoteId, setPendingNoteId] = React.useState<string | null>(null)
  const [pendingFolderId, setPendingFolderId] = React.useState<string | null>(null)
  const [folderMode, setFolderMode] = React.useState<"move" | "delete">("move")

  const notesRef = React.useRef(notes)
  notesRef.current = notes
  const foldersRef = React.useRef(folders)
  foldersRef.current = folders

  const pendingNote = notes.find((note) => note.id === pendingNoteId) ?? null
  const pendingFolder = folders.find((folder) => folder.id === pendingFolderId) ?? null
  // The last target stays on screen while a dialog animates closed, instead of “Delete “”?”.
  const shownNote = React.useRef(pendingNote)
  if (pendingNote) shownNote.current = pendingNote
  const shownFolder = React.useRef(pendingFolder)
  const pendingFolderCount = React.useRef(0)
  if (pendingFolder) {
    shownFolder.current = pendingFolder
    pendingFolderCount.current = noteCounts.get(pendingFolder.id) ?? 0
  }
  const folderNoteCount = pendingFolderCount.current
  const defaultFolderName = folders.find((folder) => folder.id === DEFAULT_FOLDER_ID)?.name ?? "Notes"

  const actions = React.useMemo<NotesActions>(
    () => ({
      newFolder: () => {
        const folder = createFolder()
        if (folder) setRenamingFolderId(folder.id)
      },
      renamingFolderId,
      setRenamingFolderId,
      requestDeleteNote: (noteId) => setPendingNoteId(noteId),
      requestDeleteFolder: (folderId) => {
        if (folderId === DEFAULT_FOLDER_ID) return
        setFolderMode("move")
        setPendingFolderId(folderId)
      },
      exportNote: async (noteId) => {
        const note = notesRef.current.find((candidate) => candidate.id === noteId)
        if (!note) return
        try {
          const result = await ipc.files.SaveFile({
            title: "Export Note",
            suggestedName: noteFileName(note),
            filterName: "Markdown",
            extensions: ["md"],
            data: strToU8(noteToMarkdown(note)),
          })
          if (!result.canceled) toast.success(`Exported “${displayTitle(note)}”`, { description: result.path })
        } catch (error) {
          toast.error("Couldn't export the note", { description: errorMessage(error) })
        }
      },
      exportAll: async () => {
        const all = notesRef.current
        if (all.length === 0) {
          toast("There are no notes to export.")
          return
        }
        try {
          const date = new Date().toISOString().slice(0, 10)
          const result = await ipc.files.SaveFile({
            title: "Export All Notes",
            suggestedName: `Notes ${date}.zip`,
            filterName: "ZIP Archive",
            extensions: ["zip"],
            data: buildNotesZip(foldersRef.current, all),
          })
          if (!result.canceled) toast.success(`Exported ${plural(all.length, "note")}`, { description: result.path })
        } catch (error) {
          toast.error("Couldn't export your notes", { description: errorMessage(error) })
        }
      },
      importMarkdown: async () => {
        try {
          const result = await ipc.files.OpenMarkdownFiles({})
          if (result.canceled) return
          const imported = importFiles(result.files)
          if (imported.length > 0) {
            const folder = foldersRef.current.find((candidate) => candidate.id === imported[0].folderId)
            toast.success(`Imported ${plural(imported.length, "note")}`, {
              description: folder ? `Added to “${folder.name}”.` : undefined,
            })
          }
          if (result.skipped.length > 0) {
            toast.warning(`Skipped ${plural(result.skipped.length, "file")}`, {
              description: `${result.skipped.join(", ")} couldn't be read (files over 5 MB are skipped).`,
            })
          }
        } catch (error) {
          toast.error("Couldn't import the files", { description: errorMessage(error) })
        }
      },
    }),
    [createFolder, importFiles, renamingFolderId]
  )

  return (
    <NotesActionsContext.Provider value={actions}>
      {children}

      <ConfirmDialog
        open={pendingNote !== null}
        onOpenChange={(open) => !open && setPendingNoteId(null)}
        title={`Delete “${shownNote.current ? displayTitle(shownNote.current) : ""}”?`}
        description="The note is removed from this computer."
        confirmLabel="Delete Note"
        destructive
        onConfirm={() => {
          if (!pendingNote) return
          const deleted = deleteNote(pendingNote.id)
          if (deleted) undoToast(`Deleted “${displayTitle(deleted)}”`, () => restoreNote(deleted))
        }}
      />

      <ConfirmDialog
        open={pendingFolder !== null}
        onOpenChange={(open) => !open && setPendingFolderId(null)}
        title={`Delete “${shownFolder.current?.name ?? ""}”?`}
        description={
          folderNoteCount === 0
            ? "This folder is empty."
            : `It contains ${plural(folderNoteCount, "note")}. What should happen to ${folderNoteCount === 1 ? "it" : "them"}?`
        }
        confirmLabel={folderMode === "delete" && folderNoteCount > 0 ? "Delete Folder and Notes" : "Delete Folder"}
        destructive
        onConfirm={() => {
          if (!pendingFolder) return
          const mode = folderNoteCount > 0 ? folderMode : "move"
          const deleted = deleteFolder(pendingFolder.id, mode)
          if (!deleted) return
          undoToast(`Deleted “${deleted.folder.name}”`, () => restoreFolder(deleted), {
            description:
              deleted.notes.length === 0
                ? undefined
                : mode === "move"
                  ? `${plural(deleted.notes.length, "note")} moved to “${defaultFolderName}”.`
                  : `${plural(deleted.notes.length, "note")} deleted.`,
          })
        }}
      >
        {folderNoteCount > 0 && (
          <RadioGroup
            value={folderMode}
            onValueChange={(value) => setFolderMode(value as "move" | "delete")}
            aria-label="What to do with the notes"
          >
            <FieldLabel htmlFor="delete-folder-move">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Move notes to “{defaultFolderName}”</FieldTitle>
                  <FieldDescription>Only the folder is deleted.</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="move" id="delete-folder-move" />
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor="delete-folder-delete">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Delete the notes too</FieldTitle>
                  <FieldDescription>The folder and everything in it are removed.</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="delete" id="delete-folder-delete" />
              </Field>
            </FieldLabel>
          </RadioGroup>
        )}
      </ConfirmDialog>
    </NotesActionsContext.Provider>
  )
}
