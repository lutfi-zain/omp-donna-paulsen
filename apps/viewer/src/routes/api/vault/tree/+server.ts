import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { multiVault } from '$lib/server/vault-manager';

export const GET: RequestHandler = async ({ url }) => {
  const vaultId = url.searchParams.get('vault');
  const vault = multiVault.getVault(vaultId);
  return json(vault.manager.getTree());
};
