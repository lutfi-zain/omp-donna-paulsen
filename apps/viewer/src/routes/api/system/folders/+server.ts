import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { json, type RequestHandler } from '@sveltejs/kit';

export interface ServerFolderItem {
  name: string;
  path: string;
  isOkf: boolean;
  hasOkfSubfolder: boolean;
  hasChildren: boolean;
}

export const GET: RequestHandler = async ({ url }) => {
  const reqPath = url.searchParams.get('path') || path.join(os.homedir(), 'projects');
  const targetDir = path.resolve(reqPath);

  // Security: only allow browsing inside home directory
  const homeDir = os.homedir();
  if (!targetDir.startsWith(homeDir)) {
    return json({ ok: false, error: 'Akses folder dibatasi pada home directory' }, { status: 403 });
  }

  if (!fs.existsSync(targetDir)) {
    return json({ ok: false, error: 'Direktori tidak ditemukan' }, { status: 404 });
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return json({ ok: false, error: 'Bukan sebuah direktori' }, { status: 400 });
  }

  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const folders: ServerFolderItem[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip node_modules, .git, and common heavy build caches
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.svelte-kit' ||
        entry.name === '.cache' ||
        entry.name === 'build' ||
        entry.name === 'dist'
      ) {
        continue;
      }

      const fullPath = path.join(targetDir, entry.name);
      const isOkf = entry.name === '.okf' || fs.existsSync(path.join(fullPath, 'index.md'));
      const hasOkfSubfolder = fs.existsSync(path.join(fullPath, '.okf'));

      let hasChildren = false;
      try {
        const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
        hasChildren = subEntries.some((s) => s.isDirectory() && s.name !== 'node_modules' && s.name !== '.git');
      } catch {}

      folders.push({
        name: entry.name,
        path: fullPath,
        isOkf: isOkf || hasOkfSubfolder,
        hasOkfSubfolder,
        hasChildren,
      });
    }

    folders.sort((a, b) => {
      // Prioritize OKF directories
      if (a.isOkf && !b.isOkf) return -1;
      if (!a.isOkf && b.isOkf) return 1;
      return a.name.localeCompare(b.name);
    });

    // Parent directory
    const parentPath = targetDir === homeDir ? null : path.dirname(targetDir);

    return json({
      ok: true,
      currentPath: targetDir,
      parentPath,
      folders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal membaca folder';
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
