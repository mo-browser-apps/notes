# Settings window (General, Import & Export, About)

A desktop app's preferences live in a **Settings window**, opened with **Settings…** (⌘, on macOS).
**About** is a section of that window, not a separate dialog. Every app built here gets one, even
with only a few settings: theme, launch at login, and About are universal.

**This project's implementation:**

- `src/main/settings.ts`: the window, the prefs and `SettingsService`.
- `src/main/updates.ts`: update checks.
- `src/renderer/components/settings/*`: the UI.
- `test/e2e/settings.test.ts`: the regression tests.

**Read them and extend them.**

## Shape: a second, resizable window

- **One instance.** `openSettings(section)` creates the window or, if it's open, navigates it and
  brings it forward (`restore()` if minimized, `show()`, `focus()`). Clear the reference on
  `'closed'`.
- **Portrait-ish default size:** `setSize({ width: 680, height: 720 })`, like macOS System
  Settings and the reference screenshot (~633×716). The user tried a compact, content-sized
  640×470 and asked for this size back, so don't shrink it to fit the content. `setSize` includes
  the hidden titlebar on macOS, so the inner height is about 32px less.
- **Resizable, with a minimum:** `setResizable(true)` plus `setMinimumSize({ width: 520, height: 400 })`.
  The minimum is the smallest size where every section still lays out; the minimum *size* is the
  outer window. Below the content height the section body scrolls (`overflow-y-auto`). Below about
  620px wide, rows that put a label beside wide content must stack instead (see the theme row
  below).
- **Same chrome as the main window.** On macOS the titlebar is hidden and the traffic lights are at
  `{ x: 19, y: 17 }` over the sidebar's empty 48px top row. On Windows, call **`win.setMenu(null)`**:
  a window with no menu gets MōBrowser's default browser-flavored menu bar.
- **Same renderer, its own route.** Load `${app.url}#/settings/<section>`. `App.tsx` picks the
  screen by `useRoute().segments[0]`. Mount data providers (stores, databases) **only** for the main
  screen, so the Settings window doesn't open the app's data a second time.
- **Use the same navigation guard** (`openPopup`/`navigation` handlers) as the main window.
- If the app quits when its main window closes, close Settings too.

## Renderer layout

- `SidebarProvider` with `Sidebar collapsible="none"` and `--sidebar-width: 12.5rem`. The window is
  below the 768px mobile breakpoint, so an `offcanvas` sidebar would turn into an overlay sheet.
- **Respond to the window, not the viewport breakpoints.** Make the card content a container
  (`SettingsSectionContent className="@container"`) and stack wide rows with container variants,
  e.g. the theme row's `@max-[22rem]:flex-col`, so the label goes above the cards when the card is
  narrow. `md:`/`lg:` don't help: the whole window is below them.
- On macOS, an empty `SidebarHeader className="app-drag-region h-12"` holds the traffic lights.
- Section links are `SidebarMenuButton isActive render={<Link to="/settings/<id>" />}`.
- On the right: a `h-12` `app-drag-region` header with `SettingsPageTitle`, then a scrolling body
  with the kit's `SettingsPage` / `SettingsSection*`. Section headings sit outside the cards, and
  rows are `Field orientation="horizontal"`.
- **Sections:**
  - **General:** Launch at login, Show window at startup, Check for updates automatically (each a
    `Switch`), then Appearance → Theme.
  - **Import & Export:** whatever the app can import or export.
  - **About:** a centered app icon (`assets/app.png`, 96px), name, `Version x.y.z (Apple Silicon)`,
    Check for Updates…, then the description and copyright.

## Where each setting lives

| Setting | Stored by | API |
| --- | --- | --- |
| Theme | renderer `localStorage` (`ThemeProvider`) + `AppService.SetTheme` → `app.setTheme` | The windows share `localStorage`; `ThemeProvider` listens for the `storage` event so the other window follows. |
| Launch at login | the OS | `app.loginItemSettings.openAtLogin` / `app.setLoginItemSettings({ openAtLogin })`. Read it back from the OS; don't mirror it in prefs. |
| Show window at startup | main `prefs` (`getBoolean(key, true)`, then `persist()`) | Read before the first `win.show()`. **macOS only:** with the window hidden, the app reopens through `app.on('activated')` (Dock click), and Windows/Linux have no such event. Hide the row there and ignore the pref. |
| Check for updates automatically | main `prefs` | Only when an update server is configured (below). Check a few seconds after launch, not during it. |

The main process owns everything it needs **before a window loads**: use `prefs`, not
`localStorage`. Each setter RPC returns the full `Settings` message so the UI re-renders from the
source of truth.

> **Trap: `app.updateServerUrl` isn't readable at runtime.** The API has no such property. Bake it in
> at build time: in `vite.config.ts`'s main config, add
> `define: { __UPDATE_SERVER_URL__: JSON.stringify(<conf.app.updateServerUrl>) }`, and declare it
> in `src/main/env.d.ts`. When it's empty, **hide** the update switch and the Check for Updates
> button. Don't show controls that can't work. When it's set, add the `'checkForUpdates'` menu role
> (app menu on macOS, Help on Windows). The background check and the About button use
> `app.checkForUpdate(url)` → `download()` → `app.restart()`, with native dialogs.

## Actions that need the main window's data

The Settings window has no data store, so Import/Export (and similar) **run in the main window**.
Add a `MenuService.Dispatch(MenuCommand)` RPC that shows and focuses the main window and emits the
command on the existing menu-command stream. The main window's command handler then runs it, the
file dialog opens there, and the result toast appears where the data changed.

## Menu wiring

- macOS app menu: `About <App>` → `openSettings('about')`, the `'checkForUpdates'` role (if
  configured), separator, `Settings…` with `shortcut: 'CommandOrControl+,'` →
  `openSettings('general')`.
- Windows: `Settings…` in **File**, and `About <App>` in **Help**.
- Linux has no menu bar, so handle ⌘/Ctrl+, in the page's keyboard handler.
- Remove any appearance/theme items from the View menu and other menus. The theme lives in Settings
  only.

## Verify

- Open Settings from the real menu, using desktop control or by asking the user. Then
  `agent list-windows` and **`agent select-window --url "#/settings"`**. Select by URL, never by
  index: the index order changes between launches.
- Click every section and every control. Pick Dark and check both windows'
  `document.documentElement.className`. Use the arrow keys in the theme group and check the focus
  ring. Read the switches back after toggling them.
- **Don't toggle Launch at login while testing.** It registers a real login item on the user's
  machine. Restore every setting you change.
- Resize: drag the window's corner far past the minimum, using desktop control, and confirm
  `app_list_windows` reports exactly the minimum. Then, in every section at that size, check that
  nothing scrolls horizontally (`document.documentElement.scrollWidth <= innerWidth`), rows wrap
  rather than clip, and the theme row has stacked. Screenshot it. Desktop control's accessibility
  "press" on a page link may not reach the page, so navigate with `agent click` or by setting
  `location.hash`.
- Show window at startup: turn it off, restart, and check that the window isn't on screen. Then run
  `open <path>/build/bin/<App>.app` and check that it appears. With several displays, a window
  centered at a negative x is on another display, not off-screen. Check `screen.availLeft`
  before you "fix" it.
- e2e: the fixture can't open a second window, but the Settings screen is a route. Set
  `location.hash = "#/settings/general"` in the first window and test it there (see
  `test/e2e/settings.test.ts`).
