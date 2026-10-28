import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** Insert a link, or edit the one under the cursor (⌘K). */
export function LinkDialog({
  open,
  onOpenChange,
  initialText,
  initialUrl,
  editing,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialText: string
  initialUrl: string
  editing: boolean
  onSubmit: (text: string, url: string) => void
}) {
  const [text, setText] = React.useState(initialText)
  const [url, setUrl] = React.useState(initialUrl)

  React.useEffect(() => {
    if (open) {
      setText(initialText)
      setUrl(initialUrl)
    }
  }, [open, initialText, initialUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!url.trim()) return
            onSubmit(text, url)
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Link" : "Insert Link"}</DialogTitle>
            <DialogDescription>Links open in your web browser.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="link-url">URL</FieldLabel>
              <Input
                id="link-url"
                value={url}
                placeholder="https://example.com"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="link-text">Text</FieldLabel>
              <Input
                id="link-text"
                value={text}
                placeholder="Defaults to the URL"
                autoComplete="off"
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim()}>
              {editing ? "Update Link" : "Insert Link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
