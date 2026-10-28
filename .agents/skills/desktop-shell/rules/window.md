# Window: size, constraints, decorations

Source of truth: `node_modules/@mobrowser/api/docs/guides/guides/app-windows.md` and
`docs/api/classes/AbstractWindow.md`. Configure the window in `src/main/index.ts`.

## Size & constraints

MōBrowser's default is `900×700`, centered (this project's scaffold overrides it to `1300×900`).
**Set an intentional size and a minimum** so the renderer layout can't be squeezed until it breaks.

```ts
const win = new BrowserWindow()
win.browser.loadUrl(app.url)
win.setSize({ width: 760, height: 880 })         // match the archetype, not whatever was scaffolded
win.setMinimumSize({ width: 460, height: 600 })  // smallest size the renderer still lays out at
win.setResizable(true)                           // false for fixed popovers/HUDs
win.centerWindow()
win.show()
```

`setMinimumSize` constrains the **content** area; the OS adds titlebar and borders on top.

- **Compact utility** (activity monitor, calculator): small `setSize`, resizable with a tight
  `setMinimumSize`.
- **Menubar popover / HUD**: small, `setResizable(false)`, usually `setAlwaysOnTop(true)`, and often
  no window shown at launch (see tray-and-activation.md).
- Pick the minimum by shrinking the running window until the renderer breaks; set it just above that.

### Match a reference image's proportions

If the user gave a reference/mockup, its **shape is part of the spec** — the window must end up with
the same orientation and roughly the same aspect ratio, not just "small".

1. Estimate the reference's `width×height` (or at least portrait/landscape + the width:height ratio).
2. `setSize` to that ratio at a sensible point size — a ~380×700 reference (portrait, ratio ≈ 0.55) ⇒
   e.g. `{ width: 400, height: 760 }`, **not** a landscape `760×880`.
3. `setMinimumSize` **≤ the reference width** — a minimum wider than the target makes the reference
   shape unreachable.
4. If the renderer was built wider than the reference (`max-w-*`, multi-column, fixed-width columns),
   **narrow the renderer** so it lays out cleanly at the reference width. The window follows the
   reference; the renderer follows the window.

```ts
// Reference is a tall, narrow panel (~380×700) → portrait window, min width below 380.
win.setSize({ width: 400, height: 760 })
win.setMinimumSize({ width: 340, height: 560 })
```

Verify by comparing the running window's aspect ratio to the reference's (see verification.md) — if
the reference is portrait and your window is landscape, you sized to your layout, not the reference.

## Decorations & macOS traffic lights (two halves — keep in sync)

On macOS the app hides the native titlebar, so web content fills the window **under** the traffic
lights. There are two halves and **both** must agree:

1. **Main process (this file).** Titlebar visibility, and the traffic-light **position** (center the
   ~14px cluster on the top toolbar: `y = (toolbarHeight − 14) / 2`) and **visibility**.

```ts
win.setWindowTitleVisible(false)
win.setWindowTitlebarVisible(process.platform !== 'darwin') // native bar on win/linux, frameless on mac
if (process.platform === 'darwin') {
  win.setWindowButtonPosition({ x: 19, y: 17 })   // (48 − 14) / 2 = 17 → centered on a 48px (h-12) toolbar
  // Hide minimize/zoom for a fixed panel: win.setWindowButtonVisible('minimize', false) etc.
  // Reset to the OS default with: win.setWindowButtonPosition(null)
}
```

2. **Renderer CSS.** The inset variables (`--titlebar-inset`, `--titlebar-traffic-width`) and the
   `.app-drag-region` / `no-drag` setup are owned by the **shadcn** rule
   [app-window.md](../../shadcn/rules/app-window.md). **Don't duplicate that here** — but when you
   change the toolbar height or button position above, update those CSS variables to match. They are a
   matched set.

## Special surfaces

For HUDs, overlays, and popovers (all in `app-windows.md`):

```ts
win.setAlwaysOnTop(true)          // stays above other windows
win.setVibrancyEffect('popover')  // macOS translucent background
win.setHasShadow(false)           // macOS
win.setTransparentBackground(true)// show only page content (hide title/titlebar/buttons too)
win.setScreenCaptureProtectionEnabled(true) // exclude sensitive windows from capture
```

Use these deliberately — an always-on-top or transparent window is wrong for a normal app.
