# Verifying the native shell

The agent automation drives the **renderer only**. It cannot see native chrome (titlebar, traffic
lights, menu bar, tray, Dock) and cannot click native menus. So `tsc` passing and `agent screenshot`
looking fine do **not** prove the shell is right. Verify deliberately.

## 1. Rebuild — main-process changes don't hot-reload

The renderer hot-reloads under Vite, but `src/main` changes need a rebuild:

- `npm run dev:build` then `npm run mobrowser -- agent launch`, or
- restart `npm run dev` / `npm run dev -- --automation`.

If you edit `src/main` and only see the renderer update, you're looking at stale native config.

## 2. Read the window shape back (scriptable)

Confirm the window is the size/shape you intended, not the default:

```bash
npm run mobrowser -- agent eval "({ outer: [outerWidth, outerHeight], inner: [innerWidth, innerHeight], screen: [screen.width, screen.height] })"
```

- Outer size ≈ your `setSize` (± chrome). `~900×700` is MōBrowser's built-in default — seeing it means
  your `setSize` never ran (rebuild) or is being overridden. `~1300×900` is what this project's
  `src/main/index.ts` sets, so it means the file wasn't changed for the archetype you intended.
- **If a reference image was given, compute the running window's aspect ratio and compare it to the
  reference's.** Portrait must stay portrait; the ratio should roughly match. A ~380×700 reference
  (ratio ≈ 0.55) rendered as a 760×880 window (ratio ≈ 0.86, landscape) is a **mismatch** — you sized
  to your layout, not the reference. Re-`setSize` to the reference's proportions.
- Shrink the window toward `setMinimumSize` and confirm the renderer still lays out (no overflow,
  clipping, or broken columns) at the minimum.

## 3. Confirm what the renderer can't see

Traffic lights, the menu bar, tray, and Dock are **native, not DOM** — not in `agent screenshot`:

- **Traffic lights / drag / keep-out**: use the DOM checks in the shadcn
  [app-window.md](../../shadcn/rules/app-window.md) verification section (keep-out box, computed
  `-webkit-app-region`).
- **Menu, tray, Dock**: take or request an **OS-level** window screenshot and inspect manually. For
  the menu, also walk it by hand: open **Edit** and confirm Copy/Paste work in a renderer text field
  (a missing `editMenu` breaks ⌘C/⌘V silently), and confirm reload/DevTools are present in a dev run
  and absent from a packaged build (`npm run build`).
- **No dead menu items.** The agent can't click native menus, so check them statically. Run:

  ```bash
  grep -rnE "action: *\([^)]*\) *=> *\{ *\}" src/main
  ```

  The command must print nothing. In particular, confirm the `About <App>` action opens Settings on
  its About page (`openSettings('about')`). Then open About from the real menu. If you have
  desktop control, use it; otherwise ask the user to click **About** on each platform you configured
  (the app menu on macOS, Help on Windows). Confirm the page shows the **app icon** (the same one
  as the Dock) and the right name and version, in light and dark mode. `agent eval` in the Settings
  window (`agent select-window --url "#/settings"`; never by index, since the order changes between
  launches) can read it back: the `main` text, and the icon's `naturalWidth` (0 means a broken
  image).

  > **Trap: never hand a dialog check to the user in an automation-mode app.** Under
  > `npm run dev -- --automation` or `agent launch`, MōBrowser **intercepts** native dialogs
  > (`showMessageDialog`, open/save pickers). They're recorded in `agent dialogs` but never shown,
  > so a working confirmation or file picker looks broken to the user. (The renderer-drawn About
  > page isn't affected.) Before asking the user to try anything that opens a native dialog, stop
  > the automation app and start a normal one with `npm run dev`. Say which mode the app is in when you hand it over. An entry in
  > `agent dialogs` after the click shows the action ran, but it isn't a substitute for the user
  > seeing the dialog.
- **Menu enablement follows focus and dialogs.** This can't be read from the native menu, so read
  what the renderer reports. Temporarily log the `MenuState` it sends, then remove the log. Drive
  each state and check the reported flags: a note selected in the list (Format disabled), the caret
  in the note body (enabled), the title or search field (disabled), focus on a toolbar button
  (disabled), a dialog open (`modal`, every command disabled) and closed again. See
  [menu.md](./menu.md#enablement--enabled-only-when-it-would-act). The menu reads the flags
  directly, so checking them covers the native items.

  > **Trap: `agent launch` uses the real profile.** A verification click that edits content, such as
  > a toolbar format button with the caret in a note, changes the user's real notes. Exercise
  > editing commands in the e2e suite (fresh profile), or on a note you created for the check.
- **State the shell and confirm with the user.** After building/changing an app, briefly report the
  shell you chose (archetype, window size + resizable, decorations, menu, tray/Dock) and — when a
  reference image implied a shape — ask the user to confirm it matches intent. This is the backstop
  for everything the agent can't observe itself.

## Checklist

```
- [ ] Rebuilt main process (not just the renderer)
- [ ] Window outer size matches setSize (not the default)
- [ ] If a reference image was given, the window's orientation + aspect ratio match it
- [ ] Renderer lays out down to setMinimumSize
- [ ] Decorations match the archetype (titlebar/frameless; traffic lights centered on the toolbar)
- [ ] Menu is app-appropriate (Edit menu present if there are inputs; reload/DevTools dev-only)
- [ ] About opens Settings → About with the app icon, app.name + app.version (macOS app menu; Help on Windows)
- [ ] Settings… (⌘,) opens one Settings window that resizes down to its minimum without breaking; every section and control works ([settings-window.md](./settings-window.md#verify))
- [ ] Handed the app to the user via plain `npm run dev`, not an automation launch (dialogs are intercepted there)
- [ ] No menu item has an empty `action` (grep above prints nothing)
- [ ] Every renderer-driven item is enabled only when its command would act: its state uses the handler's own guard (focus, selection, dialog)
- [ ] Tray/Dock/activation match the archetype (background app hides Dock, shows on tray click)
- [ ] Reported the chosen shell and confirmed with the user when a reference implied one
```
