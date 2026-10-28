# Tray, Dock & activation policy

Source of truth: `node_modules/@mobrowser/api/docs/guides/guides/tray.md`, `dock.md`, and `app.md`.
This is what makes an app a *foreground app*, a *menubar/background app*, or a *tray-resident* app —
decide it from the archetype, not by default.

## Activation policy

- **Foreground app (default).** Dock icon, menubar, a window on launch. Most apps.
- **Background / menubar app.** No Dock icon, lives in the tray. Call `dock.hide()` (macOS) — this
  also hides the app's menu bar. Show the window on demand (tray click), not at launch.

```ts
import { dock } from '@mobrowser/api'
dock.hide() // macOS: background/menubar app — no Dock icon
```

## Tray

Use a **template image** on macOS (`imageTemplate.png` + `@2x`) so it adapts to light/dark menu bars.
Put images in `resources/` and resolve with `app.getPath('appResources')`.

```ts
import { app, Tray, Menu, MenuItem } from '@mobrowser/api'

const tray = new Tray({ imagePath: app.getPath('appResources') + '/trayTemplate.png' })
tray.setTooltip(app.name)
tray.setMenu(new Menu({
  items: [
    new MenuItem({ id: 'open', label: `Open ${app.name}`, action: () => win.show() }),
    'separator',
    new MenuItem({ id: 'quit', label: 'Quit', shortcut: 'CommandOrControl+Q', action: () => app.quit() }),
  ],
}))
// Left click opens the app; right click opens the menu.
tray.on('mouseDown', (button) => {
  if (button === 'secondary') tray.openMenu()
  else win.show()
})
```

## Lifecycle

- **Single-instance** is on by default; a second launch focuses the running instance.
- **Quit behavior.** A tray-resident app should *not* quit when its window closes — hide the window
  and keep the tray alive; quit only from the tray/menu `app.quit()`. A normal app can quit on last
  window close. Decide this deliberately for the archetype.
- **Deep links.** If the app registers `schemes` in `mobrowser.conf.json`, install
  `app.handle('openUrl', …)` at startup and treat incoming URLs as untrusted.
