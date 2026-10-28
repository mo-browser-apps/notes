# Renderer structure: where code goes

Everything the user sees lives under `src/renderer`. It has a fixed layout — put new files in the
right place rather than inventing a structure, and **never** add app code to `components/ui`.

```
src/renderer/
  main.tsx                 entry — mounts <App/> in StrictMode, and imports font packages.
  App.tsx                  provider composition + the app shell. Add providers here.
  index.css                the ONE stylesheet (tokens, base layer, utilities).
  index.html               Vite HTML entry.
  components/
    ui/                    shadcn registry mirror + marked local extensions — no app code.
    theme-provider.tsx     app-level component (this is the pattern to follow)
    <feature>/…            your screens, panels, forms, feature components
  hooks/                   shared hooks: use-<thing>.ts
  lib/                     framework-free helpers: utils.ts (cn), tools.ts (IPC invoke)
  proto/                   .proto IPC contracts (source; see below)
  gen/                     GENERATED — gitignored, never edit by hand
  public/                  static assets served as-is
```

---

## `components/ui/` is the registry mirror — keep it pristine

Files in `src/renderer/components/ui` are shadcn component source, copied in by the CLI. Treat them
as a vendored library:

- **Never add a new app component there.** A `dashboard-card.tsx` or `project-list.tsx` is *your*
  component — it belongs in `components/` (or a feature folder), not in `ui/`.
- **Edit an existing one only to add a variant** (see
  [customization.md](../customization.md#customizing-components)), and expect that a future
  `npx shadcn@latest add <name>` will offer to overwrite your change.
- **The one exception is a local extension** — a new, app-agnostic primitive that deliberately
  extends the design system. It must be registry-shaped (compound parts, `data-slot`, `cn`,
  `className` passthrough, no app data or state) and **start with a `LOCAL EXTENSION` header
  comment** so the next person can tell it isn't upstream. Current extensions:

  | File | Exports | Use it for |
  | --- | --- | --- |
  | `ui/settings.tsx` | `SettingsPage*`, `SettingsSection*` | every settings screen — see [forms.md](./forms.md#settings-groups-heading-and-description-go-outside-the-card) |
  | `ui/page.tsx` | `Page`, `PageHeader`, `PageHeaderContent`, `PageHeading`, `PageTitle`, `PageDescription`, `PageActions`, `PageBack`, `PageSplit`, `PageMain`, `PageAside`, `pageVariants` | every screen's column, title row, and side column |
  | `ui/router.tsx` | `Routes`, `navigate`, `setQuery`, `useRoute`, `matchPath`, `Link`, `TextLink`, `useNavigationBlocker`, `usePendingNavigation`, `NavigationGuard` | all navigation (hash router, no dependency) |
  | `ui/search-field.tsx` | `SearchField` | every search/filter text box |
  | `ui/faceted-filter.tsx` | `FacetedFilter` | multi-select filter chips |
  | `ui/date-range-picker.tsx` | `DateRangePicker`, `DatePicker`, `describeDateRange`, `DATE_RANGE_PRESETS` | date-range filters, date fields |
  | `ui/data-table.tsx` | `TableCard`, `TableToolbar`, `SortableHead`, `compareBy`, `paginate`, `PAGE_SIZES`, `TablePagination`, `useSelection`, `SelectAllCheckbox`, `BulkActionBar` | list screens |
  | `ui/table-state.tsx` | `TableSkeletonRows`, `TableEmptyRow`, `TableNoResultsRow`, `TableErrorRow` | a table's non-happy rows |
  | `ui/status-badge.tsx` | `StatusBadge`, `Delta` | statuses, period-over-period change |
  | `ui/metric.tsx` | `Metric`, `MetricGroup` | KPI tiles |
  | `ui/confirm-dialog.tsx` | `ConfirmDialog`, `undoToast` | confirmations, undo |
  | `ui/copy-button.tsx` | `CopyButton`, `copyToClipboard` | copy to clipboard |
  | `ui/save-bar.tsx` | `SaveBar` | every editor's unsaved-changes contract |
  | `ui/money-input.tsx` | `MoneyInput`, `parseMoney`, `formatMoneyInput` | amounts in integer minor units |
  | `ui/timeline.tsx` | `Timeline`, `NoteComposer` | activity history, notes |

  Usage for all of them: [app-kit.md](./app-kit.md). **Use them instead of writing the pattern in a
  feature folder** — a `components/shared/search-input.tsx` or a local `PageHeader` duplicates the
  kit and forks its fixes.

  Before adding another, check the registry and the kit don't already have it, and ask — a new
  extension is a design-system decision, not a place to park a feature component. Kit files may
  import each other (`save-bar` → `router`, `page` → `router`, `metric` → `status-badge`) but never
  app code (`@/lib/store`, feature components).

- **Some registry files carry local fixes** for bugs in the upstream source. Each fix is marked with a
  `Local fix:` comment at the change. **Re-apply them after any `npx shadcn@latest add` /
  `--overwrite`** — the CLI will silently restore the bug:

  | File | Local change | Upstream bug it fixes |
  | --- | --- | --- |
  | `ui/badge.tsx` | `success`, `warning` variants | no variants for the state tokens |
  | `ui/checkbox.tsx` | `MinusIcon` + filled box for `indeterminate` | showed ✓ for "some selected" |
  | `ui/command.tsx` | `CommandDialog` header inside `DialogContent` | sr-only heading on every screen |
  | `ui/dialog.tsx` | `max-h-[calc(100svh-2rem)] overflow-y-auto` | long dialogs ran off-screen |
  | `ui/item.tsx` | `ItemGroup` wraps children in `display: contents` listitems | `role="list"` with no listitems |
  | `ui/sidebar.tsx` | ⌘B/Ctrl+B toggle skips text fields and handled events | the sidebar shortcut stole Bold from editors |
  | `ui/sidebar.tsx` | selected items (`data-active`) use `--sidebar-selection` (in `index.css`), also on hover and press | the selection used the hover tint, almost invisible against `--sidebar`, and hovering it hid it entirely |
  | `ui/sidebar.tsx` | `cursor-default` on `SidebarMenuButton` and `SidebarMenuSubButton` | items rendered as links (`render={<Link />}`) showed the web hand cursor |
| `ui/slider.tsx` | root width is `w-full`, not `data-horizontal:w-full` | a caller's `w-64` was ignored |

  `grep -rn "Local fix:" src/renderer/components/ui` lists them.

**Incorrect:**

```
src/renderer/components/ui/project-list.tsx       ← app code hiding among the primitives
src/renderer/components/ui/use-projects.ts        ← not even a component
```

**Correct:**

```
src/renderer/components/projects/project-list.tsx
src/renderer/hooks/use-projects.ts
```

---

## Naming

Match what's already there — kebab-case files, PascalCase components, `use-` prefixed hooks:

| Kind | File | Export |
| --- | --- | --- |
| Component | `project-list.tsx` | `export function ProjectList()` |
| Hook | `hooks/use-projects.ts` | `export function useProjects()` |
| Helper | `lib/format-bytes.ts` | `export function formatBytes()` |

Prefer named exports (`export function Foo`) — `App.tsx` is the only default export in the codebase.

---

## Imports: always the `@/` aliases

`@/` resolves to `src/renderer` (`components.json` + `tsconfig.json`). Never write relative paths that
climb directories.

**Incorrect:**

```tsx
import { Button } from "../../components/ui/button"
import { cn } from "../lib/utils"
```

**Correct:**

```tsx
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
```

Aliases: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.

> `vite.config.ts` defines `@` **per build**: it points at `src/renderer` in the renderer build and at
> `src/main` in the main build. `tsconfig.json` maps `@/*` to both, so an `@/` import that only
> resolves in the other process type-checks fine and then fails at build time. Inside `src/renderer`,
> `@/` always means `src/renderer`.

---

## Providers go in `App.tsx`, once

`App.tsx` owns the provider stack (`ThemeProvider` → `TooltipProvider` → content + `Toaster`). Add a
new provider there rather than wrapping a subtree in a screen — a provider mounted twice, or mounted
below a consumer, is a classic on-click crash (see [verification.md](./verification.md)).

- **Theme:** use the project's own `useTheme()` from `@/components/theme-provider`. **Don't add or
  import `next-themes`** — upstream wrappers reach for it, and a second provider would fight over
  the `.dark` class.
- **Toasts:** `<Toaster />` is already mounted; just call `toast()` from `sonner`.
- **Tooltips:** `TooltipProvider` is already mounted; don't nest another one.

**A context lives in its own module, apart from its provider.** Put `createContext` and its
`useX()` hook in `x-context.ts`, which imports **only React** (and types). Put the
`<XProvider>` component, with its `ipc` calls, stores and dialogs, in `x.tsx`, and have
consumers import the hook from `x-context.ts`.

If one module creates the context *and* exports a non-component (the hook), React Fast Refresh
can't hot-swap it. Vite re-runs it, the re-run creates a new context object, and components
still on the old module read the old, empty one. The result is "useX must be used within
XProvider" and a blank window. Any upstream change triggers this, including `npm run gen` or
`npm run test:e2e` rewriting `gen/` with identical bytes while `npm run dev` is open.

The worked example is `components/notes/notes-actions-context.ts` and `notes-actions.tsx`. To
check, with the app open, arm the `window.__errors` listener (see
[verification.md](./verification.md)), run `npm run gen`, and confirm `#root` still has children
and nothing was recorded.

**Font packages are imported in `main.tsx`, not `index.css`** — a `@fontsource` `@import` inside
`index.css` gets inlined by Tailwind's postcss plugin without rebasing its `url()`s, so the `.woff2`
files are never emitted and the font silently doesn't load. See
[customization.md](../customization.md#bundling-a-font-import-it-from-maintsx-not-indexcss).

---

## This is a Vite renderer, not Next.js

- **No `"use client"` directives, ever** (`rsc: false`). Upstream shadcn examples include them —
  strip them when you adapt an example.
  > 17 of the installed `components/ui/*.tsx` files (`table`, `chart`, `select`, `field`, …) still
  > carry `"use client"` from the registry. In Vite it's an inert string literal, not an error — leave
  > them alone rather than churning vendored files, but **don't copy the pattern** into your own code.
- No `next/link`, `next/image`, `next/navigation`, or server components. **Routing is
  `@/components/ui/router`** — a hash router with params, query state, real history, and an
  unsaved-changes blocker ([app-kit.md](./app-kit.md#routing--routertsx)). Don't add `react-router`
  or write a `hashchange` hook.
- `process.env` is not available the way it is in Next — use `import.meta.env` (Vite).

---

## IPC: `.proto` is the source, `gen/` is not

Talking to the main process goes through generated bindings:

1. Edit or add a contract in `src/renderer/proto/*.proto`.
2. Run `npm run gen` — it writes `src/renderer/gen/` **and** `src/main/gen/`.
3. Call it from the renderer via the generated client, and implement it in `src/main/index.ts` with
   `ipc.registerService(...)`:

```tsx
import { ipc } from "@/gen/ipc"

const { name, version } = await ipc.app.GetAppInfo({})
```

`gen/` is gitignored and regenerated from scratch. **Never hand-edit a file in `gen/`** — the change
disappears on the next `npm run gen`, and the folders may simply be missing on a fresh checkout until
you run it.

---

## One more file that is not yours

`src/main/` is the native shell — window, menu, tray. It has its own skill:
[desktop-shell](../../desktop-shell/SKILL.md). Don't configure window behavior from the renderer.
