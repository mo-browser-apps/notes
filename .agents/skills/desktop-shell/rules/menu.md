# Application menu

Source of truth: `node_modules/@mobrowser/api/docs/guides/guides/app-menu.md`. The default menu is
**browser-flavored** (File → Close Window, View → Back/Forward/Reload, a Developer menu). Replace it
with a menu that fits the app; keep only what the app actually needs.

**This project's implementation is `src/main/menu.ts`** (`installAppMenu(win)`, called from
`src/main/index.ts`). Extend that rather than building a menu inline.

## Rules of thumb

- **Keep an `editMenu` wherever there are text inputs** (search fields, forms) — it wires up
  Undo/Cut/Copy/Paste/Select-All and their ⌘ shortcuts for free. Dropping it silently breaks
  copy/paste in your inputs.
- **Drop browser chrome that doesn't apply** — Back/Forward/Stop, Save Page As, View Source for an
  app that isn't a browser.
- **Gate reload / DevTools to development** with `!app.packaged`, so end users don't get them but you
  keep them while building.
- **Custom items need a real `action`** — no dead menu items. Every `new MenuItem({...})` must do
  something visible when clicked: `About` opens Settings → About (see below), `Settings…` opens the
  Settings window, and so on. If a command isn't implemented yet, leave the item out. Don't ship it
  with an empty `action`.
- **Enabled means "choosing this acts now".** Every item's enabled state comes from the app's
  current state (selection, focus, open dialogs, loaded data). It is never left at the default
  `true`. **Adding an item? Follow [Adding a menu item](#adding-a-menu-item).** See
  [Enablement](#enablement--enabled-only-when-it-would-act) for why.
- **Every app has a working About item and a Settings… item.** See
  [About](#about--required-never-a-dead-item) and [settings-window.md](./settings-window.md).
- **Two different APIs per platform.** On **macOS** the menu belongs to the *application*:
  `app.setMenu(menu)`. On **Windows** each window owns its own menu bar: `win.setMenu(menu)` (and
  `win.setMenu(null)` removes it). **Linux has no menu bar** — skip it. So gate on the platform, but
  don't simply drop Windows: a `darwin`-only guard leaves Windows users with the default
  browser-flavored menu bar.
- **`macAppMenu` is macOS-only.** The `'macAppMenu'` role and the `'macHideApp'`/`'macHideOthers'`/
  `'macShowAll'`/`'quit'` item roles belong in the macOS menu only — don't put them in a Windows
  window menu.

## Adding a menu item

A new item isn't finished when it shows up in the menu and runs from a click. Its enabled state is
part of the feature. Do every step:

1. **Write down when the command can act.** List every state where choosing it would do nothing: no
   note selected, empty list, focus in the wrong place (list, title, search field), nothing
   selected, a dialog open, data still loading, wrong mode (Preview vs Edit). If that list is empty,
   say so in a comment: the item is always enabled on purpose, like About and Settings….
2. **Put that condition in one function** in the renderer, next to the command handler in
   `src/renderer/components/notes/app-commands.tsx`, for example `formatTarget()` or `dialogOpen()`.
   The handler calls it and returns early when it says no.
3. **Report it to the menu.** If no existing `MenuState` field matches, add one to
   `src/renderer/proto/menu.proto` and run `npm run gen`. Fill it in `AppCommands` by calling the
   same function from step 2, never a second, looser condition. State that isn't React state
   (focus, the DOM) needs a re-render trigger; `useFocusContext()` is the example.
4. **Create the item disabled** (`command(...)` in `src/main/menu.ts` already passes
   `enabled: false`), and enable it in `AppMenu.update()` from the reported field. Also combine
   `live` (`ready && !modal`) unless the command works behind dialogs.
5. **If the label or check mark depends on state** (Show/Hide Sidebar, Sort ▸ choices), set it in
   `update()` too.
6. **Verify each state from step 1**, as described in
   [verification.md](./verification.md#3-confirm-what-the-renderer-cant-see). Drive the app into the
   state, check the reported flag, then check that the item acts when enabled.

> **Trap: the default is `enabled: true`.** `new MenuItem({...})` and `new CheckboxMenuItem({...})`
> are enabled unless told otherwise. An item added without steps 1–4 compiles, appears, responds
> to clicks, and passes every test that only clicks it in the happy state. It's still wrong in
> every other state.

## Enablement — enabled only when it would act

An enabled menu item promises that choosing it now, given what's selected and where the focus is,
does something. An item that is enabled but gets ignored is a dead item for that moment. Users can't
tell it apart from a broken app. An example of the bug: a note is selected in the list, Format ▸
Bold is enabled, and choosing it does nothing because no text has focus.

Custom items hand their command to the renderer (`dispatch`). The renderer's handler then decides
whether to act, and it often bails out: no selection, focus in the wrong place, a dialog open. **The
menu has to report those same conditions**, or it promises actions the handler throws away:

- **One predicate per guard, shared by the handler and the reported state.** Put each bail-out
  condition in a function, such as `formatTarget()` and `dialogOpen()` in
  `src/renderer/components/notes/app-commands.tsx`. The command handler calls it to decide whether
  to act. The `MenuState` the renderer sends calls the same function to decide what to enable. Never
  write a second, looser condition for the menu: that drift is how this bug happens. A
  `ready && hasNote && editing` check enabled Format while the handler also required focus in the
  note body.
- **Focus-dependent commands follow focus.** Commands that act at the caret (formatting, Insert
  Link) are enabled only while the editor that receives them has focus. They are disabled when focus
  is in a list, the title field, the search field, a toolbar button, or nothing, because there's no
  caret to show where the change would land. Focus is DOM state, not React state, so recompute the
  report on `focusin`/`focusout` (deferred one frame, so focus can settle).
- **A dialog disables every command it blocks.** If the handler ignores commands while a dialog is
  open, report `modal` and disable those items. Watch dialogs opening and closing with a
  `MutationObserver` on `data-open`/`data-closed`: focus events alone miss a dialog whose return
  focus target was removed.
- **Checkbox and radio items too.** A Sort ▸ choice that a dialog would block gets disabled like any
  other command (`CheckboxMenuItem` takes `enabled`).
- **Start disabled.** Create renderer-driven items with `enabled: false` and let the first state
  report enable them, so nothing is live before the renderer has loaded.
- **The exceptions are items the main process handles itself.** About and Settings… call
  `openSettings` directly and work in every renderer state, so they're always enabled. Native role
  items (`'copy'`, `'undo'`, …) get their enablement from the OS and Chromium.

A caret with an empty selection still counts as "would act" for inline formatting. Bold with a
caret inserts `****` and puts the caret between the markers, ready for typing, as TextEdit and
Notes do. Disable on focus, not on selection.

## About — required, never a dead item

Users click **About** to check which version they're running. If it does nothing, they assume the
app is broken. This bug keeps coming back, for a predictable reason:

> **Trap: don't copy the About item from `app-menu.md`.** The vendored guide's sample has
> `action: (item: MenuItem) => {}`. That is an **empty placeholder**, not a working item. Copying it
> ships an About item that compiles, shows up in the menu, and does nothing when clicked. Replace the
> empty body with a real dialog every time.

> **Trap: `app.showMessageDialog` can't show the app icon.** MōBrowser draws message dialogs as
> its own window-modal panel. With any `type`, or with none, that panel has **no icon**, and
> `MessageDialogOptions` has no icon field. An About built on it shows text only, which users read
> as unfinished. So About is drawn in the **renderer**, where you control the icon.

**About is a page of the Settings window.** `About <App>` opens Settings on its About section
(`openSettings('about')`), and **Settings…** (⌘,) opens it on General. One window holds all the
app-level information. See [settings-window.md](./settings-window.md) for the window, its sections
and the About page's layout.

What the About page must show (the content rules don't change with where it's drawn):

- **The app icon, name and version**, plus the description and copyright when they're non-empty.
- **Use the bundle's icon file. Never redraw or substitute it.** Import the PNG the app bundle is
  built from (`assets/app.png`, the source of `app.icns`/`app.ico`) so About matches the Dock and
  taskbar. A lucide icon or `public/logo.svg` is not the app icon. Importing a `.png` needs
  `src/renderer/vite-env.d.ts` with `/// <reference types="vite/client" />`.
- **Read the text from `app.*` in the main process. Never hardcode it.** Return `app.name`,
  `app.version`, `app.description` and `app.copyright` (all from `mobrowser.conf.json`) through an
  IPC call such as `AppService.GetAppInfo`. Never write a literal `'1.0.0'`.
- **Keep About and Settings… always enabled.** They must work before data loads and on error
  screens, so they call `openSettings` in the main process directly rather than going through a
  renderer command.
- **Reachable on every platform.** On macOS, About and Settings… go in `macAppMenu`. On Windows,
  `macAppMenu` doesn't exist, so put Settings… in **File** and About in a **Help** menu. A mac-only
  About leaves Windows users without one.

## Pattern

The full, working version is `src/main/menu.ts` — **read it and extend it** instead of writing a new
one. Its shape:

```ts
import { app, BrowserWindow, Menu, MenuItem, MenuOptions, MenuWithRole } from '@mobrowser/api'

export function installAppMenu(win: BrowserWindow, dispatch: MenuDispatch): void {
  // Always enabled, handled in the main process: see settings-window.md.
  const about = new MenuItem({ id: 'about', label: `About ${app.name}`, action: () => openSettings('about') })
  const settings = new MenuItem({
    id: 'settings', label: 'Settings…', shortcut: 'CommandOrControl+,', action: () => openSettings('general'),
  })
  if (process.platform === 'darwin') {
    // macOS: the menu belongs to the application.
    app.setMenu(new Menu({ items: [macAppMenu(about, settings), fileMenu(), editMenu(), viewMenu(), windowMenu()] }))
  } else if (process.platform === 'win32') {
    // Windows: each window owns its menu bar — no macAppMenu/windowMenu: Settings… in File, About in Help.
    win.setMenu(new Menu({ items: [fileMenu(settings), editMenu(), viewMenu(), helpMenu(about)] }))
  }
}

function macAppMenu(about: MenuItem, settings: MenuItem): MenuWithRole {
  return new MenuWithRole({
    role: 'macAppMenu',
    items: [about, 'separator', settings, 'separator', 'macHideApp', 'macHideOthers', 'macShowAll', 'separator', 'quit'],
  })
}

function helpMenu(about: MenuItem): Menu {
  // A plain labelled menu, as in the guide's Windows example.
  return new Menu({ label: 'Help', items: [about] })
}

function viewMenu(): Menu {
  // Zoom and full screen ship to users; only reload/DevTools are development-gated.
  const items: MenuOptions['items'] = ['zoomReset', 'zoomIn', 'zoomOut', 'separator', 'fullScreen']
  if (!app.packaged) items.push('separator', 'reload', 'reloadBypassCache', 'devTools')
  return new Menu({ label: 'View', items })
}
```

The sketch leaves out the app's own commands. In `src/main/menu.ts` they're built with
`command(...)` (disabled until the renderer reports its state) and enabled in `AppMenu.update()`.
See [Adding a menu item](#adding-a-menu-item).

> **Don't dev-gate the whole View menu.** Zoom and Enter Full Screen are ordinary app features users
> expect in a release build; only reload, reload-bypassing-cache, DevTools and View Source belong
> behind `!app.packaged`.

Standard role strings (`'undo'`, `'reload'`, `'fullScreen'`, `'macHideApp'`, …) are enumerated in
`app-menu.md` and typed as `MenuRole` / `MenuItemRole` in
`node_modules/@mobrowser/api/mobrowser.d.ts`. Use the exact strings from that table — don't guess.
Note there is **no `'closeWindow'` equivalent in the Window menu** (only `'minimizeWindow'` and
`'maximizeWindow'`), so keep a File menu with `'closeWindow'` if you want ⌘W.
