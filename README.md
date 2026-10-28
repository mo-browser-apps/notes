# Notes

A local-first Markdown notes app for macOS, Windows, and Linux, built with
[MōBrowser](https://mobrowser.com), React, and shadcn/ui.

Notes are stored on your machine in the app's IndexedDB. There is no account, no sync, and no
server. You write in plain Markdown, and you can export your notes as `.md` files at any time.

## Features

- **Three-pane layout.** Folders, the note list, and the editor. Below 768 px the folder sidebar
  becomes an overlay.
- **Markdown editor.** Built on CodeMirror, with a formatting toolbar, keyboard shortcuts, and a
  rendered preview that supports GitHub Flavored Markdown (tables, task lists, strikethrough).
- **Folders.** Create, rename, and delete folders. When you delete a folder you can keep its
  notes, and Undo brings the folder back.
- **Search.** Matches note titles and bodies. Press Esc to clear the search and get the full list
  back.
- **Sorting.** Sort by date modified, date created, or title, in either direction. Date sorts
  group notes under date headings.
- **Autosave.** Every edit is saved as you type, and deleted notes can be restored with Undo.
- **Import and export.** Import `.md` files, export a single note as Markdown, or export every
  note as a ZIP with one directory per folder.
- **Native shell.** An application menu on macOS and Windows whose items are enabled only when they would do
  something, a Settings window (General, Import & Export, About), light/dark/system themes, launch
  at login, and the option to start in the Dock without opening a window (macOS).

## Keyboard shortcuts

`⌘` is `Ctrl` on Windows and Linux.

| Action | Shortcut |
| --- | --- |
| New note | `⌘N` |
| New folder | `⌘⇧N` |
| Search notes | `⌘F` |
| Import Markdown | `⌘⇧I` |
| Export note as Markdown | `⌘⇧E` |
| Duplicate note | `⌘D` |
| Toggle preview | `⌘⇧P` |
| Toggle sidebar | `⌘⌃S` (macOS), `Ctrl+Shift+S` (Windows/Linux) |
| Settings | `⌘,` |
| Title / Heading / Subheading / Body | `⌘⌥1` / `⌘⌥2` / `⌘⌥3` / `⌘⌥0` |
| Bold / Italic / Strikethrough | `⌘B` / `⌘I` / `⌘⇧X` |
| Inline code | `⌘E` |
| Bulleted / Numbered list | `⌘⇧8` / `⌘⇧7` |
| Checklist | `⌘⇧L` |
| Link | `⌘K` |

## Getting started

Requirements: Node.js 20.20.2+, 22.22.2+, or 24.14.1+.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` generates the IPC bindings, builds the main process, and opens the app. Vite serves
the renderer live, so UI changes hot-reload. Changes to the main process need a restart.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Build and run the app with a live-reloading renderer. |
| `npm run dev:build` | Build without launching. |
| `npm run build` | Production build, including the renderer type check. |
| `npm run pack` | Package installers (DMG on macOS, EXE on Windows). |
| `npm test` | Run the Playwright end-to-end tests against the real app. |
| `npm run gen` | Regenerate the IPC/protobuf bindings after editing a `.proto` file. |
| `npm run mobrowser -- <command>` | Run any other MōBrowser CLI command. The CLI is a local dependency and isn't on your `PATH`. |

## Project structure

```
src/
  main/              Main process: window, menu, settings, file dialogs, updates
  renderer/
    components/
      notes/         The notes window: sidebar, list, editor, preview, dialogs
      settings/      The Settings window
      ui/            shadcn/ui registry components and the app kit (no app code here)
    hooks/           React hooks, including the notes store (use-notes)
    lib/             Storage (IndexedDB), Markdown commands, import/export, sorting
    proto/           IPC service definitions shared by main and renderer
test/e2e/            Playwright end-to-end tests
assets/              App icons and macOS entitlements
mobrowser.conf.json  App identity, bundle, and installer configuration
```

The renderer runs sandboxed. Anything it can't do itself (native file dialogs, reading and writing
files, menu state, app settings) goes through the protobuf services in `src/renderer/proto/`, which
the main process implements. The generated `gen/` directories are gitignored, so run `npm run gen`
(or `npm run dev`) after cloning.

All storage goes through the repositories in `src/renderer/lib/db.ts`. Components never touch
IndexedDB directly, so the persistence layer can be swapped without changing the UI.

## Releases

`.github/workflows/release.yml` runs when you push a `v*` tag. It builds for macOS (Apple Silicon
and Intel), Windows, and Linux, then creates a draft GitHub Release. `.github/workflows/test.yml`
runs the end-to-end tests on all three platforms for every pull request.

macOS signing and notarization read their credentials from repository secrets. To set them from
your Developer ID certificate, run this on your Mac:

```bash
npm run mobrowser -- signcert --gh
```

## Working on this project with AI agents

`AGENTS.md` and the skills in `.agents/skills/` describe the project's conventions for the shell,
the UI, and testing. Read them before you change the code.
