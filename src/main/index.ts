import { app, BrowserWindow, ipc, Theme } from '@mobrowser/api';
import { OpenSettingsRequest, SetThemeRequest } from './gen/app';
import { MenuCommand } from './gen/menu';
import { AppServiceDescriptor, MenuServiceDescriptor, WindowServiceDescriptor } from './gen/ipc_service';
import { registerFilesService } from './files';
import { installAppMenu } from './menu';
import { guardNavigation } from './navigation';
import {
  checkForUpdatesAutomatically,
  closeSettings,
  openSettings,
  registerSettingsService,
  showWindowAtStartup,
  type SettingsSection,
} from './settings';
import { checkForUpdates } from './updates';
import * as process from "node:process";

// The native shell. Archetype: standard app — a large, resizable, three-pane notes window
// (folders | note list | editor) with a Dock icon and an application menu. See
// `.agents/skills/desktop-shell/SKILL.md`.
const win = new BrowserWindow()
win.browser.loadUrl(app.url)

// Size: room for all three panes at launch, with the editor wide enough (≥ 576px, its @xl
// breakpoint, next to the 256px sidebar and the 320px note list) to show the full formatting
// toolbar rather than the narrow Format menu. The minimum is the smallest size the renderer
// still lays out at — below 768px wide the folder sidebar becomes an overlay, leaving the
// note list and the editor side by side.
win.setSize({ width: 1300, height: 900 })
win.setMinimumSize({ width: 720, height: 560 })
win.setResizable(true)

win.setWindowTitleVisible(false)
// Native titlebar on Linux only. On macOS the traffic lights sit on the app's toolbar; on Windows
// the toolbar is the titlebar too, and the renderer draws minimize/maximize/close at its right end
// (WindowControls, backed by WindowService below), since Windows drops the native ones with it.
const isWindows = process.platform === 'win32'
win.setWindowTitlebarVisible(process.platform !== 'darwin' && !isWindows)
if (process.platform === 'darwin') {
  // Vertically center the traffic lights on the app's 48px (h-12) top toolbar so they
  // share a baseline with the sidebar toggle and other toolbar controls. `y` is the top
  // of the ~14px cluster: (48 − 14) / 2 = 17. Keep in sync with --titlebar-inset /
  // --titlebar-traffic-width in src/renderer/index.css and
  // .agents/skills/shadcn/rules/app-window.md.
  win.setWindowButtonPosition({ x: 19, y: 17 })
}

// Links inside notes open in the user's browser; the window never navigates away from the app.
guardNavigation(win)

// Menu commands are performed by the renderer, which streams them from MenuService.OnCommand.
// The stream is runtime-owned pub/sub (registerService with no implementation), the documented
// pattern for broadcasting to every subscriber.
const menuService = ipc.registerService(MenuServiceDescriptor)
function publishCommand(command: MenuCommand) {
  menuService.OnCommand(command)
}
const appMenu = installAppMenu(win, (id, value = '') => {
  publishCommand({ id, value })
})

/** Brings the main window back (Dock click, a command from the Settings window). */
function showMainWindow() {
  if (win.isClosed) return
  if (win.isMinimized) win.restore()
  win.show()
  win.focus()
}

win.centerWindow()
// Settings → General → "Show window at startup" (macOS): when off, the app starts in the Dock
// and the window opens on the first Dock click.
if (showWindowAtStartup()) {
  win.show()
}
app.on('activated', () => {
  if (!win.isClosed && !win.isVisible) showMainWindow()
})
// This is a single-window app: closing the notes window quits, Settings included.
win.on('closed', () => {
  closeSettings()
  app.quit()
})

if (checkForUpdatesAutomatically()) {
  // Not during launch: give the window time to load first.
  setTimeout(() => void checkForUpdates(win.isClosed ? undefined : win, false), 10_000)
}

// Handle the IPC calls from the renderer process.
registerFilesService(win)
registerSettingsService()

// The unary methods; OnCommand is owned by `menuService` above.
ipc.registerService(MenuServiceDescriptor, {
  async SetState(state) {
    appMenu.update(state)
    return {}
  },
  async Dispatch(command) {
    showMainWindow()
    publishCommand(command)
    return {}
  },
})

// The renderer's caption buttons on Windows (the native ones go with the hidden titlebar). The
// state stream is runtime-owned pub/sub, like MenuService.OnCommand above.
if (isWindows) {
  const windowService = ipc.registerService(WindowServiceDescriptor)
  const publishWindowState = () => {
    if (!win.isClosed) windowService.OnState({ maximized: win.isMaximized })
  }
  win.on('maximized', publishWindowState)
  win.on('restored', publishWindowState)
  win.on('resized', publishWindowState)
  ipc.registerService(WindowServiceDescriptor, {
    async Act({ action }) {
      if (action === 'minimize') win.minimize()
      else if (action === 'toggle-maximize') win.isMaximized ? win.restore() : win.maximize()
      else if (action === 'close') win.close()
      return {}
    },
    async GetState() {
      return { maximized: win.isMaximized }
    },
  })
}

ipc.registerService(AppServiceDescriptor, {
  async SetTheme(request: SetThemeRequest) {
    app.setTheme(request.theme as Theme);
    return {};
  },
  // Settings → About is drawn by the renderer (the native message dialog can't show the app
  // icon); it reads the app's identity from mobrowser.conf.json through here.
  async GetAppInfo() {
    return {
      name: app.name,
      version: app.version,
      description: app.description,
      copyright: app.copyright,
      architecture: architectureLabel(),
    };
  },
  async OpenSettings(request: OpenSettingsRequest) {
    openSettings(toSection(request.section));
    return {};
  },
})

function toSection(section: string): SettingsSection {
  return section === 'import-export' || section === 'about' ? section : 'general';
}

/** "Version 1.0.0 (Apple Silicon)" on the About page. */
function architectureLabel(): string {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'Apple Silicon' : 'Intel';
  if (process.arch === 'arm64') return 'ARM64';
  return process.arch === 'x64' ? '64-bit' : '';
}
