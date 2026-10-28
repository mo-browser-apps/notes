import * as React from "react"
import { EditorSelection } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { NotebookPenIcon, SquarePenIcon } from "lucide-react"

import { EditorToolbar } from "@/components/notes/editor-toolbar"
import { LinkDialog } from "@/components/notes/link-dialog"
import { MarkdownEditor } from "@/components/notes/markdown-editor"
import { MarkdownPreview } from "@/components/notes/markdown-preview"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { useNotes } from "@/hooks/use-notes"
import { activeEditorRegistry } from "@/lib/format-commands"
import { applyLink, linkAtSelection, toggleTaskInMarkdown, type LinkTarget } from "@/lib/markdown-commands"
import { formatLongDate } from "@/lib/note-order"
import { displayTitle, UNTITLED } from "@/lib/note-text"
import { MOD } from "@/lib/platform"
import type { Note } from "@/lib/types"
import { cn } from "@/lib/utils"

export function NoteEditor() {
  const { status, notes, selectedNote, focusTitleToken } = useNotes()
  // A new note asks for its title to be focused; the document below remounts per note, so the
  // request is tracked here.
  const handledToken = React.useRef(focusTitleToken)
  const focusTitle = handledToken.current !== focusTitleToken
  React.useEffect(() => {
    handledToken.current = focusTitleToken
  })

  return (
    <section aria-label="Editor" className="@container/editor flex min-w-0 flex-1 flex-col">
      {status === "loading" ? (
        <EditorSkeleton />
      ) : selectedNote ? (
        <NoteDocument key={selectedNote.id} note={selectedNote} focusTitle={focusTitle} focusToken={focusTitleToken} />
      ) : (
        <EditorEmpty hasNotes={notes.length > 0} />
      )}
    </section>
  )
}

function NoteDocument({ note, focusTitle, focusToken }: { note: Note; focusTitle: boolean; focusToken: number }) {
  const { preferences, setEditorMode, updateNote, saveFailed } = useNotes()
  const mode = preferences.editorMode
  const viewRef = React.useRef<EditorView | null>(null)
  const titleRef = React.useRef<HTMLTextAreaElement>(null)
  const [link, setLink] = React.useState<LinkTarget | null>(null)

  // A new note: put the caret in its title.
  React.useEffect(() => {
    if (focusTitle) titleRef.current?.focus()
    // Deliberately only focusToken: once per request.
  }, [focusToken])

  const focusBody = React.useCallback((at: "start" | "keep" = "start") => {
    const view = viewRef.current
    if (!view) return
    if (at === "start") view.dispatch({ selection: EditorSelection.cursor(0) })
    view.focus()
  }, [])

  const requestLink = React.useCallback(() => {
    const view = viewRef.current
    if (view) setLink(linkAtSelection(view))
  }, [])

  const onContentChange = React.useCallback((content: string) => updateNote(note.id, { content }), [note.id, updateNote])
  const onExitTop = React.useCallback(() => {
    const title = titleRef.current
    if (!title) return
    title.focus()
    title.setSelectionRange(title.value.length, title.value.length)
  }, [])

  return (
    <>
      <EditorToolbar
        note={note}
        mode={mode}
        onModeChange={setEditorMode}
        getView={() => viewRef.current}
        onRequestLink={requestLink}
        saveFailed={saveFailed}
      />
      <div className="min-h-0 flex-1 overflow-y-auto" data-slot="editor-scroller">
        <article className="mx-auto flex w-full max-w-3xl flex-col px-5 pt-2 pb-8 @2xl/editor:px-10">
          <p className="mb-3 text-center text-xs text-muted-foreground">
            <time dateTime={new Date(note.updatedAt).toISOString()}>{formatLongDate(note.updatedAt)}</time>
          </p>
          {mode === "edit" ? (
            <textarea
              ref={titleRef}
              value={note.title}
              rows={1}
              placeholder={UNTITLED}
              aria-label="Note title"
              spellCheck
              // A document title: the caret is the focus indicator, as in the body below it.
              className="mb-2 field-sizing-content w-full resize-none bg-transparent text-[26px] leading-tight font-bold break-words outline-none placeholder:text-muted-foreground/50"
              onChange={(event) => updateNote(note.id, { title: event.target.value.replace(/[\r\n]+/g, " ") })}
              onKeyDown={(event) => {
                const atEnd = event.currentTarget.selectionStart === event.currentTarget.value.length
                if (event.key === "Enter" || (event.key === "ArrowDown" && atEnd)) {
                  event.preventDefault()
                  focusBody(event.key === "Enter" ? "start" : "keep")
                }
              }}
            />
          ) : (
            <h2 className={cn("mb-2 text-[26px] leading-tight font-bold break-words", !note.title.trim() && "text-muted-foreground/50")}>
              {displayTitle(note)}
            </h2>
          )}
          {mode === "edit" ? (
            <MarkdownEditor
              value={note.content}
              onChange={onContentChange}
              onRequestLink={requestLink}
              onViewChange={(view) => {
                viewRef.current = view
                // Menu commands (Format ▸ …) act on this editor while it is mounted.
                activeEditorRegistry.set(view ? { view, requestLink } : null)
              }}
              onExitTop={onExitTop}
              label="Note body"
            />
          ) : note.content.trim() ? (
            <MarkdownPreview
              markdown={note.content}
              onToggleTask={(line) => updateNote(note.id, { content: toggleTaskInMarkdown(note.content, line) })}
            />
          ) : (
            <p className="text-[15px] text-muted-foreground">This note is empty.</p>
          )}
        </article>
      </div>
      <LinkDialog
        open={link !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLink(null)
            requestAnimationFrame(() => focusBody("keep"))
          }
        }}
        initialText={link?.text ?? ""}
        initialUrl={link?.url ?? ""}
        editing={!!link?.url}
        onSubmit={(text, url) => {
          const view = viewRef.current
          if (view && link) applyLink(view, link, text, url)
        }}
      />
    </>
  )
}

function EditorSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-10 pt-16" aria-busy="true" aria-label="Loading note">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

function EditorEmpty({ hasNotes }: { hasNotes: boolean }) {
  const { createNote } = useNotes()
  return (
    <div className="flex flex-1 flex-col">
      {/* Only this strip moves the window, like the toolbar it stands in for. A drag region
          under the content would swallow clicks on anything drawn over it — e.g. a dialog. */}
      <div aria-hidden="true" className="app-drag-region h-12 shrink-0" />
      <Empty className="pb-18">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NotebookPenIcon />
          </EmptyMedia>
          <EmptyTitle>{hasNotes ? "No Note Selected" : "Welcome to Notes"}</EmptyTitle>
          <EmptyDescription>
            {hasNotes
              ? "Choose a note from the list, or start a new one."
              : "You don't have any notes yet. Create one to start writing — everything stays on this computer."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => createNote()}>
            <SquarePenIcon data-icon="inline-start" />
            {hasNotes ? "New Note" : "Create Note"}
          </Button>
          <p className="text-xs text-muted-foreground">
            or press <Kbd>{MOD}N</Kbd>
          </p>
        </EmptyContent>
      </Empty>
    </div>
  )
}
