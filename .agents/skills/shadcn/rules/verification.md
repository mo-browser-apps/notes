# Verification Coverage & Crash Safety (delivery gate)

The single most damaging defect is a control that **crashes the app** (white screen, error overlay,
thrown exception) when clicked. It always passes `tsc`, and it slips through because verification only
touched the happy path — e.g. the sidebar user-profile button was never actually clicked.

**Before delivering any UI, exercise EVERY interactive control at least once and confirm nothing
crashes and the console stays clean.** This is a gate, not a suggestion: a UI with an untested control
is not "done." You have full automation tooling (MōBrowser `agent` commands) — there is no excuse for
shipping an unclicked control.

## The rule

1. **Enumerate every interactive control.** Run `agent snapshot` and list everything a user can
   activate: buttons, icon buttons, menu triggers and every menu item, tabs, links, table row actions,
   switches/checkboxes/radios, sliders, avatars, sidebar items, the profile/account button, "more"
   (`⋯`) menus, pagination, close/dismiss buttons, popovers, tooltips-on-focus, drag handles, etc.
   Nested/opened surfaces count too: open each menu/dialog/popover, then enumerate and exercise the
   controls *inside* it. While a menu is open, confirm every item is a **single line** — a wrapped
   label is a defect (see [composition.md](./composition.md#menu-item-labels-stay-on-one-line)).
2. **Activate each one and observe the result.** `agent click --ref …` (or `press-key`) every control.
   For toggles, flip and flip back. For destructive actions, confirm the confirm dialog appears (you
   don't have to complete the deletion, but verify the path opens without error).
   - **Clicking isn't the only activation.** A `NativeSelect` needs `agent select-option`, and
     hover-only surfaces (`Tooltip`, `HoverCard`, row hover actions) need `agent hover` — a control
     you can only reach by hovering is just as capable of crashing, and clicking never reaches it.
   - **Every overlay must be *dismissible* — open it AND close it, then confirm it stays closed.** For
     each menu/dialog/popover/sheet/command palette: open it, then close it via **Escape** and again via
     **outside-click**, and verify it actually went away and **did not reopen**. An overlay you can open
     but not close (classically, one opened from a trigger's `onFocus`, which reopens on focus-return)
     traps the user and makes the app unusable — treat it as severe as a crash. See
     [interaction.md](./interaction.md#overlays-esc--outside-click-close-focus-trapped-and-returned).
3. **After every interaction, check for a crash.** A crash = any of: an error overlay / blank or white
   screen, the view unmounting unexpectedly, an uncaught exception, or an unhandled promise rejection.
   Check it explicitly, in this order:
   - `agent eval "document.querySelector('#root')?.childElementCount"` — **the check that actually
     catches crashes.** A render error unmounts React to an empty `#root` (`0`); anything above `0`
     means the app is still mounted.
   - **The error log you installed** (see [Catch what `agent console` can't see](#catch-what-agent-console-cant-see))
     — uncaught exceptions and unhandled rejections: `Cannot read properties of undefined`,
     `X is not a function`, missing-provider errors, a `navigator.clipboard` rejection.
   - `agent console` — `console.error`/`warn` calls (React warnings, your own logging). **Any red
     console error is a defect**, even if the UI still looks fine — but an empty console is **not**
     evidence of no crash.
   - `agent snapshot` / `agent screenshot` — confirm the app is still rendered and interactive, not a
     blank page or error screen.
4. **Track coverage.** Keep a quick checklist of every control and tick it off as you exercise it, so
   nothing is skipped. Report which controls you exercised.
5. **Nothing ships with a known crash or console error.** If a control crashes, fix it (or, if out of
   scope, flag it explicitly to the requester) — never report the UI as working while a control throws.

## Do it in a clean session

Crashes often log once at mount or on the first interaction, so read the console **from a freshly
launched app** — `agent console` prints everything captured for the current app session and has no
`--clear` flag. To get a clean baseline, relaunch:

```bash
npm run mobrowser -- agent stop && npm run mobrowser -- agent launch
npm run mobrowser -- agent console    # baseline: should be [] before you touch anything
# … click through every control …
npm run mobrowser -- agent console    # inspect for error-level entries
```

**A launch-time error counts.** An empty baseline is part of the gate — a 404, a failed import, or a
React warning at mount is a defect even though no one clicked anything.

## Catch what `agent console` can't see

**`agent console` only records `console.*` calls. Uncaught exceptions and unhandled promise
rejections never reach it** — measured here: `console.error('a')`, a `throw` inside `setTimeout`, and a
bare `Promise.reject()` produced exactly one entry, the `console.error`. A React render crash in the
production bundle is reported through the global error event, not `console.error`, so a command
palette that blanked the whole window left `agent console` at `{"messages": []}`. Reading only the
console, that crash passes the gate.

Install a listener right after every launch **and after every `location.reload()`** (a reload
discards it), then read it back alongside the console:

```bash
npm run mobrowser -- agent eval "(() => {
  if (window.__errors) return 'already armed';
  window.__errors = [];
  addEventListener('error', (e) => window.__errors.push('error: ' + e.message));
  addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + (e.reason?.message ?? e.reason)));
  return 'armed';
})()"
# … exercise controls …
npm run mobrowser -- agent eval "JSON.stringify({ root: document.querySelector('#root')?.childElementCount, errors: window.__errors })"
```

The pass condition is `root > 0` **and** `errors: []` **and** no `error` entries in `agent console`.
An exception thrown before you armed the listener (at mount) is still invisible to it — that's what the
`#root` check and a screenshot of the fresh launch are for.

**`agent eval` runs in one persistent global scope.** A top-level `const el = …` in one call makes the
next call that declares `el` fail with `SyntaxError: Identifier 'el' has already been declared` — and
if you discarded the output, it looks like a control that did nothing. Wrap every script in an IIFE,
`(() => { … })()`, as above.

## Make the automation trustworthy first

Every check above silently lies in the following situations — all measured in this repo. Rule them out
before believing a pass *or* a failure.

- **The window is behind other windows.** Chromium marks an occluded window
  `document.visibilityState === "hidden"`, pauses `requestAnimationFrame`, and Base UI's enter/exit
  transitions never finish: a closed dialog stays in the DOM (`data-closed` + `data-ending-style`),
  menus don't open on click, and `!!document.querySelector('[role=dialog]')` says "still open" after a
  working Escape. Check `agent eval "document.visibilityState"` before interpreting overlay state, and
  launch with `npm run mobrowser -- agent launch -- --disable-backgrounding-occluded-windows
  --disable-renderer-backgrounding --disable-background-timer-throttling` — and re-check after any
  `location.reload()`, which was observed reporting `hidden` again. On macOS you can also bring the
  window forward:
  `osascript -e 'tell application "System Events" to set frontmost of process "<AppName>" to true'`.
- **`agent screenshot` captures stale frames of a covered window** — the pixels can be several
  navigations old while `agent eval` reports the new screen. Bring the window frontmost before
  screenshots, and cross-check the `h1` with `agent eval` when a screenshot looks unchanged.
- **`agent launch` serves the bundle that existed at launch.** After a new `npm run dev:build`, a
  `location.reload()` (or `agent eval "location.reload()"`) still shows the *old* code — you'll
  "verify" a fix that isn't loaded, or chase a bug you already fixed. **Relaunch** after every
  `dev:build` (or use `npm run dev -- --automation`, whose renderer hot-reloads). Cross-check with a
  marker: `agent eval "document.querySelector('[data-slot=…]') !== null"` for the component you just
  added.
- **Query open overlays with `:not([data-closed])`** (`[role=dialog]:not([data-closed])`), never the
  bare role — a closing overlay is still in the DOM for its exit animation.
- **An open Base UI menu eats the next click.** Menus are modal: a click anywhere outside only closes
  the menu, so the *next* test's click does nothing and looks like a dead control. Confirm
  `document.querySelectorAll('[role=menu]').length === 0` before each click, and remember
  `agent press-key --key Escape` only reaches a menu that has focus.
- **Don't discard command output while scripting.** `agent click`/`type` on a selector that matches
  nothing prints an error — but piping it to `/dev/null` in a loop turns it into a "control that did
  nothing". And "the first `input`" on a page is often a `Select`'s internal `…-hidden-input`, which
  accepts `agent fill` and changes nothing visible. Target inputs by their label
  (`[...document.querySelectorAll('label')].find(l => l.textContent.trim() === 'Store name').htmlFor`)
  and read the result back with `agent eval` after every action.

### Crawling every control

With hundreds of controls, click them from inside the page: one `agent eval` that starts an async
crawl and stores its report on `window` (poll it — a long `eval` times out), iterating visible
`button`, `[role=tab]`, `[role=switch]`, `[role=checkbox]`, `[role=combobox]` and in-app links,
clicking each, recording `window.__errors` (above — the console misses exceptions), unmounts, opened overlays (menu items that wrap, dialogs
taller than the window), then dispatching Escape and returning to the route. Two traps:

- **The crawler edits data.** It toggles switches and clicks Save, so later screenshots show mutated
  state — reload the app before visual review.
- **The unsaved-changes guard traps it.** Once a crawl dirties an editor, "Leave without saving?"
  blocks every later navigation and the crawl silently keeps clicking the same screen under a new
  route name. Detect the guard and choose **Discard**, and assert `location.hash` matches the route
  you meant to test before each click.

## Common crash sources to probe for

These are the usual culprits behind an on-click crash — click the controls that touch them:

- **Undefined/missing data.** A row/menu built from data that can be `undefined`, empty, or missing a
  field (e.g. a user with no avatar/name). Click the control that renders it.
- **Missing provider/context.** A component using a context whose provider isn't mounted (Tooltip,
  Theme, Sidebar, a Query/Store provider) throws on open. The profile/account button is a frequent
  offender because it pulls user/session context.
- **Null refs / not-yet-loaded state.** Acting before data resolves.
- **Bad handler wiring.** `onClick={doThing()}` (called immediately) instead of `onClick={doThing}`, or
  a handler referencing an undefined function.
- **Navigation to a route/view that isn't implemented** — clicking it renders nothing or throws.

## Report format

When done, state coverage explicitly, e.g.: "Exercised all N controls (sidebar: Overview/Projects/…,
**profile button**, ⋯ row menus, tab switches, filter clear, dialog open/close). `#root` still mounted,
no uncaught exceptions or rejections, no console errors." A vague "it works" without evidence of full control coverage is not acceptable.
