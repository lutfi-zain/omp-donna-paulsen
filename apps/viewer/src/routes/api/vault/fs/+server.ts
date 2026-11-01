import { json, type RequestHandler } from '@sveltejs/kit';
import {
  createVaultFile,
  createVaultFolder,
  renameVaultItem,
  deleteVaultItem,
} from '$lib/server/vault';
import { multiVault } from '$lib/server/vault-manager';

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    const queryVault = url.searchParams.get('vault');
    const body = (await request.json()) as {
      action: 'create_file' | 'create_folder' | 'rename' | 'delete';
      vaultId?: string;
      folderPath?: string;
      fileName?: string;
      title?: string;
      type?: string;
      kind?: 'document' | 'mermaid' | 'drawing';
      content?: string;
      parentFolder?: string;
      folderName?: string;
      targetPath?: string;
      newName?: string;
      isDirectory?: boolean;
    };

    const targetVault = multiVault.getVault(body.vaultId || queryVault);
    const vaultDir = targetVault.info.path;

    if (body.action === 'create_file') {
      if (!body.fileName) {
        return json({ ok: false, error: 'Nama berkas diperlukan' }, { status: 400 });
      }
      const concept = await createVaultFile({
        folderPath: body.folderPath,
        fileName: body.fileName,
        title: body.title,
        type: body.type,
        kind: body.kind,
        content: body.content,
        vaultDir,
      });
      targetVault.manager.reload();
      return json({ ok: true, concept });
    }

    if (body.action === 'create_folder') {
      if (!body.folderName) {
        return json({ ok: false, error: 'Nama folder diperlukan' }, { status: 400 });
      }
      const folderPath = await createVaultFolder(body.parentFolder || '', body.folderName, vaultDir);
      targetVault.manager.reload();
      return json({ ok: true, folderPath });
    }

    if (body.action === 'rename') {
      if (!body.targetPath || !body.newName) {
        return json({ ok: false, error: 'Path dan nama baru diperlukan' }, { status: 400 });
      }
      const result = await renameVaultItem(
        body.targetPath,
        body.newName,
        !!body.isDirectory,
        vaultDir
      );
      targetVault.manager.reload();
      return json({ ok: true, ...result });
    }

    if (body.action === 'delete') {
      if (!body.targetPath) {
        return json({ ok: false, error: 'Path target diperlukan' }, { status: 400 });
      }
      await deleteVaultItem(body.targetPath, !!body.isDirectory, vaultDir);
      targetVault.manager.reload();
      return json({ ok: true, deleted: body.targetPath });
    }

    return json({ ok: false, error: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Operasi berkas gagal';
    return json({ ok: false, error: msg }, { status: 400 });
  }
};
