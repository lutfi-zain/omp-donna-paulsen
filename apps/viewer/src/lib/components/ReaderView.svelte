<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import katex from 'katex';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import DocMinimap from '$lib/components/DocMinimap.svelte';
  import MermaidInline from '$lib/components/MermaidInline.svelte';
  import { studio } from '$lib/stores/studio.svelte';
  import type { OKFConcept } from '$lib/types';
  import Volume2Icon from '@lucide/svelte/icons/volume-2';
  import SquarePenIcon from '@lucide/svelte/icons/square-pen';
  import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
  import GitGraphIcon from '@lucide/svelte/icons/git-graph';
  import PenToolIcon from '@lucide/svelte/icons/pen-tool';
  interface Props {
    concept: OKFConcept;
    onEdit: () => void;
    onNavigateConcept: (conceptId: string) => void;
  }

  let { concept, onEdit, onNavigateConcept }: Props = $props();

  let markdownEl = $state<HTMLDivElement | null>(null);
  let extractedSentences = $state<string[]>([]);

  interface ContentBlock {
    type: 'markdown' | 'mermaid';
    content: string;
    mermaidIndex?: number;
  }

  function renderMathInMarkdown(md: string): string {
    // Block math $$...$$
    let out = md.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
      try {
        return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return _m;
      }
    });
    // Inline math $...$
    out = out.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_m, tex: string) => {
      try {
        return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return _m;
      }
    });
    return out;
  }

  function parseBlocks(rawBody: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const regex = /```mermaid\r?\n([\s\S]*?)```/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    let mIdx = 0;

    while ((match = regex.exec(rawBody)) !== null) {
      if (match.index > lastIdx) {
        blocks.push({
          type: 'markdown',
          content: rawBody.slice(lastIdx, match.index),
        });
      }
      blocks.push({
        type: 'mermaid',
        content: match[1],
        mermaidIndex: mIdx++,
      });
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < rawBody.length) {
      blocks.push({
        type: 'markdown',
        content: rawBody.slice(lastIdx),
      });
    }

    return blocks.length > 0 ? blocks : [{ type: 'markdown', content: rawBody }];
  }

  function renderHtml(md: string): string {
    const withMath = renderMathInMarkdown(md);
    const rawHtml = marked.parse(withMath, { async: false }) as string;
    if (browser) {
      return DOMPurify.sanitize(rawHtml);
    }
    return rawHtml;
  }

  let blocks = $derived(parseBlocks(concept.body || ''));

  // Wrap sentences in .tts-sentence spans after render so user can click-to-read and TTSDock can highlight
  $effect(() => {
    void concept.id;
    void concept.body;
    if (!browser || !markdownEl) return;

    const sentences: string[] = [];
    const textContainers = markdownEl.querySelectorAll('p, li');
    let sentenceIndex = 0;

    for (const el of Array.from(textContainers)) {
      if (el.querySelector('code, pre, .katex')) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;

      const parts = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1);

      if (parts.length === 0) continue;

      el.innerHTML = '';
      parts.forEach((part, idx) => {
        const span = document.createElement('span');
        const currentIdx = sentenceIndex++;
        sentences.push(part);
        span.className =
          'tts-sentence cursor-pointer rounded px-0.5 transition-colors hover:bg-primary/15';
        span.dataset.sentenceIndex = String(currentIdx);
        span.textContent = part + (idx < parts.length - 1 ? ' ' : '');
        span.addEventListener('click', () => {
          studio.playTTS(sentences, currentIdx, concept.title);
        });
        el.appendChild(span);
      });
    }

    extractedSentences = sentences;
  });

  // Highlight active sentence when studio.ttsCurrentIndex updates
  $effect(() => {
    const activeIdx = studio.ttsActive ? studio.ttsCurrentIndex : -1;
    if (!browser || !markdownEl) return;
    const spans = markdownEl.querySelectorAll('.tts-sentence');
    spans.forEach((sp) => {
      const idx = Number((sp as HTMLElement).dataset.sentenceIndex);
      if (idx === activeIdx) {
        sp.classList.add('is-reading', 'bg-primary/25', 'text-primary');
      } else {
        sp.classList.remove('is-reading', 'bg-primary/25', 'text-primary');
      }
    });
  });

  function startReadAloud() {
    if (extractedSentences.length > 0) {
      studio.playTTS(extractedSentences, 0, concept.title);
    } else {
      const fallback = (concept.body || concept.title)
        .replace(/[#*`>\-_]/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (fallback.length > 0) {
        studio.playTTS(fallback, 0, concept.title);
      }
    }
  }

  let widthClass = $derived(
    studio.readerMaxWidth === 'full'
      ? 'max-w-none'
      : studio.readerMaxWidth === 'wide'
        ? 'max-w-5xl'
        : 'max-w-3xl'
  );
</script>

<div class="relative w-full">
  <DocMinimap container={markdownEl} contentKey={`${concept.id}:${concept.body.length}`} />

  <article class="mx-auto w-full {widthClass} px-4 sm:px-8 py-6 sm:py-8 flex flex-col gap-6">
    <!-- Header & Metadata -->
    <header class="flex flex-col gap-3 pb-5 border-b border-border">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="default" class="font-mono text-xs">{concept.type}</Badge>
        <Badge variant="outline" class="font-mono text-xs capitalize">
          {concept.status || 'unverified'}
        </Badge>
        {#if concept.stale_after}
          <Badge variant="secondary" class="font-mono text-xs">
            Stale: {concept.stale_after}
          </Badge>
        {/if}
        <span class="text-xs font-mono text-muted-foreground ml-auto">{concept.id}</span>
      </div>

      <div class="flex items-start justify-between gap-4">
        <h1
          data-testid="concept-title"
          class="text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight"
        >
          {concept.title}
        </h1>

        <div class="flex items-center gap-2 shrink-0">
          {#if concept.type === 'Diagram' || concept.id.startsWith('diagrams/')}
            <Button
              variant="default"
              size="sm"
              data-testid="btn-edit-mode"
              onclick={() => goto(`/mermaid?conceptId=${encodeURIComponent(concept.id)}&title=${encodeURIComponent(concept.title)}`)}
            >
              <GitGraphIcon data-icon="inline-start" />
              <span>Mermaid Studio</span>
            </Button>
          {:else if concept.type === 'Drawing' || concept.id.startsWith('drawings/')}
            <Button
              variant="default"
              size="sm"
              data-testid="btn-edit-mode"
              onclick={() => {
                const slug = concept.slug || concept.id.split('/').pop() || concept.id;
                goto(`/canvas?id=${encodeURIComponent(slug)}&title=${encodeURIComponent(concept.title)}`);
              }}
            >
              <PenToolIcon data-icon="inline-start" />
              <span>Buka Kanvas</span>
            </Button>
          {:else}
            <Button variant="outline" size="sm" onclick={startReadAloud}>
              <Volume2Icon data-icon="inline-start" />
              <span class="hidden sm:inline">Listen</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="btn-edit-mode"
              onclick={onEdit}
            >
              <SquarePenIcon data-icon="inline-start" />
              <span>Edit</span>
            </Button>
          {/if}
        </div>
      </div>

      {#if concept.description}
        <p class="text-sm text-muted-foreground leading-relaxed">{concept.description}</p>
      {/if}

      {#if concept.tags && concept.tags.length > 0}
        <div class="flex flex-wrap gap-1.5 pt-1">
          {#each concept.tags as tag (tag)}
            <Badge variant="secondary" class="text-[11px] font-mono">#{tag}</Badge>
          {/each}
        </div>
      {/if}
    </header>

    <!-- Interactive Studio Launch Card for Diagrams and Drawings -->
    {#if concept.type === 'Diagram' || concept.id.startsWith('diagrams/')}
      <div class="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <GitGraphIcon class="size-6 text-amber-400 shrink-0" />
          <div class="flex flex-col min-w-0">
            <span class="font-medium text-foreground text-sm truncate">Diagram Mermaid Interaktif</span>
            <span class="text-xs text-muted-foreground font-mono truncate">{concept.id}</span>
          </div>
        </div>
        <Button variant="default" size="sm" onclick={() => goto(`/mermaid?conceptId=${encodeURIComponent(concept.id)}&title=${encodeURIComponent(concept.title)}`)}>
          <GitGraphIcon data-icon="inline-start" />
          <span>Buka di Mermaid Studio</span>
        </Button>
      </div>
    {:else if concept.type === 'Drawing' || concept.id.startsWith('drawings/')}
      <div class="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <PenToolIcon class="size-6 text-emerald-400 shrink-0" />
          <div class="flex flex-col min-w-0">
            <span class="font-medium text-foreground text-sm truncate">Kanvas Whiteboard (tldraw)</span>
            <span class="text-xs text-muted-foreground font-mono truncate">drawings/{concept.slug}.tldr</span>
          </div>
        </div>
        <Button variant="default" size="sm" onclick={() => {
          const slug = concept.slug || concept.id.split('/').pop() || concept.id;
          goto(`/canvas?id=${encodeURIComponent(slug)}&title=${encodeURIComponent(concept.title)}`);
        }}>
          <PenToolIcon data-icon="inline-start" />
          <span>Buka di Kanvas Whiteboard</span>
        </Button>
      </div>
    {/if}

    <!-- Markdown Content -->
    <div
      bind:this={markdownEl}
      data-testid="markdown-body"
      class="markdown-prose text-sm sm:text-base leading-relaxed flex flex-col gap-4"
    >
      {#each blocks as block, i (i)}
        {#if block.type === 'mermaid'}
          <MermaidInline code={block.content} conceptId={concept.id} title={concept.title} blockIndex={block.mermaidIndex ?? 0} />
        {:else}
          <div class="prose-chunk">{@html renderHtml(block.content)}</div>
        {/if}
      {/each}
    </div>

    <!-- Outgoing & Backlinks -->
    {#if (concept.links && concept.links.length > 0) || (concept.backlinks && concept.backlinks.length > 0)}
      <footer class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-border">
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Tautan Keluar ({concept.links?.length || 0})
          </h3>
          <div class="flex flex-col gap-1.5">
            {#each concept.links || [] as linkId (linkId)}
              <button
                type="button"
                onclick={() => onNavigateConcept(linkId)}
                class="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/50 text-xs font-mono text-left transition-colors"
              >
                <span class="truncate">{linkId}</span>
                <ArrowUpRightIcon class="size-3.5 text-primary shrink-0" />
              </button>
            {/each}
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Tautan Masuk ({concept.backlinks?.length || 0})
          </h3>
          <div class="flex flex-col gap-1.5">
            {#each concept.backlinks || [] as backId (backId)}
              <button
                type="button"
                onclick={() => onNavigateConcept(backId)}
                class="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/50 text-xs font-mono text-left transition-colors"
              >
                <span class="truncate">{backId}</span>
                <ArrowUpRightIcon class="size-3.5 text-primary shrink-0" />
              </button>
            {/each}
          </div>
        </div>
      </footer>
    {/if}
  </article>
</div>
