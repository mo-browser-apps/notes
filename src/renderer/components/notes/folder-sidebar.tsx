import * as React from "react"
import {
  EllipsisIcon,
  FileDownIcon,
  FileUpIcon,
  FolderIcon,
  FolderPlusIcon,
  NotebookTextIcon,
  PencilIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { useNotesActions } from "@/components/notes/notes-actions-context"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ipc } from "@/gen/ipc"
import { useNotes } from "@/hooks/use-notes"
import { ALL_NOTES, DEFAULT_FOLDER_ID, type Folder } from "@/lib/types"
import { shortcutLabel } from "@/lib/platform"

export function FolderSidebar() {
  const { status, folders, notes, noteCounts, preferences, selectFolder } = useNotes()
  const { newFolder } = useNotesActions()
  const { isMobile, setOpenMobile } = useSidebar()

  function open(folderId: string) {
    selectFolder(folderId)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="offcanvas">
      {/* Flush with the 48px toolbar; on macOS the title starts after the traffic lights. */}
      <SidebarHeader className="app-drag-region h-12 flex-row items-center gap-1 py-0 pr-2 pl-[calc(var(--titlebar-traffic-width)+0.75rem)]">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">Notes</span>
        {isMobile ? (
          // In the overlay this is the first focused control, and a tooltip there would eat
          // the first Escape meant to close the overlay.
          <Button variant="ghost" size="icon-sm" aria-label="New Folder" disabled={status !== "ready"} onClick={newFolder}>
            <FolderPlusIcon />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="New Folder" disabled={status !== "ready"} onClick={newFolder} />}
            >
              <FolderPlusIcon />
            </TooltipTrigger>
            <TooltipContent>
              New Folder <Kbd>{shortcutLabel("N", { shift: true })}</Kbd>
            </TooltipContent>
          </Tooltip>
        )}
        <SidebarMoreMenu />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={preferences.selectedFolderId === ALL_NOTES}
                aria-current={preferences.selectedFolderId === ALL_NOTES ? "page" : undefined}
                onClick={() => open(ALL_NOTES)}
              >
                <NotebookTextIcon />
                <span>All Notes</span>
              </SidebarMenuButton>
              {status === "ready" && <SidebarMenuBadge>{notes.length}</SidebarMenuBadge>}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Folders</SidebarGroupLabel>
          <SidebarMenu>
            {status === "loading"
              ? Array.from({ length: 4 }, (_, index) => (
                  <SidebarMenuItem key={index}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))
              : folders.map((folder) => (
                  <FolderItem
                    key={folder.id}
                    folder={folder}
                    count={noteCounts.get(folder.id) ?? 0}
                    active={preferences.selectedFolderId === folder.id}
                    onOpen={() => open(folder.id)}
                  />
                ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

function openSettings() {
  ipc.app.OpenSettings({ section: "general" }).catch((error: unknown) => {
    console.warn("Couldn't open Settings:", error)
  })
}

function SidebarMoreMenu() {
  const { importMarkdown, exportAll } = useNotesActions()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More options" />}>
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => void importMarkdown()}>
            <FileUpIcon />
            Import Markdown…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void exportAll()}>
            <FileDownIcon />
            Export All Notes…
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* Appearance and the app-level settings live in the Settings window. */}
          <DropdownMenuItem onClick={openSettings}>
            <SettingsIcon />
            Settings…
            <DropdownMenuShortcut>{shortcutLabel(",")}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FolderItem({
  folder,
  count,
  active,
  onOpen,
}: {
  folder: Folder
  count: number
  active: boolean
  onOpen: () => void
}) {
  const { renameFolder } = useNotes()
  const { newFolder, requestDeleteFolder, renamingFolderId, setRenamingFolderId } = useNotesActions()
  const renaming = renamingFolderId === folder.id
  const deletable = folder.id !== DEFAULT_FOLDER_ID

  if (renaming) {
    return (
      <SidebarMenuItem>
        <FolderNameInput
          name={folder.name}
          onCommit={(name) => {
            renameFolder(folder.id, name)
            setRenamingFolderId(null)
          }}
          onCancel={() => setRenamingFolderId(null)}
        />
      </SidebarMenuItem>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<SidebarMenuItem />}>
        <SidebarMenuButton
          isActive={active}
          aria-current={active ? "page" : undefined}
          onClick={onOpen}
          onDoubleClick={() => setRenamingFolderId(folder.id)}
        >
          <FolderIcon />
          <span>{folder.name}</span>
        </SidebarMenuButton>
        {/* The count gives way to the actions button on hover/focus, and while its menu is open:
            the button stays visible then (aria-expanded) after the pointer and focus move into the menu. */}
        <SidebarMenuBadge className="group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 group-has-aria-expanded/menu-item:opacity-0">
          {count}
        </SidebarMenuBadge>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuAction
                showOnHover
                aria-label={`Actions for ${folder.name}`}
                // showOnHover only hides it from md up; the overlay sidebar below md needs it too.
                className="max-md:opacity-0 max-md:group-focus-within/menu-item:opacity-100 max-md:group-hover/menu-item:opacity-100 max-md:aria-expanded:opacity-100"
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setRenamingFolderId(folder.id)}>
                <PencilIcon />
                Rename Folder
              </DropdownMenuItem>
              {deletable && (
                <DropdownMenuItem variant="destructive" onClick={() => requestDeleteFolder(folder.id)}>
                  <Trash2Icon />
                  Delete Folder…
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => setRenamingFolderId(folder.id)}>
            <PencilIcon />
            Rename Folder
          </ContextMenuItem>
          {deletable && (
            <ContextMenuItem variant="destructive" onClick={() => requestDeleteFolder(folder.id)}>
              <Trash2Icon />
              Delete Folder…
            </ContextMenuItem>
          )}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem onClick={newFolder}>
            <FolderPlusIcon />
            New Folder
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Inline rename: Enter or leaving the field commits, Esc reverts. */
function FolderNameInput({
  name,
  onCommit,
  onCancel,
}: {
  name: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = React.useState(name)
  const done = React.useRef(false)

  function finish(commit: boolean) {
    if (done.current) return
    done.current = true
    if (commit && value.trim()) onCommit(value)
    else onCancel()
  }

  return (
    <form
      className="flex h-8 items-center gap-2 px-2"
      onSubmit={(event) => {
        event.preventDefault()
        finish(true)
      }}
    >
      <FolderIcon className="size-4 shrink-0 text-sidebar-foreground" aria-hidden="true" />
      <Input
        value={value}
        aria-label="Folder name"
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Inline editor: Esc reverts here and mustn't also close an enclosing sheet.
            event.preventDefault()
            event.stopPropagation()
            finish(false)
          }
        }}
        className="h-7 min-w-0 flex-1 px-1.5"
      />
    </form>
  )
}
