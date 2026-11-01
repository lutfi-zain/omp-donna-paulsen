<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Sheet from '$lib/components/ui/sheet';
  import { studio } from '$lib/stores/studio.svelte';
  import type { OKFConcept, OKFGraph } from '$lib/types';
  import MaximizeIcon from '@lucide/svelte/icons/maximize-2';
  import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
  import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
  import BookOpenIcon from '@lucide/svelte/icons/book-open';

  let cyContainer = $state<HTMLDivElement | null>(null);
  let graphData = $state<OKFGraph | null>(null);
  let layoutName = $state<'cose' | 'concentric' | 'circle' | 'breadthfirst' | 'grid'>('cose');
  let typeFilter = $state<string>('all');
  let selectedNode = $state<OKFConcept | null>(null);
  let sheetOpen = $state(false);

  const TYPE_COLORS: Record<string, string> = {
    Person: '#38bdf8',
    Project: '#34d399',
    Decision: '#fbbf24',
    Commitment: '#f87171',
    Persona: '#c084fc',
    Concept: '#94a3b8',
  };

  function getColor(type: string): string {
    return TYPE_COLORS[type] || '#38bdf8';
  }

  let cyRef: {
    fit: () => void;
    zoom: (level?: number) => number;
    layout: (opts: { name: string; animate?: boolean; padding?: number }) => { run: () => void };
    destroy: () => void;
  } | null = null;

  async function initGraph(container: HTMLDivElement, filter: string, currentLayout: string) {
    const q = studio.getVaultQuery();
    const res = await fetch(`/api/vault/graph${q}`);
    if (!res.ok) return;
    const data = (await res.json()) as OKFGraph;
    graphData = data;
    const cytoscapeMod = await import('cytoscape');
    const cytoscape = cytoscapeMod.default;

    if (cyRef) {
      cyRef.destroy();
      cyRef = null;
    }

    const filteredNodes =
      filter === 'all' ? data.nodes : data.nodes.filter((n) => n.type === filter);
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    const elements = [
      ...filteredNodes.map((n) => ({
        data: {
          id: n.id,
          label: n.title,
          type: n.type,
          color: getColor(n.type),
        },
      })),
      ...filteredEdges.map((e, idx) => ({
        data: {
          id: `edge-${idx}`,
          source: e.source,
          target: e.target,
        },
      })),
    ];

    const instance = cytoscape({
      container,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#e2e8f0',
            'font-size': '11px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 24,
            height: 24,
            'border-width': 2,
            'border-color': '#0d1218',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#334155',
            'target-arrow-color': '#334155',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#38bdf8',
          },
        },
      ],
      layout: {
        name: currentLayout,
      },
    });

    instance.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id();
      const found = data.nodes.find((n) => n.id === nodeId) || null;
      if (found) {
        selectedNode = found;
        sheetOpen = true;
      }
    });

    cyRef = instance as unknown as typeof cyRef;
  }

  $effect(() => {
    if (!browser || !cyContainer) return;
    const _vid = studio.activeVaultId;
    initGraph(cyContainer, typeFilter, layoutName);
    return () => {
      cyRef?.destroy();
      cyRef = null;
    };
  });

  function openInReader(id: string) {
    studio.selectConcept(id);
    sheetOpen = false;
    goto('/');
  }
</script>

<div class="flex-1 min-h-0 w-full max-w-full flex flex-col bg-background overflow-hidden">
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border bg-card shrink-0">
    <div class="flex flex-wrap items-center gap-2 min-w-0">
      <label class="flex items-center gap-1 text-xs font-mono text-muted-foreground">
        <span>Layout:</span>
        <select
          bind:value={layoutName}
          class="bg-background border border-border rounded px-1.5 py-1 text-xs text-foreground max-w-[125px] sm:max-w-xs truncate"
        >
          <option value="cose">Force-Directed (Cose)</option>
          <option value="concentric">Concentric</option>
          <option value="circle">Circle</option>
          <option value="breadthfirst">Breadthfirst</option>
          <option value="grid">Grid</option>
        </select>
      </label>

      <label class="flex items-center gap-1 text-xs font-mono text-muted-foreground">
        <span>Tipe:</span>
        <select
          bind:value={typeFilter}
          class="bg-background border border-border rounded px-1.5 py-1 text-xs text-foreground max-w-[125px] sm:max-w-xs truncate"
        >
          <option value="all">Semua Tipe</option>
          {#each graphData?.stats.types || [] as t (t)}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="flex items-center gap-1.5">
      <Button variant="outline" size="xs" onclick={() => cyRef?.fit()}>
        <MaximizeIcon data-icon="inline-start" />
        <span>Fit</span>
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        onclick={() => cyRef && cyRef.zoom(cyRef.zoom() * 1.25)}
        aria-label="Zoom In"
      >
        <ZoomInIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        onclick={() => cyRef && cyRef.zoom(cyRef.zoom() * 0.8)}
        aria-label="Zoom Out"
      >
        <ZoomOutIcon />
      </Button>
    </div>
  </div>

  <!-- Cytoscape Canvas -->
  {#if browser}
    <div
      id="cy"
      bind:this={cyContainer}
      class="flex-1 w-full h-full min-h-[480px] bg-background"
    ></div>
  {/if}

  <!-- Concept Inspector Sheet -->
  <Sheet.Root bind:open={sheetOpen}>
    <Sheet.Content side="right" class="bg-card border-border text-foreground w-80 sm:w-96 p-5 flex flex-col gap-4">
      <Sheet.Header>
        <div class="flex items-center gap-2 mb-1">
          {#if selectedNode}
            <Badge variant="default" class="font-mono text-xs">{selectedNode.type}</Badge>
            <Badge variant="outline" class="font-mono text-xs">{selectedNode.status || 'unverified'}</Badge>
          {/if}
        </div>
        <Sheet.Title class="text-lg font-bold">{selectedNode?.title || 'Detail Konsep'}</Sheet.Title>
        <Sheet.Description class="text-xs font-mono text-muted-foreground">
          {selectedNode?.id || ''}
        </Sheet.Description>
      </Sheet.Header>

      {#if selectedNode}
        <div class="flex flex-col gap-3 flex-1 overflow-y-auto text-sm">
          {#if selectedNode.description}
            <p class="text-muted-foreground leading-relaxed">{selectedNode.description}</p>
          {/if}
          <div class="text-xs font-mono text-muted-foreground">
            {selectedNode.links?.length || 0} tautan keluar · {selectedNode.backlinks?.length || 0} tautan masuk
          </div>
        </div>

        <Sheet.Footer>
          <Button variant="default" class="w-full" onclick={() => selectedNode && openInReader(selectedNode.id)}>
            <BookOpenIcon data-icon="inline-start" />
            <span>Buka di Reader</span>
          </Button>
        </Sheet.Footer>
      {/if}
    </Sheet.Content>
  </Sheet.Root>
</div>
