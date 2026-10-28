import * as React from "react"
import { DatabaseZapIcon } from "lucide-react"

import { AppCommands } from "@/components/notes/app-commands"
import { FolderSidebar } from "@/components/notes/folder-sidebar"
import { NoteEditor } from "@/components/notes/note-editor"
import { NotesList } from "@/components/notes/notes-list"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useNotes } from "@/hooks/use-notes"

export function NotesApp() {
  const { status, loadError, reload, preferences, setSidebarOpen } = useNotes()

  if (status === "error") {
    return (
      <div className="app-drag-region flex h-svh items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DatabaseZapIcon />
            </EmptyMedia>
            <EmptyTitle>Couldn't open your notes</EmptyTitle>
            <EmptyDescription>
              The local database failed to start{loadError ? `: ${loadError}` : "."} Your notes haven't been changed.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={reload}>Try Again</Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <SidebarProvider
      open={preferences.sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "15rem" } as React.CSSProperties}
    >
      <AppCommands />
      <FolderSidebar />
      <SidebarInset className="min-h-0 min-w-0 flex-row overflow-hidden">
        <NotesList />
        <NoteEditor />
      </SidebarInset>
    </SidebarProvider>
  )
}
