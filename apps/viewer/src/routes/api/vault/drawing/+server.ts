import fs from 'node:fs';
import path from 'node:path';
import { json, type RequestHandler } from '@sveltejs/kit';
import { multiVault } from '$lib/server/vault-manager';

export interface SavedDrawingItem {
  id: string;
  title: string;
  fileName: string;
  updatedAt: string;
}

function getDrawingsDir(vaultPath: string): string {
  const dir = path.join(vaultPath, 'drawings');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `canvas-${Date.now()}`
  );
}

function findTldrFiles(
  dir: string,
  baseDir: string = dir,
  list: SavedDrawingItem[] = []
): SavedDrawingItem[] {
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTldrFiles(fullPath, baseDir, list);
    } else if (entry.isFile() && entry.name.endsWith('.tldr')) {
      const rel = path.relative(baseDir, fullPath);
      const cleanId = rel.replace(/\.tldr$/, '');
      const stat = fs.statSync(fullPath);
      let title = path.basename(cleanId);
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw) as { title?: string };
        if (parsed.title) title = parsed.title;
      } catch {}
      list.push({
        id: cleanId,
        title,
        fileName: entry.name,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }
  return list;
}

export const GET: RequestHandler = async ({ url }) => {
  const targetVault = multiVault.getVault(url.searchParams.get('vault'));
  const vaultPath = targetVault.info.path;
  const idParam = url.searchParams.get('id');

  if (idParam) {
    const clean = idParam.replace(/\.tldr$/, '').replace(/^\/+/, '');
    const candidates = [
      path.resolve(path.join(vaultPath, `${clean}.tldr`)),
      path.resolve(path.join(vaultPath, 'drawings', `${clean}.tldr`)),
      path.resolve(path.join(vaultPath, 'drawings', `${path.basename(clean)}.tldr`)),
    ];

    let foundPath = '';
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        foundPath = cand;
        break;
      }
    }

    if (!foundPath) {
      const all = findTldrFiles(vaultPath);
      const matched = all.find(
        (item) => item.id === clean || item.fileName === `${clean}.tldr` || path.basename(item.id) === path.basename(clean)
      );
      if (matched) {
        foundPath = path.join(vaultPath, `${matched.id}.tldr`);
      }
    }

    if (!foundPath || !fs.existsSync(foundPath)) {
      return json({ ok: false, error: 'Drawing not found' }, { status: 404 });
    }

    try {
      const raw = fs.readFileSync(foundPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      return json({ ok: true, id: clean, data: parsed });
    } catch {
      return json({ ok: false, error: 'Invalid drawing file' }, { status: 500 });
    }
  }

  const items = findTldrFiles(vaultPath);
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return json({ ok: true, items });
};

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const targetVault = multiVault.getVault(url.searchParams.get('vault'));
    const vaultPath = targetVault.info.path;

    const body = (await request.json()) as {
      id?: string;
      folderPath?: string;
      title?: string;
      content?: string;
      snapshot?: unknown;
    };

    const rawTitle = (body.title || '').trim() || `Kanvas ${new Date().toISOString().slice(0, 16)}`;
    const folder = (body.folderPath || (body.id?.includes('/') ? path.dirname(body.id) : 'drawings')).replace(/^\/+|\/+$/g, '');
    const slug = body.id ? path.basename(body.id).replace(/\.tldr$/, '') : slugify(rawTitle);

    const targetDir = folder ? path.resolve(path.join(vaultPath, ...folder.split('/'))) : getDrawingsDir(vaultPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const savedFiles: string[] = [];

    if (body.content) {
      const svgPath = path.join(targetDir, `${slug}.svg`);
      fs.writeFileSync(svgPath, body.content, 'utf-8');
      savedFiles.push(svgPath);
    }

    if (body.snapshot) {
      const tldrPath = path.join(targetDir, `${slug}.tldr`);
      const payload = {
        title: rawTitle,
        updatedAt: new Date().toISOString(),
        snapshot: body.snapshot,
      };
      fs.writeFileSync(tldrPath, JSON.stringify(payload, null, 2), 'utf-8');
      savedFiles.push(tldrPath);
    }

    // Companion OKF concept markdown
    const mdPath = path.join(targetDir, `${slug}.md`);
    const mdContent = [
      '---',
      `title: "${rawTitle.replace(/"/g, '\\"')}"`,
      'type: Drawing',
      'status: verified',
      'tags:',
      '  - canvas',
      '  - tldraw',
      `description: "Whiteboard Kanvas tldraw (${slug}.tldr)"`,
      '---',
      '',
      `# ${rawTitle}`,
      '',
      `Kanvas whiteboard ini disimpan di \`${folder ? folder + '/' : ''}${slug}.tldr\`. Buka menu **Kanvas** untuk melihat atau mengedit kanvas ini.`,
      '',
      body.content ? `## Pratinjau SVG\n\n${body.content}\n` : '',
    ].join('\n');
    fs.writeFileSync(mdPath, mdContent, 'utf-8');
    savedFiles.push(mdPath);

    targetVault.manager.reload();
    const relConceptId = folder ? `${folder}/${slug}` : `drawings/${slug}`;
    return json({ ok: true, id: relConceptId, slug, title: rawTitle, files: savedFiles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save drawing';
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
