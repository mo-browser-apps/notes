import * as React from "react"
import type { EditorView } from "@codemirror/view"
import {
  BoldIcon,
  CodeIcon,
  EllipsisIcon,
  EyeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PencilLineIcon,
  PlusIcon,
  SquareCodeIcon,
  StrikethroughIcon,
  TextQuoteIcon,
  Trash2Icon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react"

import { NoteDropdownMenuContent } from "@/components/notes/note-menus"
import { useNotesActions } from "@/components/notes/notes-actions-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FORMAT_COMMANDS } from "@/lib/format-commands"
import { shortcutLabel } from "@/lib/platform"
import type { EditorMode, Note } from "@/lib/types"

interface FormatAction {
  label: string
  icon: LucideIcon
  shortcut?: string
  run: (view: EditorView) => void
}

const TEXT_STYLES: FormatAction[] = [
  { label: "Title", icon: HeadingIcon, shortcut: shortcutLabel("1", { alt: true }), run: FORMAT_COMMANDS.title },
  { label: "Heading", icon: HeadingIcon, shortcut: shortcutLabel("2", { alt: true }), run: FORMAT_COMMANDS.heading },
  { label: "Subheading", icon: HeadingIcon, shortcut: shortcutLabel("3", { alt: true }), run: FORMAT_COMMANDS.subheading },
  { label: "Body", icon: TypeIcon, shortcut: shortcutLabel("0", { alt: true }), run: FORMAT_COMMANDS.body },
]

const BOLD: FormatAction = { label: "Bold", icon: BoldIcon, shortcut: shortcutLabel("B"), run: FORMAT_COMMANDS.bold }
const ITALIC: FormatAction = { label: "Italic", icon: ItalicIcon, shortcut: shortcutLabel("I"), run: FORMAT_COMMANDS.italic }
const STRIKE: FormatAction = {
  label: "Strikethrough",
  icon: StrikethroughIcon,
  shortcut: shortcutLabel("X", { shift: true }),
  run: FORMAT_COMMANDS.strikethrough,
}
const BULLETS: FormatAction = {
  label: "Bulleted List",
  icon: ListIcon,
  shortcut: shortcutLabel("8", { shift: true }),
  run: FORMAT_COMMANDS.bullets,
}
const NUMBERS: FormatAction = {
  label: "Numbered List",
  icon: ListOrderedIcon,
  shortcut: shortcutLabel("7", { shift: true }),
  run: FORMAT_COMMANDS.numbers,
}
const CHECKLIST: FormatAction = {
  label: "Checklist",
  icon: ListChecksIcon,
  shortcut: shortcutLabel("L", { shift: true }),
  run: FORMAT_COMMANDS.checklist,
}
const INSERTS: FormatAction[] = [
  { label: "Quote", icon: TextQuoteIcon, run: FORMAT_COMMANDS.quote },
  { label: "Inline Code", icon: CodeIcon, shortcut: shortcutLabel("E"), run: FORMAT_COMMANDS.code },
  { label: "Code Block", icon: SquareCodeIcon, run: FORMAT_COMMANDS.codeBlock },
  { label: "Horizontal Rule", icon: MinusIcon, run: FORMAT_COMMANDS.rule },
]

// Toolbar buttons keep the editor's selection: no focus steal on mousedown.
const keepSelection = (event: React.MouseEvent) => event.preventDefault()

function ToolbarButton({
  label,
  shortcut,
  icon: Icon,
  onClick,
  formatting = true,
}: {
  label: string
  shortcut?: string
  icon: LucideIcon
  onClick: () => void
  /** Formatting buttons leave focus (and the selection) in the editor. */
  formatting?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onMouseDown={formatting ? keepSelection : undefined}
            onClick={onClick}
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

function FormatMenuItems({ actions, run }: { actions: FormatAction[]; run: (action: FormatAction) => void }) {
  return actions.map((action) => (
    <DropdownMenuItem key={action.label} onClick={() => run(action)}>
      <action.icon />
      {action.label}
      {action.shortcut && <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  ))
}

export function EditorToolbar({
  note,
  mode,
  onModeChange,
  getView,
  onRequestLink,
  saveFailed,
}: {
  note: Note
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  getView: () => EditorView | null
  onRequestLink: () => void
  saveFailed: boolean
}) {
  const { requestDeleteNote } = useNotesActions()
  const editing = mode === "edit"

  const run = (action: FormatAction) => {
    const view = getView()
    if (view) action.run(view)
  }
  // After a format menu closes, typing continues in the editor rather than on the menu button.
  const backToEditor = () => getView()?.contentDOM ?? true

  return (
    <header className="app-drag-region flex h-12 shrink-0 items-center gap-1 px-2" aria-label="Note toolbar">
      {editing && (
        <>
          {/* Wide: the common actions as buttons. */}
          <div role="toolbar" aria-label="Formatting" className="hidden min-w-0 items-center gap-0.5 @xl/editor:flex">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label="Text style" onMouseDown={keepSelection} />}
                    />
                  }
                >
                  <HeadingIcon />
                </TooltipTrigger>
                <TooltipContent>Text Style</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="min-w-48" finalFocus={backToEditor}>
                <DropdownMenuGroup>
                  <FormatMenuItems actions={TEXT_STYLES} run={run} />
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {[BOLD, ITALIC, STRIKE].map((action) => (
              <ToolbarButton key={action.label} {...action} onClick={() => run(action)} />
            ))}
            <Separator orientation="vertical" className="mx-1 h-5 self-center" />
            {[BULLETS, NUMBERS, CHECKLIST].map((action) => (
              <ToolbarButton key={action.label} {...action} onClick={() => run(action)} />
            ))}
            <Separator orientation="vertical" className="mx-1 h-5 self-center" />
            <ToolbarButton label="Link" icon={LinkIcon} shortcut={shortcutLabel("K")} onClick={onRequestLink} />
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label="Insert" onMouseDown={keepSelection} />}
                    />
                  }
                >
                  <PlusIcon />
                </TooltipTrigger>
                <TooltipContent>Insert</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="min-w-52" finalFocus={backToEditor}>
                <DropdownMenuGroup>
                  <FormatMenuItems actions={INSERTS} run={run} />
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Narrow: everything in one Format menu. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="@xl/editor:hidden" onMouseDown={keepSelection} />
              }
            >
              <TypeIcon data-icon="inline-start" />
              Format
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56" finalFocus={backToEditor}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Text Style</DropdownMenuLabel>
                <FormatMenuItems actions={TEXT_STYLES} run={run} />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <FormatMenuItems actions={[BOLD, ITALIC, STRIKE]} run={run} />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <FormatMenuItems actions={[BULLETS, NUMBERS, CHECKLIST]} run={run} />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onRequestLink}>
                  <LinkIcon />
                  Link…
                  <DropdownMenuShortcut>{shortcutLabel("K")}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <FormatMenuItems actions={INSERTS} run={run} />
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <div className="flex-1" />

      {saveFailed && (
        <span role="status" className="shrink-0 px-1 text-xs text-destructive">
          Not saved
        </span>
      )}

      <ToggleGroup
        value={[mode]}
        onValueChange={(value) => value[0] && onModeChange(value[0] as EditorMode)}
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="Editor mode"
      >
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="edit" aria-label="Edit Markdown" />}>
            <PencilLineIcon />
            <span className="hidden @3xl/editor:inline">Edit</span>
          </TooltipTrigger>
          <TooltipContent>
            Edit <Kbd>{shortcutLabel("P", { shift: true })}</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="preview" aria-label="Preview" />}>
            <EyeIcon />
            <span className="hidden @3xl/editor:inline">Preview</span>
          </TooltipTrigger>
          <TooltipContent>
            Preview <Kbd>{shortcutLabel("P", { shift: true })}</Kbd>
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <ToolbarButton
        label="Delete Note"
        icon={Trash2Icon}
        shortcut={shortcutLabel("⌫")}
        formatting={false}
        onClick={() => requestDeleteNote(note.id)}
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Note actions" />} />}
          >
            <EllipsisIcon />
          </TooltipTrigger>
          <TooltipContent>More</TooltipContent>
        </Tooltip>
        <NoteDropdownMenuContent note={note} />
      </DropdownMenu>
    </header>
  )
}
