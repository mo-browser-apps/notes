import { readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { app, BrowserWindow, ipc } from '@mobrowser/api';
import { FilesServiceDescriptor } from './gen/ipc_service';

// Markdown notes are small; anything bigger is almost certainly not a note.
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * Native open/save dialogs plus the file reads/writes behind them. The renderer is sandboxed,
 * so Markdown import and export go through this service.
 */
export function registerFilesService(win: BrowserWindow): void {
  ipc.registerService(FilesServiceDescriptor, {
    async OpenMarkdownFiles() {
      const result = await app.showOpenDialog({
        parentWindow: win,
        title: 'Import Markdown',
        buttonLabelOpen: 'Import',
        selectionPolicy: 'files',
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
        features: { allowMultiple: true },
      });
      if (result.canceled) {
        return { canceled: true, files: [], skipped: [] };
      }

      const files: { name: string; content: string }[] = [];
      const skipped: string[] = [];
      for (const filePath of result.paths) {
        const name = path.basename(filePath);
        try {
          const info = await stat(filePath);
          if (!info.isFile() || info.size > MAX_IMPORT_BYTES) {
            skipped.push(name);
            continue;
          }
          files.push({ name, content: await readFile(filePath, 'utf8') });
        } catch {
          skipped.push(name);
        }
      }
      return { canceled: false, files, skipped };
    },

    async SaveFile(request) {
      const result = await app.showSaveDialog({
        parentWindow: win,
        title: request.title || 'Export',
        defaultPath: path.join(app.getPath('userHome'), 'Documents', request.suggestedName),
        filters: [{ name: request.filterName, extensions: request.extensions }],
        features: { canCreateDirectories: true },
      });
      if (result.canceled || !result.path) {
        return { canceled: true, path: '' };
      }
      await writeFile(result.path, request.data);
      return { canceled: false, path: result.path };
    },
  });
}
