<script lang="ts">
  import type { VaultTreeNode } from '$lib/types';
  import { Input } from '$lib/components/ui/input';
  import FolderIcon from '@lucide/svelte/icons/folder';
  import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import CheckIcon from '@lucide/svelte/icons/check';
  import SearchIcon from '@lucide/svelte/icons/search';

  interface Props {
    tree: VaultTreeNode[];
    selectedPath: string;
    allowRoot?: boolean;
    label?: string;
  }

  let {
    tree,
    selectedPath = $bindable(''),
    allowRoot = true,
    label = 'Folder Tujuan'
  }: Props = $props();

  let searchQuery = $state('');
  let expanded = $state<Record<string, boolean>>({});

  // Filter only directory nodes
  function getDirectoryNodes(nodes: VaultTreeNode[]): VaultTreeNode[] {
    const dirs: VaultTreeNode[] = [];
    for (const n of nodes) {
      if (n.type === 'directory') {
        const childDirs = n.children ? getDirectoryNodes(n.children) : [];
        dirs.push({
          ...n,
          children: childDirs,
        });
      }
    }
    return dirs;
  }

  let dirTree = $derived(getDirectoryNodes(tree));

  function nodeMatches(node: VaultTreeNode, query: string): boolean {
    if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) {
      return true;
    }
    if (node.children) {
      return node.children.some((c) => nodeMatches(c, query));
    }
    return false;
  }

  function filterDirs(nodes: VaultTreeNode[], query: string): VaultTreeNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    const result: VaultTreeNode[] = [];
    for (const n of nodes) {
      if (nodeMatches(n, q)) {
        const childFiltered = n.children ? filterDirs(n.children, q) : [];
        result.push({
          ...n,
          children: childFiltered,
        });
      }
    }
    return result;
  }

  let visibleDirs = $derived(filterDirs(dirTree, searchQuery));

  function toggleExpand(path: string, e: MouseEvent) {
    e.stopPropagation();
    expanded = {
      ...expanded,
      [path]: !expanded[path],
    };
  }

  function select(path: string) {
    selectedPath = path;
  }
</script>

<div class="flex flex-col gap-1.5 w-full">
  <div class="flex items-center justify-between">
    <span class="font-mono text-muted-foreground uppercase text-[10px] tracking-wider">
      {label}
    </span>
    {#if selectedPath}
      <button
        type="button"
        onclick={() => (selectedPath = '')}
        class="text-[10px] text-primary hover:underline font-mono"
      >
        Pilih Root (/)
      </button>
    {/if}
  </div>

  <!-- Search Filter -->
  <div class="relative">
    <SearchIcon class="size-3.5 absolute left-2 top-2 text-muted-foreground pointer-events-none" />
    <Input
      type="search"
      placeholder="Cari folder..."
      bind:value={searchQuery}
      class="h-7.5 pl-7 text-xs bg-background"
    />
  </div>

  <!-- Tree Explorer Container -->
  <div class="max-h-44 overflow-y-auto rounded-md border border-border bg-background/50 p-1 space-y-0.5 text-xs">
    {#if allowRoot && !searchQuery.trim()}
      <button
        type="button"
        class="w-full text-left px-2 py-1.5 rounded flex items-center gap-1.5 text-xs font-mono transition-colors {selectedPath === ''
          ? 'bg-primary/15 text-primary font-semibold border border-primary/30'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
        onclick={() => select('')}
      >
        <FolderIcon class="size-3.5 text-muted-foreground shrink-0" />
        <span class="truncate">/ (Root Vault)</span>
        {#if selectedPath === ''}
          <CheckIcon class="size-3 text-primary ml-auto shrink-0" />
        {/if}
      </button>
    {/if}

    {#snippet dirItem(node: VaultTreeNode, depth: number)}
      {@const isSelected = selectedPath === node.path}
      {@const hasChildren = node.children && node.children.length > 0}
      {@const isOpen = searchQuery.trim().length > 0 ? true : expanded[node.path] ?? (depth === 0)}

      <div class="flex flex-col">
        <button
          type="button"
          class="w-full text-left py-1 px-1.5 rounded flex items-center gap-1 text-xs transition-colors {isSelected
            ? 'bg-primary/15 text-primary font-semibold border border-primary/30'
            : 'text-foreground/90 hover:bg-muted/50'}"
          style={`padding-left: ${depth * 14 + 6}px`}
          onclick={() => select(node.path)}
        >
          {#if hasChildren}
            <span
              role="button"
              tabindex="0"
              class="p-0.5 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground shrink-0"
              onclick={(e) => toggleExpand(node.path, e)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  expanded[node.path] = !isOpen;
                }
              }}
              title={isOpen ? 'Tutup subfolder' : 'Buka subfolder'}
            >
              {#if isOpen}
                <ChevronDownIcon class="size-3" />
              {:else}
                <ChevronRightIcon class="size-3" />
              {/if}
            </span>
          {:else}
            <span class="size-4 shrink-0"></span>
          {/if}

          {#if isOpen}
            <FolderOpenIcon class="size-3.5 text-primary shrink-0" />
          {:else}
            <FolderIcon class="size-3.5 text-muted-foreground shrink-0" />
          {/if}

          <span class="truncate min-w-0 flex-1 font-mono text-[11px]">{node.name}</span>

          {#if node.count !== undefined && node.count > 0}
            <span class="text-[9px] font-mono text-muted-foreground px-1 py-0.2 rounded bg-muted/60 shrink-0">
              {node.count}
            </span>
          {/if}

          {#if isSelected}
            <CheckIcon class="size-3 text-primary ml-auto shrink-0" />
          {/if}
        </button>

        {#if isOpen && hasChildren}
          <div class="flex flex-col">
            {#each node.children as child (child.path)}
              {@render dirItem(child, depth + 1)}
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}

    {#if visibleDirs.length === 0}
      <div class="py-3 text-center text-xs text-muted-foreground font-mono">
        Tidak ada folder yang cocok
      </div>
    {:else}
      {#each visibleDirs as dir (dir.path)}
        {@render dirItem(dir, 0)}
      {/each}
    {/if}
  </div>

  <!-- Breadcrumb Preview -->
  <div class="flex items-center gap-1.5 text-[11px] bg-muted/30 px-2.5 py-1.5 rounded border border-border overflow-hidden">
    <span class="font-mono text-muted-foreground shrink-0 text-[10px] uppercase">Lokasi:</span>
    <span class="font-mono text-foreground font-medium truncate text-xs">
      {selectedPath ? `/${selectedPath}/` : '/ (Root Vault)'}
    </span>
  </div>
</div>
