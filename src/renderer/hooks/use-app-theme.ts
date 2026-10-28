import { useTheme } from "@/components/theme-provider"
import { ipc } from "@/gen/ipc"

export type AppTheme = "light" | "dark" | "system"

/** The renderer theme plus the native one (dialogs, menus, window chrome) kept in step. */
export function useAppTheme() {
  const { theme, setTheme } = useTheme()

  function setAppTheme(next: AppTheme) {
    setTheme(next)
    ipc.app.SetTheme({ theme: next }).catch((error: unknown) => {
      console.warn("Couldn't set the native theme:", error)
    })
  }

  return { theme: theme as AppTheme, setTheme: setAppTheme }
}
