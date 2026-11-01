<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import FolderIcon from '@lucide/svelte/icons/folder';
  import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
  import CheckIcon from '@lucide/svelte/icons/check';
  import SparklesIcon from '@lucide/svelte/icons/sparkles';
  import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

  interface ServerFolderItem {
    name: string;
    path: string;
    isOkf: boolean;
    hasOkfSubfolder: boolean;
    hasChildren: boolean;
  }

  interface Props {
    selectedPath: string;
    onSelectPath: (path: string, suggestedName?: string) => void;
  }

  let { selectedPath = $bindable(''), onSelectPath }: Props = $props();

  let currentPath = $state('');
  let parentPath = $state<string | null>(null);
  let folders = $state<ServerFolderItem[]>([]);
  let loading = $state(false);
  let error = $state('');

  async function loadFolder(targetPath?: string | null) {
    loading = true;
    error = '';
    try {
      const q = targetPath ? `?path=${encodeURIComponent(targetPath)}` : '';
      const res = await fetch(`/api/system/folders${q}`);
      const data = (await res.json()) as {
        ok: boolean;
        currentPath?: string;
        parentPath?: string | null;
        folders?: ServerFolderItem[];
        error?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal membaca folder');
      }

      currentPath = data.currentPath || '';
      parentPath = data.parentPath ?? null;
      folders = data.folders || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Gagal mengakses folder';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    // If selectedPath exists, start from its parent or itself, else start from ~/projects
    if (selectedPath) {
      loadFolder(selectedPath);
    } else {
      loadFolder();
    }
  });

  function deriveVaultName(fullPath: string): string {
    const segments = fullPath.replace(/\/+$/, '').split('/');
    let last = segments.pop() || '';
    if (last === '.okf' && segments.length > 0) {
      last = segments.pop() || 'Vault';
    }
    // Prettify name
    return last
      .split(/[-_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function handleChoose(folder: ServerFolderItem) {
    let finalPath = folder.path;
    if (folder.hasOkfSubfolder && !folder.path.endsWith('.okf')) {
      finalPath = `${folder.path}/.okf`;
    }
    selectedPath = finalPath;
    const suggested = deriveVaultName(finalPath);
    onSelectPath(finalPath, suggested);
  }

  function handleSelectCurrent() {
    if (!currentPath) return;
    selectedPath = currentPath;
    const suggested = deriveVaultName(currentPath);
    onSelectPath(currentPath, suggested);
  }
</script>

<div class="flex flex-col gap-2 w-full text-xs">
  <div class="flex items-center justify-between">
    <span class="font-mono text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
      Jelajahi Pohon Folder Server
    </span>

    <!-- Quick Location Presets -->
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => loadFolder('/home/ubuntu/projects')}
        class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
        title="Buka /home/ubuntu/projects"
      >
        projects
      </button>
      <button
        type="button"
        onclick={() => loadFolder('/home/ubuntu/.donna')}
        class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
        title="Buka /home/ubuntu/.donna"
      >
        .donna
      </button>
      <button
        type="button"
        onclick={() => loadFolder('/home/ubuntu')}
        class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
        title="Buka /home/ubuntu"
      >
        ~ home
      </button>
    </div>
  </div>

  <!-- Breadcrumb & Navigation Bar -->
  <div class="flex items-center gap-1 bg-muted/30 p-1.5 rounded-md border border-border">
    {#if parentPath}
      <Button
        variant="ghost"
        size="icon-xs"
        onclick={() => loadFolder(parentPath)}
        class="size-6 shrink-0 text-muted-foreground hover:text-foreground"
        title="Naik 1 Level Folder"
        disabled={loading}
      >
        <ArrowUpIcon class="size-3.5" />
      </Button>
    {/if}

    <div class="flex-1 font-mono text-[11px] truncate text-foreground/90 px-1" title={currentPath}>
      {currentPath || 'Memuat...'}
    </div>

    <Button
      variant="outline"
      size="xs"
      onclick={handleSelectCurrent}
      class="h-6 px-2 text-[10px] gap-1 shrink-0 font-mono text-primary border-primary/30 hover:bg-primary/10"
      title="Pilih folder saat ini sebagai vault"
    >
      <CheckIcon class="size-3" />
      <span>Pilih Folder Ini</span>
    </Button>

    <Button
      variant="ghost"
      size="icon-xs"
      onclick={() => loadFolder(currentPath)}
      class="size-6 shrink-0 text-muted-foreground hover:text-foreground"
      title="Muat Ulang Folder"
      disabled={loading}
    >
      <RotateCwIcon class="size-3 {loading ? 'animate-spin' : ''}" />
    </Button>
  </div>

  <!-- Folder Directory Listing -->
  <div class="max-h-48 overflow-y-auto rounded-md border border-border bg-background/50 p-1 space-y-0.5 font-mono text-xs">
    {#if loading}
      <div class="py-4 text-center text-muted-foreground text-xs flex items-center justify-center gap-2">
        <RotateCwIcon class="size-3.5 animate-spin text-primary" />
        <span>Membaca direktori...</span>
      </div>
    {:else if error}
      <div class="py-3 text-center text-destructive text-xs">
        {error}
      </div>
    {:else if folders.length === 0}
      <div class="py-4 text-center text-muted-foreground text-xs">
        Tidak ada subfolder di dalam direktori ini
      </div>
    {:else}
      {#each folders as folder (folder.path)}
        {@const isChosen = selectedPath === folder.path || selectedPath === `${folder.path}/.okf`}
        <div
          class="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded transition-colors {isChosen
            ? 'bg-primary/15 border border-primary/30 text-primary'
            : folder.isOkf
              ? 'hover:bg-primary/5 text-foreground'
              : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'}"
        >
          <!-- Enter Folder / Open Subdir -->
          <button
            type="button"
            class="flex items-center gap-1.5 min-w-0 flex-1 text-left"
            onclick={() => loadFolder(folder.path)}
            title="Klik untuk membuka isi folder {folder.name}"
          >
            {#if folder.isOkf}
              <FolderOpenIcon class="size-3.5 text-primary shrink-0" />
            {:else}
              <FolderIcon class="size-3.5 text-muted-foreground shrink-0" />
            {/if}

            <span class="truncate font-mono text-[11px] {folder.isOkf ? 'font-semibold text-foreground' : ''}">
              {folder.name}
            </span>

            {#if folder.isOkf}
              <Badge variant="secondary" class="text-[9px] px-1 py-0 h-3.5 font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-0.5 shrink-0">
                <SparklesIcon class="size-2.5" />
                <span>OKF</span>
              </Badge>
            {/if}
          </button>

          <!-- Action Buttons -->
          <div class="flex items-center gap-1 shrink-0">
            {#if folder.isOkf}
              <Button
                variant={isChosen ? 'default' : 'outline'}
                size="xs"
                class="h-6 px-1.5 text-[10px] gap-1 font-mono {isChosen ? '' : 'text-primary border-primary/30 hover:bg-primary/10'}"
                onclick={() => handleChoose(folder)}
              >
                <CheckIcon class="size-3" />
                <span>{isChosen ? 'Terpilih' : 'Pilih'}</span>
              </Button>
            {:else}
              <button
                type="button"
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                onclick={() => loadFolder(folder.path)}
                title="Buka subfolder"
              >
                <ChevronRightIcon class="size-3" />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Selected Path Indicator -->
  {#if selectedPath}
    <div class="flex items-center gap-1.5 text-[11px] bg-primary/10 border border-primary/30 p-2 rounded-md">
      <CheckIcon class="size-3.5 text-primary shrink-0" />
      <div class="min-w-0 flex-1">
        <span class="text-[10px] font-mono uppercase text-primary/80 block font-semibold">Path Vault Terpilih:</span>
        <span class="font-mono text-foreground font-semibold truncate block text-xs">{selectedPath}</span>
      </div>
    </div>
  {/if}
</div>
