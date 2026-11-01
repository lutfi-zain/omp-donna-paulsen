import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { multiVault } from '$lib/server/vault-manager';
import { writeConceptFile } from '$lib/server/vault';

export const GET: RequestHandler = async ({ params, url }) => {
  const vaultId = url.searchParams.get('vault');
  const vault = multiVault.getVault(vaultId);
  const conceptId = decodeURIComponent(params.id);
  const concept = vault.manager.getConcept(conceptId);
  if (!concept) {
    return json({ error: 'Concept not found' }, { status: 404 });
  }
  return json(concept);
};

export const PUT: RequestHandler = async ({ params, request, url }) => {
  try {
    const vaultId = url.searchParams.get('vault');
    const vault = multiVault.getVault(vaultId);
    const conceptId = decodeURIComponent(params.id);
    const payload = (await request.json()) as { body?: string };
    if (typeof payload?.body !== 'string') {
      return json({ ok: false, error: 'Missing body field' }, { status: 400 });
    }
    await writeConceptFile(conceptId, payload.body, vault.info.path);
    vault.manager.reload();
    return json({ ok: true, id: conceptId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Write failed';
    return json({ ok: false, error: message }, { status: 400 });
  }
};
