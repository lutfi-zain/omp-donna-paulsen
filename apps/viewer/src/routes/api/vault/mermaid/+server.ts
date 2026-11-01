import fs from 'node:fs';
import path from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeConceptFile } from '$lib/server/vault';
import { multiVault } from '$lib/server/vault-manager';

export interface MermaidVaultItem {
  key: string;
  conceptId: string;
  title: string;
  category: 'diagram' | 'concept';
  blockIndex: number;
  code: string;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `diagram-${Date.now()}`
  );
}

export const GET: RequestHandler = async ({ url }) => {
  const targetVault = multiVault.getVault(url.searchParams.get('vault'));
  const graph = targetVault.manager.reload();
  const items: MermaidVaultItem[] = [];
  const mermaidRegex = /```mermaid\r?\n([\s\S]*?)```/g;

  for (const node of graph.nodes) {
    let match: RegExpExecArray | null;
    let idx = 0;
    mermaidRegex.lastIndex = 0;
    while ((match = mermaidRegex.exec(node.body)) !== null) {
      const code = match[1].trim();
      if (code) {
        const isStandalone = node.id.startsWith('diagrams/') || node.type === 'Diagram';
        items.push({
          key: `${node.id}#${idx}`,
          conceptId: node.id,
          title: idx === 0 ? node.title : `${node.title} (#${idx + 1})`,
          category: isStandalone ? 'diagram' : 'concept',
          blockIndex: idx,
          code,
        });
      }
      idx++;
    }
  }

  // Sort standalone diagrams first, then alphabetically by title
  items.sort((a, b) => {
    if (a.category !== b.category) return a.category === 'diagram' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return json({ ok: true, items });
};

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const targetVault = multiVault.getVault(url.searchParams.get('vault'));
    const vaultPath = targetVault.info.path;

    const body = (await request.json()) as {
      title?: string;
      code?: string;
      conceptId?: string;
      blockIndex?: number;
    };

    const code = (body.code || '').trim();
    if (!code) {
      return json({ ok: false, error: 'Kode Mermaid kosong' }, { status: 400 });
    }

    const rawTitle = (body.title || '').trim() || `Diagram ${new Date().toISOString().slice(0, 10)}`;

    // Case 1: Updating an existing concept's mermaid block in-place
    if (body.conceptId) {
      const existing = targetVault.manager.getConcept(body.conceptId);
      if (existing) {
        const targetIdx = typeof body.blockIndex === 'number' ? body.blockIndex : 0;
        let currentIdx = 0;
        let replaced = false;
        const updatedBody = existing.body.replace(
          /```mermaid\r?\n([\s\S]*?)```/g,
          (fullMatch) => {
            if (currentIdx === targetIdx) {
              replaced = true;
              currentIdx++;
              return `\`\`\`mermaid\n${code}\n\`\`\``;
            }
            currentIdx++;
            return fullMatch;
          }
        );

        const finalBody = replaced
          ? updatedBody
          : `${existing.body.trimEnd()}\n\n\`\`\`mermaid\n${code}\n\`\`\`\n`;

        await writeConceptFile(existing.id, finalBody, vaultPath);
        targetVault.manager.reload();
        return json({
          ok: true,
          conceptId: existing.id,
          title: existing.title,
          blockIndex: targetIdx,
        });
      }
    }

    // Case 2: Saving as a standalone diagram concept in {vaultPath}/diagrams/<slug>.md
    const diagramsDir = path.join(vaultPath, 'diagrams');
    if (!fs.existsSync(diagramsDir)) {
      fs.mkdirSync(diagramsDir, { recursive: true });
    }

    const slug = slugify(rawTitle);
    const conceptId = `diagrams/${slug}`;
    const filePath = path.join(diagramsDir, `${slug}.md`);

    const mdContent = [
      '---',
      `title: "${rawTitle.replace(/"/g, '\\"')}"`,
      'type: Diagram',
      'status: verified',
      'tags:',
      '  - mermaid',
      '  - diagram',
      `description: "Diagram Mermaid — ${rawTitle.replace(/"/g, '\\"')}"`,
      '---',
      '',
      `# ${rawTitle}`,
      '',
      '```mermaid',
      code,
      '```',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, mdContent, 'utf-8');
    targetVault.manager.reload();

    return json({
      ok: true,
      conceptId,
      title: rawTitle,
      blockIndex: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menyimpan diagram Mermaid';
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
