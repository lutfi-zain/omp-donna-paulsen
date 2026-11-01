<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import { studio } from '$lib/stores/studio.svelte';
  import type { VaultTreeNode, OKFConcept } from '$lib/types';
  import FolderIcon from '@lucide/svelte/icons/folder';
  import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
  import FileTextIcon from '@lucide/svelte/icons/file-text';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import FilePlusIcon from '@lucide/svelte/icons/file-plus';
  import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import GitGraphIcon from '@lucide/svelte/icons/git-graph';
  import PenToolIcon from '@lucide/svelte/icons/pen-tool';
  import FolderTreePicker from '$lib/components/FolderTreePicker.svelte';

  interface Props {
    selectedId?: string | null;
    onSelect: (conceptId: string) => void;
  }

  let { selectedId = null, onSelect }: Props = $props();

  let tree = $state<VaultTreeNode[]>([]);
  let filterText = $state('');
  let expandedDirs = $state<Record<string, boolean>>({});

  // Dialog States
  let createFileDialogOpen = $state(false);
  let createFolderDialogOpen = $state(false);
  let renameDialogOpen = $state(false);
  let deleteDialogOpen = $state(false);

  // Form Fields
  let newFileKind = $state<'document' | 'mermaid' | 'drawing'>('document');
  let newFileFolder = $state('');
  let newFileName = $state('');
  let newFileTitle = $state('');
  let newFileType = $state('Concept');

  let newFolderName = $state('');
  let newFolderParent = $state('');

  let renameTargetPath = $state('');
  let renameNewName = $state('');
  let renameIsDirectory = $state(false);

  let deleteTargetPath = $state('');
  let deleteTargetTitle = $state('');
  let deleteIsDirectory = $state(false);

  let actionLoading = $state(false);
  let errorMessage = $state('');

  function extractFolderList(nodes: VaultTreeNode[], acc: string[] = ['']): string[] {
    for (const n of nodes) {
      if (n.type === 'directory') {
        acc.push(n.path);
        if (n.children) extractFolderList(n.children, acc);
      }
    }
    return acc;
  }

  let folderOptions = $derived(
    Array.from(new Set(extractFolderList(tree))).sort((a, b) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b);
    })
  );

  async function fetchTree() {
    try {
      const q = studio.getVaultQuery();
      const res = await fetch(`/api/vault/tree${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as VaultTreeNode[];
      tree = data;
      const nextExpanded: Record<string, boolean> = { ...expandedDirs };
      for (const node of data) {
        if (node.type === 'directory' && nextExpanded[node.id] === undefined) {
          nextExpanded[node.id] = true;
        }
      }
      expandedDirs = nextExpanded;
    } catch {
      // ignore
    }
  }

  onMount(() => {
    fetchTree();
  });

  $effect(() => {
    const _v = studio.vaultVersion;
    const _vid = studio.activeVaultId;
    fetchTree();
  });

  function toggleDir(id: string) {
    expandedDirs = {
      ...expandedDirs,
      [id]: !expandedDirs[id],
    };
  }

  function expandAll(nodes: VaultTreeNode[], stateVal: boolean) {
    const next: Record<string, boolean> = {};
    function walk(list: VaultTreeNode[]) {
      for (const n of list) {
        if (n.type === 'directory') {
          next[n.id] = stateVal;
          if (n.children) walk(n.children);
        }
      }
    }
    walk(nodes);
    expandedDirs = next;
  }

  function filterNodes(nodes: VaultTreeNode[], q: string): VaultTreeNode[] {
    if (!q.trim()) return nodes;
    const lower = q.toLowerCase();
    const out: VaultTreeNode[] = [];
    for (const node of nodes) {
      if (node.type === 'file') {
        const label = `${node.title || ''} ${node.name} ${node.id}`.toLowerCase();
        if (label.includes(lower)) {
          out.push(node);
        }
      } else if (node.children) {
        const filteredChildren = filterNodes(node.children, q);
        if (filteredChildren.length > 0) {
          out.push({
            ...node,
            children: filteredChildren,
            count: filteredChildren.length,
          });
        }
      }
    }
    return out;
  }

  let visibleTree = $derived(filterNodes(tree, filterText));

  // CRUD Actions
  function openCreateFile(defaultFolder = '') {
    if (!defaultFolder && selectedId && selectedId.includes('/')) {
      const parts = selectedId.split('/');
      parts.pop();
      defaultFolder = parts.join('/');
    }
    newFileFolder = defaultFolder;
    newFileName = '';
    newFileTitle = '';
    newFileKind = 'document';
    newFileType = 'Concept';
    errorMessage = '';
    createFileDialogOpen = true;
  }

  function openCreateFolder(defaultParent = '') {
    newFolderParent = defaultParent;
    newFolderName = '';
    errorMessage = '';
    createFolderDialogOpen = true;
  }

  function openRename(targetPath: string, currentName: string, isDirectory: boolean) {
    renameTargetPath = targetPath;
    renameNewName = currentName.replace(/\.md$/, '');
    renameIsDirectory = isDirectory;
    errorMessage = '';
    renameDialogOpen = true;
  }

  function openDelete(targetPath: string, title: string, isDirectory: boolean) {
    deleteTargetPath = targetPath;
    deleteTargetTitle = title;
    deleteIsDirectory = isDirectory;
    errorMessage = '';
    deleteDialogOpen = true;
  }

  async function handleCreateFile() {
    if (!newFileName.trim()) {
      errorMessage = 'Nama berkas harus diisi';
      return;
    }
    actionLoading = true;
    errorMessage = '';
    try {
      const res = await fetch('/api/vault/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_file',
          vaultId: studio.activeVaultId,
          folderPath: newFileFolder,
          fileName: newFileName.trim(),
          title: newFileTitle.trim() || undefined,
          type: newFileType,
          kind: newFileKind,
        }),
      });
      const data = (await res.json()) as { ok: boolean; concept?: OKFConcept; error?: string };
      if (!res.ok || !data.ok || !data.concept) {
        throw new Error(data.error || 'Gagal membuat berkas');
      }
      createFileDialogOpen = false;
      await fetchTree();
      studio.vaultVersion += 1;
      if (newFileFolder) {
        expandedDirs[newFileFolder] = true;
      }

      if (newFileKind === 'mermaid') {
        const starterCode = 'flowchart TD\n  A[Mulai] --> B[Proses]\n  B --> C[Selesai]';
        goto(`/mermaid?conceptId=${encodeURIComponent(data.concept.id)}&title=${encodeURIComponent(data.concept.title)}&code=${encodeURIComponent(starterCode)}`);
      } else if (newFileKind === 'drawing') {
        const slug = data.concept.id.split('/').pop()?.replace(/\.tldr$/, '') || data.concept.slug;
        goto(`/canvas?id=${encodeURIComponent(slug)}&title=${encodeURIComponent(data.concept.title)}`);
      } else {
        onSelect(data.concept.id);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Gagal membuat berkas';
    } finally {
      actionLoading = false;
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) {
      errorMessage = 'Nama folder harus diisi';
      return;
    }
    actionLoading = true;
    errorMessage = '';
    try {
      const res = await fetch('/api/vault/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_folder',
          vaultId: studio.activeVaultId,
          parentFolder: newFolderParent,
          folderName: newFolderName.trim(),
        }),
      });
      const data = (await res.json()) as { ok: boolean; folderPath?: string; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal membuat folder');
      }
      createFolderDialogOpen = false;
      await fetchTree();
      studio.vaultVersion += 1;
      if (newFolderParent) {
        expandedDirs[newFolderParent] = true;
      }
      if (data.folderPath) {
        expandedDirs[data.folderPath] = true;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Gagal membuat folder';
    } finally {
      actionLoading = false;
    }
  }

  async function handleRename() {
    if (!renameNewName.trim()) {
      errorMessage = 'Nama baru harus diisi';
      return;
    }
    actionLoading = true;
    errorMessage = '';
    try {
      const res = await fetch('/api/vault/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename',
          vaultId: studio.activeVaultId,
          targetPath: renameTargetPath,
          newName: renameNewName.trim(),
          isDirectory: renameIsDirectory,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        oldId?: string;
        newId?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal mengubah nama');
      }
      renameDialogOpen = false;
      await fetchTree();
      studio.vaultVersion += 1;
      if (!renameIsDirectory && data.newId) {
        if (selectedId === data.oldId) {
          onSelect(data.newId);
        }
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Gagal mengubah nama';
    } finally {
      actionLoading = false;
    }
  }

  async function handleDelete() {
    actionLoading = true;
    errorMessage = '';
    try {
      const res = await fetch('/api/vault/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          vaultId: studio.activeVaultId,
          targetPath: deleteTargetPath,
          isDirectory: deleteIsDirectory,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal menghapus');
      }
      deleteDialogOpen = false;
      await fetchTree();
      studio.vaultVersion += 1;
      const cleanPath = deleteTargetPath.replace(/\.md$/, '');
      if (selectedId === cleanPath || selectedId?.startsWith(`${deleteTargetPath}/`)) {
        studio.selectedConceptId = null;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Gagal menghapus';
    } finally {
      actionLoading = false;
    }
  }
</script>

{#snippet treeNode(node: VaultTreeNode, depth: number)}
  {#if node.type === 'directory'}
    {@const isOpen = filterText.trim().length > 0 ? true : !!expandedDirs[node.id]}
    <div class="flex flex-col group/dir">
      <div
        class="flex items-center justify-between gap-1 py-1 px-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        style={`padding-left: ${depth * 12 + 6}px`}
      >
        <button
          type="button"
          onclick={() => toggleDir(node.id)}
          class="flex items-center gap-1.5 min-w-0 flex-1 text-left py-0.5"
        >
          {#if isOpen}
            <ChevronDownIcon class="size-3.5 shrink-0" />
            <FolderOpenIcon class="size-3.5 text-primary shrink-0" />
          {:else}
            <ChevronRightIcon class="size-3.5 shrink-0" />
            <FolderIcon class="size-3.5 text-muted-foreground shrink-0" />
          {/if}
          <span class="truncate capitalize">{node.name}</span>
        </button>

        <div class="flex items-center gap-0.5 shrink-0">
          {#if node.count !== undefined}
            <span class="text-[10px] font-mono text-muted-foreground px-1 py-0.2 rounded bg-muted/80 mr-0.5">
              {node.count}
            </span>
          {/if}

          <!-- Quick Actions on Folder -->
          <div class="opacity-0 group-hover/dir:opacity-100 group-focus-within/dir:opacity-100 flex items-center transition-opacity">
            <button
              type="button"
              onclick={() => openCreateFile(node.path)}
              title="Buat Berkas di Folder Ini"
              aria-label="Buat Berkas di Folder Ini"
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
            >
              <PlusIcon class="size-3" />
            </button>
            <button
              type="button"
              onclick={() => openRename(node.path, node.name, true)}
              title="Ubah Nama Folder"
              aria-label="Ubah Nama Folder"
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <PencilIcon class="size-3" />
            </button>
            <button
              type="button"
              onclick={() => openDelete(node.path, node.name, true)}
              title="Hapus Folder"
              aria-label="Hapus Folder"
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
            >
              <Trash2Icon class="size-3" />
            </button>
          </div>
        </div>
      </div>

      {#if isOpen && node.children}
        <div class="flex flex-col">
          {#each node.children as child (child.id)}
            {@render treeNode(child, depth + 1)}
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    {@const cid = node.conceptId || node.id}
    {@const isSelected = selectedId === cid}
    <div
      class="flex items-center justify-between gap-1 py-0.5 px-1.5 rounded-md text-xs transition-colors group/file {isSelected
        ? 'bg-primary/15 text-primary font-semibold'
        : 'text-foreground/85 hover:bg-muted/60 hover:text-foreground'}"
      style={`padding-left: ${depth * 12 + 16}px`}
    >
      <button
        type="button"
        data-testid="vault-file"
        onclick={() => {
          const cid = node.conceptId || node.id;
          if (node.conceptType === 'Diagram' || cid.startsWith('diagrams/') || node.name.endsWith('.mmd')) {
            goto(`/mermaid?conceptId=${encodeURIComponent(cid)}&title=${encodeURIComponent(node.title || node.name)}`);
            return;
          }
          if (node.conceptType === 'Drawing' || cid.startsWith('drawings/') || node.name.endsWith('.tldr')) {
            const slug = cid.split('/').pop()?.replace(/\.tldr$/, '') || cid;
            goto(`/canvas?id=${encodeURIComponent(slug)}&title=${encodeURIComponent(node.title || node.name)}`);
            return;
          }
          onSelect(cid);
        }}
        class="flex items-center gap-1.5 min-w-0 flex-1 text-left py-1"
      >
        {#if node.conceptType === 'Diagram' || cid.startsWith('diagrams/')}
          <GitGraphIcon class="size-3.5 shrink-0 text-amber-400" />
        {:else if node.conceptType === 'Drawing' || cid.startsWith('drawings/')}
          <PenToolIcon class="size-3.5 shrink-0 text-emerald-400" />
        {:else}
          <FileTextIcon
            class="size-3.5 shrink-0 {isSelected ? 'text-primary' : 'text-muted-foreground'}"
          />
        {/if}
        <span class="truncate">{node.title || node.name}</span>
      </button>

      <!-- Quick Actions on File -->
      <div class="opacity-0 group-hover/file:opacity-100 group-focus-within/file:opacity-100 flex items-center transition-opacity shrink-0">
        <button
          type="button"
          onclick={() => openRename(node.path, node.name, false)}
          title="Ubah Nama Berkas"
          aria-label="Ubah Nama Berkas"
          class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <PencilIcon class="size-3" />
        </button>
        <button
          type="button"
          onclick={() => openDelete(node.path, node.title || node.name, false)}
          title="Hapus Berkas"
          aria-label="Hapus Berkas"
          class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Trash2Icon class="size-3" />
        </button>
      </div>
    </div>
  {/if}
{/snippet}

<aside
  data-testid="vault-explorer"
  class="flex flex-col h-full w-full bg-card border-r border-border select-none overflow-hidden"
>
  <!-- Explorer Header with Full CRUD Creation Tools -->
  <div class="flex items-center justify-between px-2.5 py-2 border-b border-border gap-1 shrink-0">
    <span class="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold truncate">
      Berkas Vault
    </span>

    <div class="flex items-center gap-0.5 shrink-0">
      <Button
        variant="ghost"
        size="xs"
        onclick={() => openCreateFile('')}
        title="Buat Berkas Baru"
        aria-label="Buat Berkas Baru"
        class="h-6 px-1.5 text-[11px] gap-1"
      >
        <FilePlusIcon class="size-3.5 text-primary" />
        <span class="hidden sm:inline">Berkas</span>
      </Button>

      <Button
        variant="ghost"
        size="xs"
        onclick={() => openCreateFolder('')}
        title="Buat Folder Baru"
        aria-label="Buat Folder Baru"
        class="h-6 px-1.5 text-[11px] gap-1"
      >
        <FolderPlusIcon class="size-3.5 text-primary" />
        <span class="hidden sm:inline">Folder</span>
      </Button>

      <Button
        variant="ghost"
        size="xs"
        onclick={() => expandAll(tree, false)}
        title="Tutup Semua Folder"
        class="h-6 w-6 p-0 text-xs text-muted-foreground"
      >
        -
      </Button>
      <Button
        variant="ghost"
        size="xs"
        onclick={() => expandAll(tree, true)}
        title="Buka Semua Folder"
        class="h-6 w-6 p-0 text-xs text-muted-foreground"
      >
        +
      </Button>
    </div>
  </div>

  <!-- Search Filter -->
  <div class="p-2 border-b border-border shrink-0">
    <Input
      type="search"
      placeholder="Filter berkas..."
      bind:value={filterText}
      class="h-7 text-xs bg-background"
    />
  </div>

  <!-- Smooth Native Momentum Scroll Container -->
  <div
    data-testid="vault-tree-scroll"
    class="flex-1 min-h-0 w-full overflow-y-auto p-1.5 overscroll-contain"
  >
    <div class="flex flex-col gap-0.5" role="tree" aria-label="Pohon Berkas Vault">
      {#each visibleTree as node (node.id)}
        {@render treeNode(node, 0)}
      {/each}
    </div>
  </div>
</aside>

<!-- Modal: Buat Berkas Baru -->
<Dialog.Root bind:open={createFileDialogOpen}>
  <Dialog.Content class="bg-card border-border text-foreground sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="text-base font-semibold">Buat Berkas Baru</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Tambah Dokumen Markdown, Diagram Mermaid, atau Kanvas Whiteboard ke dalam Vault.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3 py-2 text-xs">
      {#if errorMessage}
        <div class="p-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 font-mono text-xs">
          {errorMessage}
        </div>
      {/if}

      <!-- Pilihan Jenis Berkas -->
      <div class="flex flex-col gap-1.5">
        <label for="new-file-kind-select" class="font-mono text-muted-foreground uppercase text-[10px]">Tipe Berkas</label>
        <div id="new-file-kind-select" class="grid grid-cols-3 gap-1.5">
          <Button
            variant={newFileKind === 'document' ? 'default' : 'outline'}
            size="sm"
            onclick={() => (newFileKind = 'document')}
            class="h-8 gap-1 text-xs"
          >
            <FileTextIcon class="size-3.5" />
            <span>Dokumen</span>
          </Button>
          <Button
            variant={newFileKind === 'mermaid' ? 'default' : 'outline'}
            size="sm"
            onclick={() => (newFileKind = 'mermaid')}
            class="h-8 gap-1 text-xs"
          >
            <GitGraphIcon class="size-3.5" />
            <span>Mermaid</span>
          </Button>
          <Button
            variant={newFileKind === 'drawing' ? 'default' : 'outline'}
            size="sm"
            onclick={() => (newFileKind = 'drawing')}
            class="h-8 gap-1 text-xs"
          >
            <PenToolIcon class="size-3.5" />
            <span>Kanvas</span>
          </Button>
        </div>
      </div>

      <!-- Folder Target Tree Picker -->
      <FolderTreePicker {tree} bind:selectedPath={newFileFolder} label="Pilih Folder Tujuan (Pohon Direktori)" />

      <!-- Nama Berkas (slug) -->
      <div class="flex flex-col gap-1">
        <label for="new-file-slug-input" class="font-mono text-muted-foreground uppercase text-[10px]">Nama Berkas (Slug)</label>
        <Input
          id="new-file-slug-input"
          type="text"
          bind:value={newFileName}
          placeholder="contoh: arsitektur-sistem-baru"
          class="h-8 text-xs bg-background"
        />
        <span class="text-[10px] font-mono text-muted-foreground">Otomatis ditambah ekstensi .md</span>
      </div>

      <!-- Judul Konsep -->
      <div class="flex flex-col gap-1">
        <label for="new-file-title-input" class="font-mono text-muted-foreground uppercase text-[10px]">Judul Tampilan</label>
        <Input
          id="new-file-title-input"
          type="text"
          bind:value={newFileTitle}
          placeholder="contoh: Arsitektur Sistem Baru"
          class="h-8 text-xs bg-background"
        />
      </div>

      <!-- Tipe Konsep (hanya jika dokumen) -->
      {#if newFileKind === 'document'}
        <div class="flex flex-col gap-1">
          <label for="new-concept-type-select" class="font-mono text-muted-foreground uppercase text-[10px]">Kategori Konsep</label>
          <select
            id="new-concept-type-select"
            bind:value={newFileType}
            class="bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="Concept">Concept</option>
            <option value="Project">Project</option>
            <option value="Decision">Decision</option>
            <option value="Commitment">Commitment</option>
            <option value="Person">Person</option>
            <option value="Persona">Persona</option>
            <option value="Journal">Journal</option>
          </select>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="gap-2 sm:gap-0">
      <Button variant="ghost" size="sm" onclick={() => (createFileDialogOpen = false)}>
        Batal
      </Button>
      <Button variant="default" size="sm" disabled={actionLoading} onclick={handleCreateFile}>
        {actionLoading ? 'Membuat...' : 'Buat Berkas'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Modal: Buat Folder Baru -->
<Dialog.Root bind:open={createFolderDialogOpen}>
  <Dialog.Content class="bg-card border-border text-foreground sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="text-base font-semibold">Buat Folder Baru</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Tambah folder baru untuk mengorganisasi berkas di dalam Vault.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3 py-2 text-xs">
      {#if errorMessage}
        <div class="p-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 font-mono text-xs">
          {errorMessage}
        </div>
      {/if}

      <!-- Folder Induk Tree Picker -->
      <FolderTreePicker {tree} bind:selectedPath={newFolderParent} label="Pilih Folder Induk (Pohon Direktori)" />

      <div class="flex flex-col gap-1">
        <label for="new-folder-name-input" class="font-mono text-muted-foreground uppercase text-[10px]">Nama Folder</label>
        <Input
          id="new-folder-name-input"
          type="text"
          bind:value={newFolderName}
          placeholder="contoh: riset-ai"
          class="h-8 text-xs bg-background"
        />
      </div>
    </div>

    <Dialog.Footer class="gap-2 sm:gap-0">
      <Button variant="ghost" size="sm" onclick={() => (createFolderDialogOpen = false)}>
        Batal
      </Button>
      <Button variant="default" size="sm" disabled={actionLoading} onclick={handleCreateFolder}>
        {actionLoading ? 'Membuat...' : 'Buat Folder'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Modal: Ubah Nama (Rename) -->
<Dialog.Root bind:open={renameDialogOpen}>
  <Dialog.Content class="bg-card border-border text-foreground sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="text-base font-semibold">
        Ubah Nama {renameIsDirectory ? 'Folder' : 'Berkas'}
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground font-mono">
        {renameTargetPath}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-3 py-2 text-xs">
      {#if errorMessage}
        <div class="p-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 font-mono text-xs">
          {errorMessage}
        </div>
      {/if}

      <div class="flex flex-col gap-1">
        <label for="rename-target-input" class="font-mono text-muted-foreground uppercase text-[10px]">Nama Baru</label>
        <Input
          id="rename-target-input"
          type="text"
          bind:value={renameNewName}
          class="h-8 text-xs bg-background"
        />
      </div>
    </div>

    <Dialog.Footer class="gap-2 sm:gap-0">
      <Button variant="ghost" size="sm" onclick={() => (renameDialogOpen = false)}>
        Batal
      </Button>
      <Button variant="default" size="sm" disabled={actionLoading} onclick={handleRename}>
        {actionLoading ? 'Menyimpan...' : 'Simpan Nama'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Modal: Konfirmasi Hapus (Delete) -->
<Dialog.Root bind:open={deleteDialogOpen}>
  <Dialog.Content class="bg-card border-border text-foreground sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="text-base font-semibold text-red-400">
        Hapus {deleteIsDirectory ? 'Folder' : 'Berkas'}?
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        {#if deleteIsDirectory}
          Folder <span class="font-mono text-foreground font-bold">{deleteTargetTitle}</span> dan seluruh berkas di dalamnya akan dihapus permanen dari Vault.
        {:else}
          Berkas <span class="font-mono text-foreground font-bold">{deleteTargetTitle}</span> akan dihapus permanen dari Vault.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if errorMessage}
      <div class="p-2 rounded bg-red-500/15 border border-red-500/30 text-red-300 font-mono text-xs">
        {errorMessage}
      </div>
    {/if}

    <Dialog.Footer class="gap-2 sm:gap-0">
      <Button variant="ghost" size="sm" onclick={() => (deleteDialogOpen = false)}>
        Batal
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={actionLoading}
        onclick={handleDelete}
      >
        {actionLoading ? 'Menghapus...' : 'Hapus Permanen'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
