<script lang="ts">
  interface HeadingItem {
    id: string;
    text: string;
    level: number;
  }

  interface Props {
    container: HTMLElement | null;
    contentKey?: string;
  }

  let { container, contentKey = '' }: Props = $props();

  let headings = $state<HeadingItem[]>([]);
  let activeId = $state<string>('');
  let hovered = $state(false);

  const INDENT_MAP: Record<number, number> = {
    1: 0,
    2: 14,
    3: 26,
    4: 36,
  };

  $effect(() => {
    // Re-extract headings when container or contentKey changes
    void contentKey;
    if (!container) {
      headings = [];
      return;
    }

    const nodes = Array.from(container.querySelectorAll('h1, h2, h3, h4'));
    const extracted: HeadingItem[] = nodes.map((el, idx) => {
      if (!el.id) {
        const slug = (el.textContent || 'section')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        el.id = `heading-${idx}-${slug || idx}`;
      }
      const level = Number(el.tagName.slice(1)) || 2;
      return {
        id: el.id,
        text: (el.textContent || '').trim(),
        level,
      };
    });

    headings = extracted;
    if (extracted.length > 0 && !activeId) {
      activeId = extracted[0].id;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target.id) {
            activeId = entry.target.id;
            break;
          }
        }
      },
      { rootMargin: '-10% 0px -75% 0px', threshold: 0.1 }
    );

    for (const el of nodes) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  });

  function scrollToHeading(id: string) {
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      activeId = id;
    }
  }
</script>

{#if headings.length > 1}
  <nav
    aria-label="Garis Besar Dokumen"
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
    class="hidden xl:flex flex-col fixed right-5 top-24 z-20 transition-all duration-150 {hovered
      ? 'w-64 p-3 rounded-xl bg-card/95 border border-border shadow-xl backdrop-blur'
      : 'w-8 py-2 items-end'}"
  >
    {#if hovered}
      <div class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 px-1">
        Daftar Isi ({headings.length})
      </div>
      <div class="flex flex-col gap-1 max-h-96 overflow-y-auto">
        {#each headings as h (h.id)}
          {@const indent = INDENT_MAP[h.level] ?? 0}
          <button
            type="button"
            onclick={() => scrollToHeading(h.id)}
            style={`padding-left: ${indent + 6}px`}
            class="text-left text-xs py-1 pr-2 rounded transition-colors truncate {activeId === h.id
              ? 'text-primary font-semibold bg-primary/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
          >
            {h.text}
          </button>
        {/each}
      </div>
    {:else}
      <div class="flex flex-col gap-1.5 items-end pr-1">
        {#each headings as h (h.id)}
          {@const widthPx = h.level === 1 ? 20 : h.level === 2 ? 15 : h.level === 3 ? 11 : 8}
          <button
            type="button"
            onclick={() => scrollToHeading(h.id)}
            aria-label={h.text}
            style={`width: ${widthPx}px`}
            class="h-1 rounded-full transition-colors {activeId === h.id
              ? 'bg-primary'
              : 'bg-muted-foreground/40 hover:bg-muted-foreground'}"
          ></button>
        {/each}
      </div>
    {/if}
  </nav>
{/if}
