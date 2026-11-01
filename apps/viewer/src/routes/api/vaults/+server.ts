import { json, type RequestHandler } from '@sveltejs/kit';
import { multiVault } from '$lib/server/vault-manager';

export const GET: RequestHandler = async () => {
  return json(multiVault.getVaultList());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as { name?: string; path?: string };
    if (!body?.name?.trim() || !body?.path?.trim()) {
      return json({ ok: false, error: 'Nama dan path folder vault diperlukan' }, { status: 400 });
    }

    const info = multiVault.addCustomVault(body.name.trim(), body.path.trim());
    return json({ ok: true, vault: info });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menambahkan vault';
    return json({ ok: false, error: msg }, { status: 400 });
  }
};
