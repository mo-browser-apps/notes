import {
  app,
  BrowserWindow,
  CheckboxMenuItem,
  Menu,
  MenuItem,
  MenuOptions,
  MenuWithRole,
  Shortcut,
} from '@mobrowser/api';
import { MenuState } from './gen/menu';
import { openSettings } from './settings';
import { UPDATES_ENABLED } from './updates';

/**
 * The application menu.
 *
 * Replaces MōBrowser's default, browser-flavored menu with the app's own commands: File (notes,
 * folders, import/export), Edit, Format, Note, View (sidebar, Edit/Preview, sort) and Window.
 * Appearance lives in Settings → General. Custom items don't act in the main process: they hand a command to the renderer through
 * `dispatch` (see MenuService in src/main/index.ts), and the renderer reports its state back so
 * items are enabled, labelled and checked to match (`AppMenu.update`).
 *
 * Enabled means "choosing this acts now". Every renderer-driven item starts disabled and is enabled
 * in `update()` from state the renderer computes with the same checks its command handler runs
 * (focus, selection, open dialogs). Adding an item: follow "Adding a menu item" in the rule below.
 *
 * Shortcuts: a shortcut bound to a menu item is consumed by the native menu — the page never sees
 * the keydown — so every shortcut listed here must be fully handled by its command. ⌘⌫ is
 * deliberately NOT bound: in a text field it deletes to the start of the line, and the renderer
 * handles it for "Delete Note" only outside text fields.
 *
 * Platform split (see docs/guides/guides/app-menu.md): on macOS the menu belongs to the
 * application (`app.setMenu`); on Windows each window owns its own menu bar (`win.setMenu`).
 * Linux has no menu bar — the renderer's own shortcuts cover it. About and Settings… live in the
 * app menu on macOS; on Windows, Settings… is in File and About in Help. About opens Settings on
 * its About page (the renderer draws it with the app icon, which `app.showMessageDialog` can't).
 *
 * See `.agents/skills/desktop-shell/rules/menu.md` for the rules this follows.
 */

export type MenuDispatch = (id: string, value?: string) => void;

export interface AppMenu {
  update(state: MenuState): void;
}

const isMac = process.platform === 'darwin';

const SORT_OPTIONS: [string, string][] = [
  ['modified-desc', 'Date Modified — Newest First'],
  ['modified-asc', 'Date Modified — Oldest First'],
  ['created-desc', 'Date Created — Newest First'],
  ['created-asc', 'Date Created — Oldest First'],
  ['title-asc', 'Title — A to Z'],
  ['title-desc', 'Title — Z to A'],
];

export function installAppMenu(win: BrowserWindow, dispatch: MenuDispatch): AppMenu {
  // Renderer commands start disabled; `update()` enables each one only while it would act.
  const command = (id: string, label: string, shortcut?: Shortcut, value?: string) =>
    new MenuItem({
      id: value ? `${id}:${value}` : id,
      label,
      shortcut,
      enabled: false, // until the renderer reports its state
      action: () => dispatch(id, value),
    });
  const choice = (id: string, value: string, label: string) =>
    new CheckboxMenuItem({ id: `${id}:${value}`, label, enabled: false, action: () => dispatch(id, value) });

  // File
  const newNote = command('note.new', 'New Note', 'CommandOrControl+N');
  const newFolder = command('folder.new', 'New Folder', 'CommandOrControl+Shift+N');
  const importMarkdown = command('file.import', 'Import Markdown…', 'CommandOrControl+Shift+I');
  const exportNote = command('note.export', 'Export Note as Markdown…', 'CommandOrControl+Shift+E');
  const exportAll = command('notes.exportAll', 'Export All Notes…');

  // Edit
  const find = command('search.focus', 'Search Notes', 'CommandOrControl+F');

  // Format — applies to the note body, so enabled only while it (or its toolbar) has focus.
  const formatItems = [
    command('format.title', 'Title', 'CommandOrControl+Alt+1'),
    command('format.heading', 'Heading', 'CommandOrControl+Alt+2'),
    command('format.subheading', 'Subheading', 'CommandOrControl+Alt+3'),
    command('format.body', 'Body', 'CommandOrControl+Alt+0'),
    'separator' as const,
    command('format.bold', 'Bold', 'CommandOrControl+B'),
    command('format.italic', 'Italic', 'CommandOrControl+I'),
    command('format.strikethrough', 'Strikethrough', 'CommandOrControl+Shift+X'),
    command('format.code', 'Inline Code', 'CommandOrControl+E'),
    'separator' as const,
    command('format.bullets', 'Bulleted List', 'CommandOrControl+Shift+8'),
    command('format.numbers', 'Numbered List', 'CommandOrControl+Shift+7'),
    command('format.checklist', 'Checklist', 'CommandOrControl+Shift+L'),
    command('format.quote', 'Quote'),
    'separator' as const,
    command('format.link', 'Link…', 'CommandOrControl+K'),
    command('format.codeBlock', 'Code Block'),
    command('format.rule', 'Horizontal Rule'),
  ];

  // Note
  const duplicateNote = command('note.duplicate', 'Duplicate Note', 'CommandOrControl+D');
  const deleteNote = command('note.delete', 'Delete Note…');

  // View
  const toggleSidebar = command(
    'view.sidebar',
    'Hide Sidebar',
    isMac ? 'Command+Control+S' : 'Control+Shift+S',
  );
  const toggleMode = command('view.mode', 'Show Preview', 'CommandOrControl+Shift+P');
  const sortItems = SORT_OPTIONS.map(([value, label]) => choice('view.sort', value, label));

  // About and Settings work in every renderer state (even before the notes load): never disabled.
  const about = new MenuItem({ id: 'about', label: `About ${app.name}`, action: () => openSettings('about') });
  const settings = new MenuItem({
    id: 'settings',
    label: 'Settings…',
    shortcut: 'CommandOrControl+,',
    action: () => openSettings('general'),
  });

  const fileMenu = new MenuWithRole({
    role: 'fileMenu',
    items: [
      newNote,
      newFolder,
      'separator',
      importMarkdown,
      exportNote,
      exportAll,
      'separator',
      // Windows has no app menu, so Settings… sits in File there.
      ...(isMac ? [] : [settings, 'separator' as const]),
      'closeWindow',
    ],
  });
  // Keep the edit roles wherever there are text inputs: they wire Undo/Cut/Copy/Paste/Select All.
  const editMenu = new MenuWithRole({
    role: 'editMenu',
    items: ['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'delete', 'selectAll', 'separator', find],
  });
  const formatMenu = new Menu({ label: 'Format', items: formatItems });
  const noteMenu = new Menu({ label: 'Note', items: [duplicateNote, deleteNote] });
  const viewMenu = new Menu({
    label: 'View',
    items: [
      toggleSidebar,
      toggleMode,
      'separator',
      new Menu({ label: 'Sort Notes By', items: sortItems }),
      'separator',
      ...appViewItems(),
    ],
  });

  if (isMac) {
    app.setMenu(new Menu({ items: [macAppMenu(about, settings), fileMenu, editMenu, formatMenu, noteMenu, viewMenu, windowMenu()] }));
  } else if (process.platform === 'win32') {
    win.setMenu(new Menu({ items: [fileMenu, editMenu, formatMenu, noteMenu, viewMenu, helpMenu(about)] }));
  }

  return {
    // An item is enabled only when choosing it would act. A command that would be ignored (no
    // note, focus outside the note body, a dialog open) shows as disabled, not as a dead item.
    update(state: MenuState) {
      const { hasNote, editing } = state;
      // Nothing runs behind a dialog (see AppCommands in the renderer).
      const live = state.ready && !state.modal;
      for (const item of [newNote, newFolder, importMarkdown, find, toggleSidebar]) {
        item.setEnabled(live);
      }
      exportAll.setEnabled(live && state.hasNotes);
      for (const item of [exportNote, duplicateNote, deleteNote, toggleMode]) item.setEnabled(live && hasNote);
      for (const item of formatItems) {
        if (item !== 'separator') item.setEnabled(live && state.canFormat);
      }
      for (const item of sortItems) item.setEnabled(live);
      toggleSidebar.setLabel(state.sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar');
      toggleMode.setLabel(editing ? 'Show Preview' : 'Edit Markdown');
      sortItems.forEach((item, index) => item.setChecked(SORT_OPTIONS[index][0] === state.sortMode));
    },
  };
}

/** The macOS application menu: About, Check for Updates, Settings, hide/show, quit. */
function macAppMenu(about: MenuItem, settings: MenuItem): MenuWithRole {
  return new MenuWithRole({
    role: 'macAppMenu',
    items: [
      about,
      // The built-in, user-initiated update flow; MōBrowser omits it without an update server.
      ...(UPDATES_ENABLED ? ['checkForUpdates' as const] : []),
      'separator',
      settings,
      'separator',
      'macHideApp',
      'macHideOthers',
      'macShowAll',
      'separator',
      'quit',
    ],
  });
}

/**
 * Zoom and full screen ship to users; reloading and DevTools are gated to development so end
 * users can't reload the app out from under itself.
 */
function appViewItems(): MenuOptions['items'] {
  const items: MenuOptions['items'] = ['zoomReset', 'zoomIn', 'zoomOut', 'separator', 'fullScreen'];
  if (!app.packaged) {
    items.push('separator', 'reload', 'reloadBypassCache', 'devTools');
  }
  return items;
}

/** Windows has no app menu, so About (and Check for Updates) live in Help. */
function helpMenu(about: MenuItem): Menu {
  return new Menu({ label: 'Help', items: [...(UPDATES_ENABLED ? ['checkForUpdates' as const, 'separator' as const] : []), about] });
}

function windowMenu(): MenuWithRole {
  return new MenuWithRole({ role: 'windowMenu', items: ['minimizeWindow', 'maximizeWindow'] });
}
