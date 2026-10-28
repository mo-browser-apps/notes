import { CopyIcon, FileDownIcon, FolderIcon, FolderInputIcon, Trash2Icon } from "lucide-react"

import { useNotesActions } from "@/components/notes/notes-actions-context"
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useNotes } from "@/hooks/use-notes"
import { MOD } from "@/lib/platform"
import type { Note } from "@/lib/types"

/** The note's actions: right-click on a list row. */
export function NoteContextMenuContent({ note }: { note: Note }) {
  const { folders, duplicateNote, moveNote } = useNotes()
  const { exportNote, requestDeleteNote } = useNotesActions()

  return (
    <ContextMenuContent className="min-w-48">
      <ContextMenuGroup>
        <ContextMenuItem onClick={() => duplicateNote(note.id)}>
          <CopyIcon />
          Duplicate Note
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInputIcon />
            Move to
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-40">
            <ContextMenuRadioGroup value={note.folderId} onValueChange={(folderId) => moveNote(note.id, folderId)}>
              {folders.map((folder) => (
                <ContextMenuRadioItem key={folder.id} value={folder.id} closeOnClick>
                  <FolderIcon />
                  {folder.name}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={() => void exportNote(note.id)}>
          <FileDownIcon />
          Export as Markdown…
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem variant="destructive" onClick={() => requestDeleteNote(note.id)}>
          <Trash2Icon />
          Delete Note…
          <ContextMenuShortcut>{MOD}⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  )
}

/** The same actions from the editor toolbar's ⋯ button. */
export function NoteDropdownMenuContent({ note }: { note: Note }) {
  const { folders, duplicateNote, moveNote } = useNotes()
  const { exportNote, requestDeleteNote } = useNotesActions()

  return (
    <DropdownMenuContent align="end" className="min-w-52">
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => duplicateNote(note.id)}>
          <CopyIcon />
          Duplicate Note
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInputIcon />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuRadioGroup value={note.folderId} onValueChange={(folderId) => moveNote(note.id, folderId)}>
              {folders.map((folder) => (
                <DropdownMenuRadioItem key={folder.id} value={folder.id} closeOnClick>
                  <FolderIcon />
                  {folder.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={() => void exportNote(note.id)}>
          <FileDownIcon />
          Export as Markdown…
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem variant="destructive" onClick={() => requestDeleteNote(note.id)}>
          <Trash2Icon />
          Delete Note…
          <DropdownMenuShortcut>{MOD}⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  )
}
