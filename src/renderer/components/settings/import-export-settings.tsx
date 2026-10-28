import { FileDownIcon, FileUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldSeparator, FieldTitle } from "@/components/ui/field"
import { SettingsPage, SettingsSection, SettingsSectionCard, SettingsSectionContent } from "@/components/ui/settings"
import { ipc } from "@/gen/ipc"

/**
 * Settings → Import & Export. The Settings window has no notes store of its own, so both
 * actions run in the notes window (MenuService.Dispatch brings it forward), where the file
 * dialog opens and the result toast appears.
 */
export function ImportExportSettings() {
  function run(id: string) {
    ipc.menu.Dispatch({ id, value: "" }).catch((error: unknown) => console.warn(`Couldn't run ${id}:`, error))
  }

  return (
    <SettingsPage className="px-6 py-5">
      <SettingsSection>
        <SettingsSectionCard>
          <SettingsSectionContent>
            <FieldGroup className="gap-3">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Import Markdown</FieldTitle>
                  <FieldDescription>Add .md files as new notes in the selected folder.</FieldDescription>
                </FieldContent>
                <Button variant="outline" size="sm" onClick={() => run("file.import")}>
                  <FileUpIcon data-icon="inline-start" />
                  Import…
                </Button>
              </Field>
              <FieldSeparator />
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Export all notes</FieldTitle>
                  <FieldDescription>Save every note as Markdown in a ZIP archive, one folder per notes folder.</FieldDescription>
                </FieldContent>
                <Button variant="outline" size="sm" onClick={() => run("notes.exportAll")}>
                  <FileDownIcon data-icon="inline-start" />
                  Export…
                </Button>
              </Field>
            </FieldGroup>
          </SettingsSectionContent>
        </SettingsSectionCard>
      </SettingsSection>
    </SettingsPage>
  )
}
