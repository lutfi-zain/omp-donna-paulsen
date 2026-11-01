<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';

  interface Props {
    code: string;
    conceptId?: string;
    title?: string;
    blockIndex?: number;
  }

  let { code, conceptId = '', title = '', blockIndex = 0 }: Props = $props();
  let svgHtml = $state<string>('');
  let errorMsg = $state<string>('');

  $effect(() => {
    if (!browser || !code.trim()) return;
    let cancelled = false;

    (async () => {
      try {
        const mermaidMod = await import('mermaid');
        const mermaid = mermaidMod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
        });
        const id = `mermaid-inline-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, code.trim());
        if (!cancelled) {
          svgHtml = svg;
          errorMsg = '';
        }
      } catch (err) {
        if (!cancelled) {
          errorMsg = err instanceof Error ? err.message : 'Diagram Mermaid tidak valid';
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  function openInStudio() {
    const params = new URLSearchParams();
    params.set('code', code);
    if (conceptId) params.set('conceptId', conceptId);
    if (title) params.set('title', title);
    params.set('blockIndex', String(blockIndex));
    goto(`/mermaid?${params.toString()}`);
  }
</script>

<div class="relative group my-4 rounded-xl border border-border bg-card p-4 overflow-x-auto">
  <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
    <Button variant="secondary" size="xs" onclick={openInStudio}>
      Edit di Mermaid Studio
    </Button>
  </div>

  {#if errorMsg}
    <pre class="text-xs font-mono text-red-400 whitespace-pre-wrap">{errorMsg}</pre>
  {:else if svgHtml}
    <div class="flex justify-center">{@html svgHtml}</div>
  {:else}
    <div class="text-xs font-mono text-muted-foreground py-4 text-center">Memuat diagram...</div>
  {/if}
</div>
