import * as React from "react"
import { ArrowUpDownIcon, FolderIcon, SearchXIcon, SquarePenIcon, StickyNoteIcon } from "lucide-react"

import { NoteContextMenuContent } from "@/components/notes/note-menus"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Kbd } from "@/components/ui/kbd"
import { SearchField } from "@/components/ui/search-field"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNotes } from "@/hooks/use-notes"
import { useNow } from "@/hooks/use-now"
import { formatListDate, groupNotes, SORT_OPTIONS, sortDateField } from "@/lib/note-order"
import { displayTitle, highlight, notePreview, searchTerms, type TextSegment } from "@/lib/note-text"
import { isMac, MOD } from "@/lib/platform"
import { ALL_NOTES, type Folder, type Note, type SortMode } from "@/lib/types"
import { cn } from "@/lib/utils"

export const SEARCH_INPUT_ID = "notes-search"

export function NotesList() {
  const { status, notes, visibleNotes, preferences, selectedFolder, query, setQuery, selectNote, folders } = useNotes()
  const now = useNow()
  const deferredQuery = React.useDeferredValue(query)
  const terms = React.useMemo(() => searchTerms(deferredQuery), [deferredQuery])
  const groups = React.useMemo(
    () => groupNotes(visibleNotes, preferences.sortMode, now),
    [visibleNotes, preferences.sortMode, now]
  )
  const field = sortDateField(preferences.sortMode) ?? "updatedAt"
  const folderNames = React.useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders])
  const showFolder = preferences.selectedFolderId === ALL_NOTES
  const listRef = React.useRef<HTMLDivElement>(null)

  // Arrow keys move the selection through the list (it is one tab stop, like a native list).
  function onListKeyDown(event: React.KeyboardEvent) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || visibleNotes.length === 0) return
    event.preventDefault()
    const index = visibleNotes.findIndex((note) => note.id === preferences.selectedNoteId)
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? visibleNotes.length - 1
          : Math.min(visibleNotes.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))
    const note = visibleNotes[next]
    selectNote(note.id)
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-note-id="${note.id}"]`)
      row?.focus()
      row?.scrollIntoView({ block: "nearest" })
    })
  }

  const flat = visibleNotes
  const selectedIndex = flat.findIndex((note) => note.id === preferences.selectedNoteId)
  const tabStopId = selectedIndex >= 0 ? flat[selectedIndex].id : flat[0]?.id

  return (
    <section
      aria-label="Notes"
      // Below md the folder sidebar is an overlay, so the list takes some of its room.
      className="flex min-h-0 w-72 shrink-0 flex-col border-r md:w-64 lg:w-80"
    >
      <NotesListHeader count={visibleNotes.length} folder={selectedFolder} searching={!!query.trim()} />
      <div className="px-3 pb-2">
        <SearchField
          id={SEARCH_INPUT_ID}
          value={query}
          onValueChange={setQuery}
          placeholder={selectedFolder ? `Search ${selectedFolder.name}` : "Search all notes"}
          label="Search notes"
          className="sm:max-w-none"
        />
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" onKeyDown={onListKeyDown}>
        {status === "loading" ? (
          <NoteListSkeleton />
        ) : status === "error" ? null : visibleNotes.length === 0 ? (
          query.trim() ? (
            <NoResults query={query.trim()} folder={selectedFolder} />
          ) : (
            <NoNotes folder={selectedFolder} hasAnyNotes={notes.length > 0} />
          )
        ) : (
          groups.map((group) => (
            <div key={group.key} role="group" aria-labelledby={group.label ? `group-${group.key}` : undefined}>
              {group.label && (
                <h2
                  id={`group-${group.key}`}
                  className="sticky top-0 z-10 bg-background px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground"
                >
                  {group.label}
                </h2>
              )}
              <ul className="flex flex-col">
                {group.notes.map((note, index) => {
                  const selected = note.id === preferences.selectedNoteId
                  const nextSelected = group.notes[index + 1]?.id === preferences.selectedNoteId
                  const last = index === group.notes.length - 1
                  return (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      selected={selected}
                      tabbable={note.id === tabStopId}
                      divider={!last && !selected && !nextSelected}
                      date={formatListDate(note[field], now)}
                      folderName={showFolder ? folderNames.get(note.folderId) : undefined}
                      terms={terms}
                      onSelect={selectNote}
                    />
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function NotesListHeader({ count, folder, searching }: { count: number; folder: Folder | null; searching: boolean }) {
  const { status, createNote } = useNotes()
  const { state, isMobile } = useSidebar()
  const name = folder?.name ?? "All Notes"

  return (
    <header
      className={cn(
        "app-drag-region flex h-12 shrink-0 items-center gap-1 pr-2 pl-2",
        // The sidebar no longer covers the traffic lights: start after them.
        (isMobile || state === "collapsed") && "pl-[max(0.5rem,calc(var(--titlebar-traffic-width)+0.25rem))]"
      )}
    >
      <Tooltip>
        <TooltipTrigger render={<SidebarTrigger aria-label="Toggle sidebar" />} />
        <TooltipContent>
          Toggle Sidebar <Kbd>{isMac ? "⌃⌘S" : "Ctrl+Shift+S"}</Kbd>
        </TooltipContent>
      </Tooltip>
      <div className="flex min-w-0 flex-1 flex-col px-1">
        {/* The screen's one h1: in a three-pane app the current folder is the title (there is no Page). */}
        <h1 className="truncate text-sm leading-tight font-semibold">{name}</h1>
        <p className="text-xs text-muted-foreground tabular-nums">
          {count} {searching ? (count === 1 ? "result" : "results") : count === 1 ? "note" : "notes"}
        </p>
      </div>
      <SortMenu />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New Note"
              disabled={status !== "ready"}
              onClick={() => createNote()}
            />
          }
        >
          <SquarePenIcon />
        </TooltipTrigger>
        <TooltipContent>
          New Note <Kbd>{MOD}N</Kbd>
        </TooltipContent>
      </Tooltip>
    </header>
  )
}

function SortMenu() {
  const { preferences, setSortMode } = useNotes()
  const current = SORT_OPTIONS.find((option) => option.value === preferences.sortMode)

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`Sort notes: ${current?.label ?? ""}`} />}
            />
          }
        >
          <ArrowUpDownIcon />
        </TooltipTrigger>
        <TooltipContent>Sort</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort Notes By</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={preferences.sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Highlighted({ segments, selected }: { segments: TextSegment[]; selected: boolean }) {
  return segments.map((segment, index) =>
    segment.match ? (
      <mark
        key={index}
        className={cn(
          "rounded-sm px-px text-inherit",
          selected ? "bg-primary-foreground/30" : "bg-primary/20"
        )}
      >
        {segment.text}
      </mark>
    ) : (
      <React.Fragment key={index}>{segment.text}</React.Fragment>
    )
  )
}

const NoteListItem = React.memo(function NoteListItem({
  note,
  selected,
  tabbable,
  divider,
  date,
  folderName,
  terms,
  onSelect,
}: {
  note: Note
  selected: boolean
  tabbable: boolean
  divider: boolean
  date: string
  folderName?: string
  terms: string[]
  onSelect: (noteId: string) => void
}) {
  const preview = notePreview(note, terms)
  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              data-note-id={note.id}
              aria-current={selected ? "true" : undefined}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => onSelect(note.id)}
              onContextMenu={() => onSelect(note.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            />
          }
        >
          <span className="truncate text-sm font-semibold">
            <Highlighted segments={highlight(displayTitle(note), terms)} selected={selected} />
          </span>
          <span className="flex min-w-0 items-baseline gap-2 text-xs">
            <span className={cn("shrink-0 tabular-nums", !selected && "text-foreground/80")}>{date}</span>
            <span className={cn("truncate", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {preview ? <Highlighted segments={highlight(preview, terms)} selected={selected} /> : "No additional text"}
            </span>
          </span>
          {folderName && (
            <span
              className={cn(
                "flex min-w-0 items-center gap-1 text-xs",
                selected ? "text-primary-foreground/80" : "text-muted-foreground"
              )}
            >
              <FolderIcon className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{folderName}</span>
            </span>
          )}
        </ContextMenuTrigger>
        <NoteContextMenuContent note={note} />
      </ContextMenu>
      <div aria-hidden="true" className={cn("mx-3 h-px bg-border", !divider && "invisible")} />
    </li>
  )
})

function NoteListSkeleton() {
  return (
    <div className="flex flex-col gap-1 pt-3" aria-busy="true" aria-label="Loading notes">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5 px-3 py-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  )
}

function NoNotes({ folder, hasAnyNotes }: { folder: Folder | null; hasAnyNotes: boolean }) {
  const { createNote } = useNotes()
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <StickyNoteIcon />
        </EmptyMedia>
        <EmptyTitle>{hasAnyNotes ? `No notes in “${folder?.name ?? "All Notes"}”` : "No notes yet"}</EmptyTitle>
        <EmptyDescription>
          {hasAnyNotes ? "Notes you create here will appear in this list." : "Create your first note to get started."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" onClick={() => createNote()}>
          <SquarePenIcon data-icon="inline-start" />
          New Note
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function NoResults({ query, folder }: { query: string; folder: Folder | null }) {
  const { setQuery, selectFolder } = useNotes()
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>No Results</EmptyTitle>
        <EmptyDescription className="break-words">
          No notes {folder ? `in “${folder.name}” ` : ""}match “{query}”.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        <Button size="sm" variant="outline" onClick={() => setQuery("")}>
          Clear Search
        </Button>
        {folder && (
          <Button size="sm" variant="outline" onClick={() => selectFolder(ALL_NOTES)}>
            Search All Notes
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}
