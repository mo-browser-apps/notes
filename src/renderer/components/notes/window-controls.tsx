import * as React from "react"

import { ipc } from "@/gen/ipc"
import { isWindows } from "@/lib/platform"
import { cn } from "@/lib/utils"

/**
 * Minimize, Maximize/Restore and Close for the notes window on Windows.
 *
 * src/main/index.ts hides the native titlebar there, and Windows takes the native caption buttons
 * with it, so they are drawn here in the top-right corner, over the toolbars. The headers under
 * them reserve `--titlebar-controls-width` on the right (index.css), set while this is mounted.
 * 46px wide like Windows 11's own, red Close on hover, and the full toolbar height (48px) so the
 * icons share a baseline with the toolbar's buttons.
 */
export function WindowControls() {
  const [maximized, setMaximized] = React.useState(false)

  React.useEffect(() => {
    if (!isWindows) return
    const root = document.documentElement
    root.dataset.windowControls = ""
    ipc.window
      .GetState({})
      .then((state) => setMaximized(state.maximized))
      .catch((error: unknown) => console.warn("Window state unavailable:", error))
    const subscription = ipc.window.OnState({}).subscribe({
      next: (state) => setMaximized(state.maximized),
      error: (error: unknown) => console.warn("Window state unavailable:", error),
    })
    return () => {
      subscription.unsubscribe()
      delete root.dataset.windowControls
    }
  }, [])

  if (!isWindows) return null

  const act = (action: "minimize" | "toggle-maximize" | "close") => {
    ipc.window.Act({ action }).catch((error: unknown) => console.warn(`Couldn't ${action} the window:`, error))
  }

  return (
    <div
      data-slot="window-controls"
      className="fixed top-0 right-0 z-60 flex h-12 [-webkit-app-region:no-drag]"
    >
      <CaptionButton label="Minimize" onClick={() => act("minimize")}>
        <path d="M0.5 5h10" />
      </CaptionButton>
      <CaptionButton label={maximized ? "Restore Down" : "Maximize"} onClick={() => act("toggle-maximize")}>
        {maximized ? (
          <>
            <rect x="0.5" y="2.5" width="8" height="8" rx="1" />
            <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1" />
          </>
        ) : (
          <rect x="0.5" y="0.5" width="10" height="10" rx="1" />
        )}
      </CaptionButton>
      <CaptionButton label="Close" close onClick={() => act("close")}>
        <path d="M0.5 0.5l10 10M10.5 0.5l-10 10" />
      </CaptionButton>
    </div>
  )
}

function CaptionButton({
  label,
  close = false,
  onClick,
  children,
}: {
  label: string
  close?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        "flex h-full w-[46px] items-center justify-center text-foreground transition-colors outline-none",
        close
          ? "hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/90 active:text-white"
          : "hover:bg-foreground/8 active:bg-foreground/5"
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 11 11"
        className="size-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        shapeRendering="geometricPrecision"
      >
        {children}
      </svg>
    </button>
  )
}
