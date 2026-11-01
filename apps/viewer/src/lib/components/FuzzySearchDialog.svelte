<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Fuse from 'fuse.js';
  import * as Command from '$lib/components/ui/command';
  import { Badge } from '$lib/components/ui/badge';
  import { studio } from '$lib/stores/studio.svelte';
  import type { OKFConcept, OKFGraph } from '$lib/types';

  interface Props {
    onSelect?: (conceptId: string) => void;
  }

  let { onSelect }: Props = $props();

  let concepts = $state<OKFConcept[]>([]);
  let query = $state('');

  let fuse = $derived(
    new Fuse(concepts, {
      keys: [
        { name: 'title', weight: 0.45 },
        { name: 'slug', weight: 0.25 },
        { name: 'tags', weight: 0.15 },
        { name: 'description', weight: 0.1 },
        { name: 'body', weight: 0.05 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
    })
  );

  let results = $derived.by(() => {
    const q = query.trim();
    if (!q) return concepts.slice(0, 20);
    return fuse.search(q, { limit: 20 }).map((r) => r.item);
  });

  async function loadGraph() {
    if (!studio.session) return;
    try {
      const q = studio.getVaultQuery();
      const res = await fetch(`/api/vault/graph${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as OKFGraph;
      concepts = data.nodes || [];
      if (data.stats) {
        studio.stats = {
          concepts: data.stats.concepts,
          edges: data.stats.edges,
        };
      }
    } catch {
      // ignore fetch errors when unauthenticated
    }
  }

  onMount(() => {
    loadGraph();

    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        studio.searchOpen = !studio.searchOpen;
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  $effect(() => {
    const _v = studio.vaultVersion;
    const _vid = studio.activeVaultId;
    if (studio.session) {
      loadGraph();
    }
  });

  function chooseConcept(item: OKFConcept) {
    studio.searchOpen = false;
    if (item.type === 'Diagram' || item.id.startsWith('diagrams/')) {
      goto(`/mermaid?conceptId=${encodeURIComponent(item.id)}&title=${encodeURIComponent(item.title)}`);
      return;
    }
    if (item.type === 'Drawing' || item.id.startsWith('drawings/')) {
      const slug = item.slug || item.id.split('/').pop() || item.id;
      goto(`/canvas?id=${encodeURIComponent(slug)}&title=${encodeURIComponent(item.title)}`);
      return;
    }
    studio.selectConcept(item.id);
    onSelect?.(item.id);
    if (page.url.pathname !== '/') {
      goto('/');
    }
  }
</script>

<Command.Dialog bind:open={studio.searchOpen} title="Cari Konsep OKF" description="Cari konsep di Second Brain Donna">
  <Command.Input placeholder="Cari konsep, keputusan, orang, proyek..." bind:value={query} />
  <Command.List class="max-h-80">
    <Command.Empty>Tidak ditemukan konsep yang cocok.</Command.Empty>
    <Command.Group heading="Konsep Vault">
      {#each results as item (item.id)}
        <Command.Item
          value={`${item.title} ${item.slug} ${item.type} ${(item.tags || []).join(' ')}`}
          onSelect={() => chooseConcept(item)}
          class="flex items-center justify-between gap-2 cursor-pointer"
        >
          <div class="flex flex-col min-w-0">
            <span class="font-medium truncate">{item.title}</span>
            <span class="text-xs text-muted-foreground font-mono truncate">{item.id}</span>
          </div>
          <Badge variant="secondary" class="shrink-0 text-[10px] font-mono">{item.type}</Badge>
        </Command.Item>
      {/each}
    </Command.Group>
  </Command.List>
</Command.Dialog>
