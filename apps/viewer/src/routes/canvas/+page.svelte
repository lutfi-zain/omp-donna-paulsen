<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import * as Popover from '$lib/components/ui/popover';
  import { studio } from '$lib/stores/studio.svelte';
  import SaveIcon from '@lucide/svelte/icons/save';
  import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import MousePointerIcon from '@lucide/svelte/icons/mouse-pointer';
  import HandIcon from '@lucide/svelte/icons/hand';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import EraserIcon from '@lucide/svelte/icons/eraser';
  import SquareIcon from '@lucide/svelte/icons/square';
  import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
  import TypeIcon from '@lucide/svelte/icons/type';
  import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
  import Undo2Icon from '@lucide/svelte/icons/undo-2';
  import Redo2Icon from '@lucide/svelte/icons/redo-2';

  interface SavedDrawingItem {
    id: string;
    title: string;
    fileName: string;
    updatedAt: string;
  }

  let container = $state<HTMLDivElement | null>(null);
  let title = $state('Sketsa Arsitektur OKF');
  let activeDrawingId = $state('');
  let activeTool = $state('select');
  let saving = $state(false);
  let statusMsg = $state('');
  let savedList = $state<SavedDrawingItem[]>([]);
  let loadPopoverOpen = $state(false);

  interface TldrawEditorLike {
    getCurrentPageShapeIds: () => Set<string>;
    getSvgString?: (
      shapes: string[],
      opts?: Record<string, unknown>
    ) => Promise<{ svg: string } | undefined>;
    loadSnapshot?: (snapshot: unknown) => void;
    getSnapshot?: () => unknown;
    setCurrentTool?: (id: string) => void;
    getCurrentToolId?: () => string;
    undo?: () => TldrawEditorLike;
    redo?: () => TldrawEditorLike;
    selectAll: () => TldrawEditorLike;
    deleteShapes: (ids: string[]) => TldrawEditorLike;
    user?: {
      updateUserPreferences?: (prefs: { colorScheme?: 'dark' | 'light' }) => void;
    };
    store: {
      getSnapshot?: () => unknown;
      loadSnapshot?: (snapshot: unknown) => void;
      serialize?: () => unknown;
    };
  }

  let editorRef: TldrawEditorLike | null = null;
  let loadSnapshotFn: ((store: unknown, snapshot: unknown) => void) | null = null;
  let getSnapshotFn: ((store: unknown) => unknown) | null = null;

  const QUICK_TOOLS = [
    { id: 'select', label: 'Pilih', icon: MousePointerIcon },
    { id: 'hand', label: 'Geser', icon: HandIcon },
    { id: 'draw', label: 'Pensil', icon: PencilIcon },
    { id: 'eraser', label: 'Hapus', icon: EraserIcon },
    { id: 'geo', label: 'Kotak', icon: SquareIcon },
    { id: 'arrow', label: 'Panah', icon: ArrowUpRightIcon },
    { id: 'text', label: 'Teks', icon: TypeIcon },
    { id: 'note', label: 'Catatan', icon: StickyNoteIcon },
  ];

  function selectTool(toolId: string) {
    activeTool = toolId;
    editorRef?.setCurrentTool?.(toolId);
  }

  async function fetchSavedDrawings() {
    try {
      const q = studio.getVaultQuery();
      const res = await fetch(`/api/vault/drawing${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; items?: SavedDrawingItem[] };
      if (data.items) savedList = data.items;
    } catch {
      // ignore
    }
  }

  onMount(() => {
    if (!browser || !container) return;
    fetchSavedDrawings();
    let unmountFn: (() => void) | null = null;

    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveToVault();
      }
    }
    window.addEventListener('keydown', handleKeydown);

    (async () => {
      await import('tldraw/tldraw.css');
      const [React, ReactDOMClient, tldrawMod] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('tldraw'),
      ]);

      const { Tldraw } = tldrawMod;
      if ('loadSnapshot' in tldrawMod && typeof tldrawMod.loadSnapshot === 'function') {
        loadSnapshotFn = tldrawMod.loadSnapshot as (store: unknown, snapshot: unknown) => void;
      }
      if ('getSnapshot' in tldrawMod && typeof tldrawMod.getSnapshot === 'function') {
        getSnapshotFn = tldrawMod.getSnapshot as (store: unknown) => unknown;
      }

      if (!container) return;
      const root = ReactDOMClient.createRoot(container);
      root.render(
        React.createElement(Tldraw, {
          persistenceKey: 'donna-okf-canvas',
          onMount: (editor: unknown) => {
            const ed = editor as TldrawEditorLike;
            editorRef = ed;
            try {
              ed.user?.updateUserPreferences?.({ colorScheme: 'dark' });
            } catch {
              // ignore
            }
            const queryId = page.url.searchParams.get('id');
            const queryTitle = page.url.searchParams.get('title');
            if (queryTitle) title = queryTitle;
            if (queryId) {
              activeDrawingId = queryId;
              loadDrawingFromVault({ id: queryId, title: queryTitle || queryId, fileName: `${queryId}.tldr`, updatedAt: '' });
            }
          },
        })
      );
      unmountFn = () => {
        root.unmount();
      };
    })();

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      unmountFn?.();
    };
  });

  async function saveToVault() {
    if (!editorRef) return;
    saving = true;
    statusMsg = '';
    try {
      const shapeIds = Array.from(editorRef.getCurrentPageShapeIds());
      let svgContent = '';
      if (shapeIds.length > 0 && editorRef.getSvgString) {
        try {
          const res = await editorRef.getSvgString(shapeIds);
          if (res?.svg) svgContent = res.svg;
        } catch {
          // continue saving snapshot even if SVG export fails
        }
      }

      const snapshot = getSnapshotFn
        ? getSnapshotFn(editorRef.store)
        : editorRef.getSnapshot
          ? editorRef.getSnapshot()
          : editorRef.store.getSnapshot
            ? editorRef.store.getSnapshot()
            : editorRef.store.serialize
              ? editorRef.store.serialize()
              : {};

      const q = studio.getVaultQuery();
      const resp = await fetch(`/api/vault/drawing${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeDrawingId || undefined,
          title,
          content: svgContent,
          snapshot,
        }),
      });
      if (!resp.ok) throw new Error('Gagal menyimpan kanvas');
      statusMsg = 'Tersimpan ke Vault';
      await fetchSavedDrawings();
      setTimeout(() => {
        statusMsg = '';
      }, 3000);
    } catch (err) {
      statusMsg = err instanceof Error ? err.message : 'Gagal menyimpan';
    } finally {
      saving = false;
    }
  }

  async function loadDrawingFromVault(item: SavedDrawingItem) {
    if (!editorRef) return;
    try {
      const q = studio.getVaultQuery('&');
      const res = await fetch(`/api/vault/drawing?id=${encodeURIComponent(item.id)}${q}`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        ok: boolean;
        data?: { title?: string; snapshot?: unknown } | Record<string, unknown>;
      };

      const rawData = body.data as { title?: string; snapshot?: unknown };
      const snap = rawData.snapshot ?? body.data;
      if (loadSnapshotFn) {
        loadSnapshotFn(editorRef.store, snap);
      } else if (editorRef.loadSnapshot) {
        editorRef.loadSnapshot(snap);
      } else if (editorRef.store.loadSnapshot) {
        editorRef.store.loadSnapshot(snap);
      }

      title = rawData.title || item.title;
      activeDrawingId = item.id;
      loadPopoverOpen = false;
      statusMsg = `Dimuat: ${title}`;
      setTimeout(() => {
        statusMsg = '';
      }, 2500);
    } catch {
      statusMsg = 'Gagal memuat kanvas';
    }
  }

  function newBlankCanvas() {
    if (!editorRef) return;
    const ids = Array.from(editorRef.getCurrentPageShapeIds());
    if (ids.length > 0) {
      editorRef.deleteShapes(ids);
    }
    activeDrawingId = '';
    title = `Kanvas Baru ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function exportSvgDownload() {
    if (!editorRef || !editorRef.getSvgString) return;
    const ids = Array.from(editorRef.getCurrentPageShapeIds());
    if (ids.length === 0) return;
    const res = await editorRef.getSvgString(ids);
    if (!res?.svg) return;
    const blob = new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="flex-1 min-h-0 w-full max-w-full flex flex-col bg-background overflow-hidden">
  <!-- Row 1: Vault Actions & Title -->
  <div class="flex flex-wrap items-center justify-between gap-1.5 px-2.5 sm:px-4 py-1.5 border-b border-border bg-card shrink-0 z-20">
    <div class="flex items-center gap-1.5 min-w-[140px] flex-1 max-w-md">
      <Badge variant="default" class="font-mono text-[10px] shrink-0">KANVAS</Badge>
      <Input
        type="text"
        bind:value={title}
        placeholder="Judul Kanvas..."
        aria-label="Judul Kanvas"
        class="h-7 text-xs bg-background border-border min-w-0 flex-1"
      />
    </div>

    <div class="flex items-center gap-1 shrink-0">
      {#if statusMsg}
        <span
          data-testid="canvas-toast"
          class="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-[11px] font-mono text-emerald-300"
        >
          {statusMsg}
        </span>
      {/if}

      <Button variant="ghost" size="xs" onclick={newBlankCanvas} title="Kanvas Kosong Baru" aria-label="Kanvas Baru">
        <PlusIcon class="size-3.5" />
        <span class="hidden sm:inline">Baru</span>
      </Button>

      <Popover.Root bind:open={loadPopoverOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button variant="outline" size="xs" {...props}>
              <FolderOpenIcon class="size-3.5" />
              <span>Muat ({savedList.length})</span>
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-72 bg-card border-border text-foreground p-2" align="end">
          <div class="text-[11px] font-mono uppercase text-muted-foreground px-2 py-1">
            Kanvas Tersimpan di Vault
          </div>
          {#if savedList.length === 0}
            <div class="text-xs text-muted-foreground px-2 py-3 text-center">
              Belum ada kanvas tersimpan.
            </div>
          {:else}
            <div class="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {#each savedList as item (item.id)}
                <button
                  type="button"
                  onclick={() => loadDrawingFromVault(item)}
                  class="flex flex-col text-left px-2.5 py-1.5 rounded hover:bg-muted transition-colors"
                >
                  <span class="text-xs font-medium truncate">{item.title}</span>
                  <span class="text-[10px] font-mono text-muted-foreground">
                    {item.fileName} · {new Date(item.updatedAt).toLocaleString('id-ID')}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </Popover.Content>
      </Popover.Root>

      <Button variant="outline" size="xs" onclick={exportSvgDownload} aria-label="Export SVG">
        <DownloadIcon class="size-3.5" />
        <span class="hidden sm:inline">SVG</span>
      </Button>
      <Button
        variant="default"
        size="xs"
        data-testid="btn-save-canvas"
        disabled={saving}
        onclick={saveToVault}
      >
        <SaveIcon class="size-3.5" />
        <span>{saving ? '...' : 'Simpan'}</span>
      </Button>
    </div>
  </div>

  <!-- Row 2: Always-Visible Drawing Tools Bar (Mobile + Desktop Friendly) -->
  <div
    data-testid="canvas-tools-bar"
    class="flex flex-wrap items-center gap-1 px-2.5 sm:px-4 py-1.5 border-b border-border bg-card/80 shrink-0 z-20"
  >
    {#each QUICK_TOOLS as tool (tool.id)}
      {@const Icon = tool.icon}
      <Button
        variant={activeTool === tool.id ? 'default' : 'ghost'}
        size="xs"
        onclick={() => selectTool(tool.id)}
        class="h-7 px-2 gap-1 text-xs shrink-0"
      >
        <Icon class="size-3.5" />
        <span>{tool.label}</span>
      </Button>
    {/each}

    <span class="h-4 w-px bg-border mx-1 shrink-0"></span>

    <Button
      variant="ghost"
      size="icon-xs"
      onclick={() => editorRef?.undo?.()}
      title="Undo"
      aria-label="Undo"
      class="shrink-0"
    >
      <Undo2Icon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      onclick={() => editorRef?.redo?.()}
      title="Redo"
      aria-label="Redo"
      class="shrink-0"
    >
      <Redo2Icon />
    </Button>
  </div>

  <!-- Full-size tldraw Workspace -->
  <div bind:this={container} class="flex-1 min-h-0 w-full h-full relative"></div>
</div>
