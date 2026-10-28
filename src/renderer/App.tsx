import { useEffect } from "react";

import { NotesActionsProvider } from "@/components/notes/notes-actions";
import { NotesApp } from "@/components/notes/notes-app";
import { SettingsApp } from "@/components/settings/settings-app";
import { ThemeProvider } from "@/components/theme-provider";
import { useRoute } from "@/components/ui/router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppTheme } from "@/hooks/use-app-theme";
import { NotesProvider } from "@/hooks/use-notes";
import { isMac } from "@/lib/platform";

// The provider stack lives here, once: theme, tooltips, and the toast outlet for both windows;
// the notes store and shared note actions for the notes window only. See
// .agents/skills/shadcn/rules/structure.md before adding another provider.
//
// Two windows load this renderer: the notes window at `#/`, and the Settings window
// (src/main/settings.ts) at `#/settings/<section>`.
function App() {
  const { segments } = useRoute();

  return (
    <ThemeProvider>
      <TooltipProvider>
        <AppContent>
          {segments[0] === "settings" ? (
            <SettingsApp section={segments[1]} />
          ) : (
            <NotesProvider>
              <NotesActionsProvider>
                <NotesApp />
              </NotesActionsProvider>
            </NotesProvider>
          )}
        </AppContent>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useAppTheme();

  // Gates the macOS-only titlebar insets and drag regions in index.css.
  useEffect(() => {
    if (isMac) {
      document.documentElement.dataset.platform = "mac";
    }
  }, []);

  // Native dialogs and menus follow the saved theme from the start.
  useEffect(() => {
    setTheme(theme);
    // Deliberately no dependencies: once, at launch.
  }, []);

  return children;
}

export default App
