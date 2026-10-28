import { app, BrowserWindow, ipc, prefs } from '@mobrowser/api'
import { SettingsServiceDescriptor } from './gen/ipc_service'
import { Settings } from './gen/settings'
import { guardNavigation } from './navigation'
import { checkForUpdates, UPDATES_ENABLED } from './updates'

/**
 * The Settings window and the app-level settings it edits.
 *
 * Archetype: a standard macOS-style preferences window — resizable down to a minimum
 * size, one instance, a sidebar of sections (General, Import & Export, About), frameless with the
 * traffic lights over the sidebar on macOS. The renderer draws it at `#/settings/<section>` (src/renderer/components/settings).
 *
 * The theme is not stored here: it lives in the renderer (localStorage, shared by both windows)
 * and is pushed to the native side with AppService.SetTheme.
 */

const SHOW_WINDOW_AT_STARTUP = 'app.showWindowAtStartup'
const CHECK_FOR_UPDATES_AUTOMATICALLY = 'updates.checkAutomatically'

const isMac = process.platform === 'darwin'

export type SettingsSection = 'general' | 'import-export' | 'about'

/**
 * Whether the main window opens at launch. macOS only: with the window hidden, the app is reopened
 * from the Dock (`activated`), which Windows and Linux don't have.
 */
export function showWindowAtStartup(): boolean {
  return !isMac || prefs.getBoolean(SHOW_WINDOW_AT_STARTUP, true)
}

export function checkForUpdatesAutomatically(): boolean {
  return UPDATES_ENABLED && prefs.getBoolean(CHECK_FOR_UPDATES_AUTOMATICALLY, true)
}

function currentSettings(): Settings {
  return {
    launchAtLogin: app.loginItemSettings.openAtLogin,
    showWindowAtStartup: showWindowAtStartup(),
    checkForUpdatesAutomatically: checkForUpdatesAutomatically(),
    updatesEnabled: UPDATES_ENABLED,
  }
}

function setPref(key: string, value: boolean): void {
  prefs.setBoolean(key, value)
  if (!prefs.persist()) console.error(`Couldn't save the ${key} preference`)
}

let settingsWindow: BrowserWindow | null = null

function settingsUrl(section: SettingsSection): string {
  return `${app.url}#/settings/${section}`
}

/** Opens the Settings window on `section`, or brings the open one forward and switches to it. */
export function openSettings(section: SettingsSection = 'general'): void {
  if (settingsWindow && !settingsWindow.isClosed) {
    settingsWindow.browser.loadUrl(settingsUrl(section))
    if (settingsWindow.isMinimized) settingsWindow.restore()
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  const win = new BrowserWindow()
  settingsWindow = win
  guardNavigation(win)
  win.setTitle('Settings')
  // Shape: a portrait-ish preferences window (the reference screenshot is ~633×716), resizable
  // down to a minimum where every section still lays out: below ~620px wide the theme row stacks
  // its label above the cards, and below the content height the section body scrolls.
  // Sizes include the hidden ~32px titlebar on macOS.
  win.setSize({ width: 680, height: 720 })
  win.setMinimumSize({ width: 520, height: 400 })
  win.setResizable(true)
  win.setWindowTitleVisible(false)
  win.setWindowTitlebarVisible(!isMac)
  if (isMac) {
    // Same position as the main window: centred on the 48px (h-12) top row. Keep in sync with
    // --titlebar-* in src/renderer/index.css and .agents/skills/shadcn/rules/app-window.md.
    win.setWindowButtonPosition({ x: 19, y: 17 })
  } else if (process.platform === 'win32') {
    // A window without its own menu would get MōBrowser's default, browser-flavored menu bar.
    win.setMenu(null)
  }
  win.browser.loadUrl(settingsUrl(section))
  win.on('closed', () => {
    if (settingsWindow === win) settingsWindow = null
  })
  win.centerWindow()
  win.show()
}

export function closeSettings(): void {
  if (settingsWindow && !settingsWindow.isClosed) settingsWindow.close()
}

export function registerSettingsService(): void {
  ipc.registerService(SettingsServiceDescriptor, {
    async GetSettings() {
      return currentSettings()
    },
    async SetLaunchAtLogin({ enabled }) {
      app.setLoginItemSettings({ openAtLogin: enabled })
      return currentSettings()
    },
    async SetShowWindowAtStartup({ enabled }) {
      setPref(SHOW_WINDOW_AT_STARTUP, enabled)
      return currentSettings()
    },
    async SetCheckForUpdatesAutomatically({ enabled }) {
      setPref(CHECK_FOR_UPDATES_AUTOMATICALLY, enabled)
      return currentSettings()
    },
    async CheckForUpdates() {
      await checkForUpdates(settingsWindow ?? undefined, true)
      return {}
    },
  })
}
