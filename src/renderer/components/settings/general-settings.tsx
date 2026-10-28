import * as React from "react"
import { toast } from "sonner"

import { ThemePicker } from "@/components/settings/theme-picker"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldTitle } from "@/components/ui/field"
import {
  SettingsPage,
  SettingsSection,
  SettingsSectionCard,
  SettingsSectionContent,
  SettingsSectionHeader,
  SettingsSectionTitle,
} from "@/components/ui/settings"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ipc } from "@/gen/ipc"
import type { Settings } from "@/gen/settings"
import { isMac } from "@/lib/platform"

type Toggle = {
  id: string
  label: string
  description: string
  value: (settings: Settings) => boolean
  save: (enabled: boolean) => Promise<Settings>
  /** Hidden when it doesn't apply on this platform or configuration. */
  available: (settings: Settings) => boolean
}

const TOGGLES: Toggle[] = [
  {
    id: "launch-at-login",
    label: "Launch at login",
    description: "Open Notes automatically when you sign in.",
    value: (settings) => settings.launchAtLogin,
    save: (enabled) => ipc.settings.SetLaunchAtLogin({ enabled }),
    available: () => true,
  },
  {
    // macOS only: with the window hidden, Notes is reopened from the Dock (src/main/settings.ts).
    id: "show-window-at-startup",
    label: "Show window at startup",
    description: "Open the notes window when Notes starts. When off, click the Dock icon to open it.",
    value: (settings) => settings.showWindowAtStartup,
    save: (enabled) => ipc.settings.SetShowWindowAtStartup({ enabled }),
    available: () => isMac,
  },
  {
    id: "check-for-updates",
    label: "Check for updates automatically",
    description: "Look for a newer version of Notes when it starts.",
    value: (settings) => settings.checkForUpdatesAutomatically,
    save: (enabled) => ipc.settings.SetCheckForUpdatesAutomatically({ enabled }),
    available: (settings) => settings.updatesEnabled,
  },
]

export function GeneralSettings() {
  const [settings, setSettings] = React.useState<Settings | null>(null)

  React.useEffect(() => {
    ipc.settings
      .GetSettings({})
      .then(setSettings)
      .catch((error: unknown) => {
        console.warn("Couldn't load the settings:", error)
        toast.error("Couldn't load the settings")
      })
  }, [])

  function save(toggle: Toggle, enabled: boolean) {
    toggle
      .save(enabled)
      .then(setSettings)
      .catch((error: unknown) => {
        console.warn(`Couldn't save "${toggle.label}":`, error)
        toast.error(`Couldn't change “${toggle.label}”`)
      })
  }

  // Until the settings load, show every toggle that could apply, with a placeholder switch.
  const toggles = TOGGLES.filter((toggle) => (settings ? toggle.available(settings) : toggle.id !== "check-for-updates"))

  return (
    <SettingsPage className="px-6 py-5">
      <SettingsSection>
        <SettingsSectionCard>
          <SettingsSectionContent>
            <FieldGroup className="gap-3">
              {toggles.map((toggle, index) => (
                <React.Fragment key={toggle.id}>
                  {index > 0 && <FieldSeparator />}
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor={toggle.id}>{toggle.label}</FieldLabel>
                      <FieldDescription>{toggle.description}</FieldDescription>
                    </FieldContent>
                    {settings ? (
                      <Switch
                        id={toggle.id}
                        checked={toggle.value(settings)}
                        onCheckedChange={(checked) => save(toggle, checked)}
                      />
                    ) : (
                      <Skeleton className="h-[18.4px] w-8 shrink-0 rounded-full" />
                    )}
                  </Field>
                </React.Fragment>
              ))}
            </FieldGroup>
          </SettingsSectionContent>
        </SettingsSectionCard>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionTitle>Appearance</SettingsSectionTitle>
        </SettingsSectionHeader>
        <SettingsSectionCard>
          {/* A container: when the window is narrow, the label goes above the cards so they keep a
              usable size instead of shrinking beside it. */}
          <SettingsSectionContent className="@container">
            <Field orientation="horizontal" className="items-start gap-6 @max-[22rem]:flex-col @max-[22rem]:gap-3">
              <FieldTitle id="theme-label" className="w-auto shrink-0">
                Theme
              </FieldTitle>
              <ThemePicker labelledBy="theme-label" />
            </Field>
          </SettingsSectionContent>
        </SettingsSectionCard>
      </SettingsSection>
    </SettingsPage>
  )
}
