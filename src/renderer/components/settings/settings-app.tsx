import * as React from "react"
import { ArrowDownUpIcon, InfoIcon, SettingsIcon, type LucideIcon } from "lucide-react"

import { AboutSettings } from "@/components/settings/about-settings"
import { GeneralSettings } from "@/components/settings/general-settings"
import { ImportExportSettings } from "@/components/settings/import-export-settings"
import { Link } from "@/components/ui/router"
import { SettingsPageTitle } from "@/components/ui/settings"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { isMac } from "@/lib/platform"

const SECTIONS: { id: string; label: string; icon: LucideIcon; render: () => React.ReactNode }[] = [
  { id: "general", label: "General", icon: SettingsIcon, render: () => <GeneralSettings /> },
  { id: "import-export", label: "Import & Export", icon: ArrowDownUpIcon, render: () => <ImportExportSettings /> },
  { id: "about", label: "About", icon: InfoIcon, render: () => <AboutSettings /> },
]

/**
 * The Settings window (opened by src/main/settings.ts at `#/settings/<section>`): a resizable
 * window with a section sidebar on the left and the section on the right.
 *
 * The sidebar is `collapsible="none"`: the window opens at 680px, below the 768px mobile
 * breakpoint, where an offcanvas sidebar would turn into an overlay sheet. On macOS the traffic
 * lights sit over the sidebar's empty 48px top row (a drag handle), level with the section title.
 */
export function SettingsApp({ section }: { section?: string }) {
  const current = SECTIONS.find((candidate) => candidate.id === section) ?? SECTIONS[0]

  React.useEffect(() => {
    document.title = `${current.label} – Settings`
  }, [current.label])

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden" style={{ "--sidebar-width": "12.5rem" } as React.CSSProperties}>
      <Sidebar collapsible="none" className="border-r">
        {isMac && <SidebarHeader className="app-drag-region h-12 shrink-0" />}
        <SidebarContent>
          <SidebarGroup className={isMac ? "pt-0" : undefined}>
            <SidebarMenu className="gap-0.5">
              {SECTIONS.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={item.id === current.id}
                    aria-current={item.id === current.id ? "page" : undefined}
                    render={<Link to={`/settings/${item.id}`} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Flush to the top, on the traffic lights' baseline; the empty space drags the window. */}
        <header className="app-drag-region flex h-12 shrink-0 items-center border-b px-10">
          <SettingsPageTitle className="truncate">{current.label}</SettingsPageTitle>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{current.render()}</div>
      </main>
    </SidebarProvider>
  )
}
