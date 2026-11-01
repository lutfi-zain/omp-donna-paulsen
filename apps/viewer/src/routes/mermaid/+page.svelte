<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import * as Popover from '$lib/components/ui/popover';
  import { studio } from '$lib/stores/studio.svelte';
  import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
  import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import SaveIcon from '@lucide/svelte/icons/save';
  import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
  import PlusIcon from '@lucide/svelte/icons/plus';

  interface MermaidVaultItem {
    key: string;
    conceptId: string;
    title: string;
    category: 'diagram' | 'concept';
    blockIndex: number;
    code: string;
  }

  const DEFAULT_DIAGRAM = `flowchart TD
  A[Donna Paulsen] --> B[OKF Vault]
  B --> C[Knowledge Graph]
  B --> D[Markdown Reader]
  B --> E[Mermaid Studio]`;

  let title = $state('Arsitektur Donna OKF');
  let activeConceptId = $state<string>('');
  let activeBlockIndex = $state<number>(0);
  let code = $state(DEFAULT_DIAGRAM);
  let svgOutput = $state('');
  let renderError = $state('');
  let zoom = $state(1);
  let saving = $state(false);
  let statusMsg = $state('');
  let vaultDiagrams = $state<MermaidVaultItem[]>([]);
  let loadPopoverOpen = $state(false);
  let editorHost = $state<HTMLDivElement | null>(null);
  let splitContainer = $state<HTMLDivElement | null>(null);
  let splitRatio = $state(45);
  let isDragging = $state(false);
  let isDesktop = $state(true);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let replaceEditorDoc: ((newDoc: string) => void) | null = null;
  let insertAtCursor: ((snippet: string) => void) | null = null;
  let unindentLine: (() => void) | null = null;
  function startResize(e: PointerEvent) {
    isDragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveResize(e: PointerEvent) {
    if (!isDragging || !splitContainer) return;
    const rect = splitContainer.getBoundingClientRect();
    const rawPct = isDesktop
      ? ((e.clientX - rect.left) / rect.width) * 100
      : ((e.clientY - rect.top) / rect.height) * 100;
    splitRatio = Math.min(85, Math.max(15, Math.round(rawPct * 10) / 10));
  }

  function stopResize(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  async function fetchVaultDiagrams() {
    try {
      const q = studio.getVaultQuery();
      const res = await fetch(`/api/vault/mermaid${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; items?: MermaidVaultItem[] };
      if (data.items) {
        vaultDiagrams = data.items;
      }
    } catch {
      // ignore
    }
  }

  async function renderMermaid(diagramCode: string) {
    if (!browser || !diagramCode.trim()) return;
    try {
      const mermaidMod = await import('mermaid');
      const mermaid = mermaidMod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      });
      const id = `mermaid-studio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const { svg } = await mermaid.render(id, diagramCode.trim());
      svgOutput = svg;
      renderError = '';
    } catch (err) {
      renderError = err instanceof Error ? err.message : 'Sintaks Mermaid tidak valid';
    }
  }

  function loadTemplate(tplTitle: string, tplCode: string) {
    title = tplTitle;
    activeConceptId = '';
    activeBlockIndex = 0;
    code = tplCode;
    replaceEditorDoc?.(tplCode);
    renderMermaid(tplCode);
  }

  function loadFromVaultItem(item: MermaidVaultItem) {
    title = item.title;
    activeConceptId = item.conceptId;
    activeBlockIndex = item.blockIndex;
    code = item.code;
    replaceEditorDoc?.(item.code);
    renderMermaid(item.code);
    loadPopoverOpen = false;
    statusMsg = `Dimuat: ${item.title}`;
    setTimeout(() => {
      statusMsg = '';
    }, 2500);
  }

  async function saveToVault(asNew = false) {
    if (!code.trim()) return;
    saving = true;
    statusMsg = '';
    try {
      const q = studio.getVaultQuery();
      const res = await fetch(`/api/vault/mermaid${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          code,
          conceptId: asNew ? undefined : activeConceptId || undefined,
          blockIndex: activeBlockIndex,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        conceptId?: string;
        title?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal menyimpan diagram');
      }
      if (data.conceptId) {
        activeConceptId = data.conceptId;
      }
      statusMsg = 'Tersimpan ke Vault';
      await fetchVaultDiagrams();
      setTimeout(() => {
        statusMsg = '';
      }, 3000);
    } catch (err) {
      statusMsg = err instanceof Error ? err.message : 'Gagal menyimpan';
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    const queryCode = page.url.searchParams.get('code');
    const queryConceptId = page.url.searchParams.get('conceptId');
    const queryTitle = page.url.searchParams.get('title');
    const queryBlockIdx = page.url.searchParams.get('blockIndex');

    if (queryCode) code = queryCode;
    if (queryConceptId) activeConceptId = queryConceptId;
    if (queryTitle) title = queryTitle;
    if (queryBlockIdx) activeBlockIndex = Number(queryBlockIdx) || 0;

    if (queryConceptId && !queryCode) {
      (async () => {
        try {
          const q = studio.getVaultQuery();
          const res = await fetch(`/api/vault/concept/${encodeURIComponent(queryConceptId)}${q}`);
          if (res.ok) {
            const data = (await res.json()) as { title?: string; body?: string };
            if (data.title) title = data.title;
            const match = /```mermaid\r?\n([\s\S]*?)```/.exec(data.body || '');
            if (match) {
              code = match[1].trim();
              replaceEditorDoc?.(code);
              renderMermaid(code);
            }
          }
        } catch {
          // ignore
        }
      })();
    }

    fetchVaultDiagrams();
    renderMermaid(code);
    function updateViewportMode() {
      isDesktop = window.innerWidth >= 768;
    }
    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);

    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveToVault(false);
      }
    }
    window.addEventListener('keydown', handleKeydown);

    let destroyCm: (() => void) | null = null;

    (async () => {
      if (!editorHost) return;
      const [
        { EditorState },
        {
          EditorView,
          keymap,
          lineNumbers,
          highlightActiveLine,
          highlightActiveLineGutter,
          drawSelection,
          rectangularSelection,
        },
        {
          defaultKeymap,
          history,
          historyKeymap,
          indentWithTab,
          indentMore,
          indentLess,
          moveLineUp,
          moveLineDown,
          copyLineUp,
          copyLineDown,
          deleteLine,
        },
        { indentOnInput, indentUnit, bracketMatching },
        { searchKeymap, highlightSelectionMatches, selectNextOccurrence },
        { markdown },
      ] = await Promise.all([
        import('@codemirror/state'),
        import('@codemirror/view'),
        import('@codemirror/commands'),
        import('@codemirror/language'),
        import('@codemirror/search'),
        import('@codemirror/lang-markdown'),
      ]);

      if (!editorHost) return;

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const nextCode = update.state.doc.toString();
          code = nextCode;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            renderMermaid(nextCode);
          }, 200);
        }
      });

      const vscodeKeymap = [
        {
          key: 'Tab',
          run: (view: InstanceType<typeof EditorView>) => {
            const { state } = view;
            if (state.selection.ranges.some((r) => !r.empty)) {
              return indentMore(view);
            }
            view.dispatch(state.update(state.replaceSelection('  '), { scrollIntoView: true, userEvent: 'input' }));
            return true;
          },
          shift: indentLess,
        },
        indentWithTab,
        { key: 'Alt-ArrowUp', run: moveLineUp },
        { key: 'Alt-ArrowDown', run: moveLineDown },
        { key: 'Shift-Alt-ArrowUp', run: copyLineUp },
        { key: 'Shift-Alt-ArrowDown', run: copyLineDown },
        { key: 'Mod-Shift-k', run: deleteLine },
        { key: 'Mod-d', run: selectNextOccurrence },
        {
          key: 'Mod-/',
          run: (view: InstanceType<typeof EditorView>) => {
            const { state } = view;
            const changes = state.changeByRange((range) => {
              const line = state.doc.lineAt(range.from);
              const trimmed = line.text.trimStart();
              const leadingLen = line.text.length - trimmed.length;
              const pos = line.from + leadingLen;
              if (trimmed.startsWith('%%')) {
                const removeLen = trimmed.startsWith('%% ') ? 3 : 2;
                return {
                  changes: { from: pos, to: pos + removeLen, insert: '' },
                  range,
                };
              }
              return {
                changes: { from: pos, to: pos, insert: '%% ' },
                range,
              };
            });
            view.dispatch(state.update(changes, { userEvent: 'input' }));
            return true;
          },
        },
      ];

      const darkTheme = EditorView.theme(
        {
          '&': {
            backgroundColor: '#0d1218',
            color: '#e2e8f0',
            height: '100%',
            fontSize: '13px',
            fontFamily: "'JetBrains Mono', monospace",
          },
          '.cm-content': {
            caretColor: '#38bdf8',
            padding: '12px 0',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(56, 189, 248, 0.07)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
          },
          '.cm-selectionBackground, ::selection': {
            backgroundColor: 'rgba(56, 189, 248, 0.25) !important',
          },
          '.cm-gutters': {
            backgroundColor: '#080b0f',
            color: '#64748b',
            borderRight: '1px solid #1e2a3d',
          },
        },
        { dark: true }
      );

      const state = EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          rectangularSelection(),
          indentOnInput(),
          indentUnit.of('  '),
          bracketMatching(),
          highlightSelectionMatches(),
          history(),
          keymap.of([...vscodeKeymap, ...searchKeymap, ...defaultKeymap, ...historyKeymap]),
          markdown(),
          darkTheme,
          updateListener,
        ],
      });

      const view = new EditorView({
        state,
        parent: editorHost,
      });

      replaceEditorDoc = (newDoc: string) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newDoc },
        });
      };

      insertAtCursor = (snippet: string) => {
        view.dispatch(
          view.state.update(view.state.replaceSelection(snippet), {
            scrollIntoView: true,
            userEvent: 'input',
          })
        );
        view.focus();
      };

      unindentLine = () => {
        indentLess(view);
        view.focus();
      };

      destroyCm = () => view.destroy();
    })();

    return () => {
      window.removeEventListener('resize', updateViewportMode);
      window.removeEventListener('keydown', handleKeydown);
      if (debounceTimer) clearTimeout(debounceTimer);
      replaceEditorDoc = null;
      destroyCm?.();
    };
  });

  function exportSvg() {
    if (!svgOutput) return;
    const blob = new Blob([svgOutput], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mermaid'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    if (!svgOutput) return;
    const img = new Image();
    const svgBlob = new Blob([svgOutput], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 800;
      canvas.height = img.height || 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#080b0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mermaid'}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
</script>

<div class="flex-1 min-h-0 w-full max-w-full flex flex-col bg-background overflow-hidden">
  <!-- Studio Topbar -->
  <div class="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border bg-card shrink-0">
    <div class="flex items-center gap-2 min-w-0 flex-1 max-w-lg">
      <Badge variant="default" class="font-mono text-xs shrink-0">MERMAID</Badge>
      <Input
        type="text"
        bind:value={title}
        placeholder="Judul Diagram..."
        aria-label="Judul Diagram Mermaid"
        class="h-7 text-xs bg-background border-border"
      />
      {#if activeConceptId}
        <Badge variant="outline" class="font-mono text-[10px] shrink-0 hidden sm:inline-flex">
          {activeConceptId}
        </Badge>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      {#if statusMsg}
        <span
          data-testid="mermaid-toast"
          class="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-xs font-mono text-emerald-300"
        >
          {statusMsg}
        </span>
      {/if}

      <Button
        variant="ghost"
        size="xs"
        onclick={() =>
          loadTemplate(
            `Diagram Baru ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
            DEFAULT_DIAGRAM
          )}
        title="Diagram Baru"
      >
        <PlusIcon data-icon="inline-start" />
        <span class="hidden sm:inline">Baru</span>
      </Button>

      <!-- Load from Vault Popover -->
      <Popover.Root bind:open={loadPopoverOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button variant="outline" size="xs" data-testid="btn-load-mermaid" {...props}>
              <FolderOpenIcon data-icon="inline-start" />
              <span>Muat dari Vault ({vaultDiagrams.length})</span>
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-80 bg-card border-border text-foreground p-2" align="end">
          <div class="text-[11px] font-mono uppercase text-muted-foreground px-2 py-1">
            Diagram Mermaid di Vault
          </div>
          {#if vaultDiagrams.length === 0}
            <div class="text-xs text-muted-foreground px-2 py-3 text-center">
              Belum ada diagram tersimpan di Vault.
            </div>
          {:else}
            <div class="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {#each vaultDiagrams as item (item.key)}
                <button
                  type="button"
                  data-testid="mermaid-vault-item"
                  onclick={() => loadFromVaultItem(item)}
                  class="flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded hover:bg-muted transition-colors"
                >
                  <div class="flex flex-col min-w-0">
                    <span class="text-xs font-medium truncate">{item.title}</span>
                    <span class="text-[10px] font-mono text-muted-foreground truncate">
                      {item.conceptId}
                    </span>
                  </div>
                  <Badge variant="secondary" class="text-[10px] font-mono shrink-0">
                    {item.category === 'diagram' ? 'Diagram' : 'Konsep'}
                  </Badge>
                </button>
              {/each}
            </div>
          {/if}
        </Popover.Content>
      </Popover.Root>

      <!-- Save to Vault Button -->
      <Button
        variant="default"
        size="xs"
        data-testid="btn-save-mermaid"
        disabled={saving}
        onclick={() => saveToVault(false)}
      >
        <SaveIcon data-icon="inline-start" />
        <span>{saving ? 'Menyimpan...' : 'Simpan ke Vault'}</span>
      </Button>

      <!-- Zoom & Export Controls -->
      <Button variant="outline" size="icon-xs" onclick={() => (zoom = Math.max(0.4, zoom - 0.2))} aria-label="Zoom Out">
        <ZoomOutIcon />
      </Button>
      <span class="text-xs font-mono text-muted-foreground w-10 text-center hidden sm:inline">
        {Math.round(zoom * 100)}%
      </span>
      <Button variant="outline" size="icon-xs" onclick={() => (zoom = Math.min(2.5, zoom + 0.2))} aria-label="Zoom In">
        <ZoomInIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" onclick={() => (zoom = 1)} aria-label="Reset Zoom">
        <RotateCcwIcon />
      </Button>
      <Button variant="secondary" size="xs" onclick={exportSvg}>
        <DownloadIcon data-icon="inline-start" />
        <span>SVG</span>
      </Button>
      <Button variant="outline" size="xs" onclick={exportPng}>
        <DownloadIcon data-icon="inline-start" />
        <span>PNG</span>
      </Button>
    </div>
  </div>

  <!-- Resizable Split View -->
  <div
    bind:this={splitContainer}
    class="flex-1 min-h-0 w-full flex flex-col md:flex-row overflow-hidden {isDragging ? 'select-none' : ''}"
  >
    <!-- Left / Top: CodeMirror 6 Editor + Starter Templates -->
    <div
      data-testid="mermaid-editor-pane"
      style={isDesktop ? `width: ${splitRatio}%` : `height: ${splitRatio}%`}
      class="w-full md:h-full shrink-0 overflow-hidden flex flex-col"
    >
      <div class="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 border-b border-border bg-card/60 text-xs shrink-0">
        <div class="flex flex-wrap items-center gap-1">
          <Button
            variant="secondary"
            size="xs"
            class="h-6 px-2 text-[11px] font-mono"
            onclick={() => insertAtCursor?.('  ')}
            title="Indent 2 Spasi (Tab)"
          >
            ⇥ Tab
          </Button>
          <Button
            variant="outline"
            size="xs"
            class="h-6 px-2 text-[11px] font-mono"
            onclick={() => unindentLine?.()}
            title="Unindent (Shift+Tab)"
          >
            ⇤
          </Button>
          <Button
            variant="outline"
            size="xs"
            class="h-6 px-2 text-[11px] font-mono"
            onclick={() => insertAtCursor?.(' --> ')}
          >
            --&gt;
          </Button>
          <Button
            variant="outline"
            size="xs"
            class="h-6 px-2 text-[11px] font-mono"
            onclick={() => insertAtCursor?.('[Node]')}
          >
            [Box]
          </Button>
          <Button
            variant="outline"
            size="xs"
            class="h-6 px-2 text-[11px] font-mono"
            onclick={() => insertAtCursor?.('{Kondisi}')}
          >
            &#123;If&#125;
          </Button>
          <Button
            variant="outline"
            size="xs"
            class="h-6 px-2 text-[11px] font-mono"
            onclick={() => insertAtCursor?.('%% ')}
          >
            %%
          </Button>

          <span class="h-3.5 w-px bg-border mx-1"></span>

          {#each [
            {
              label: 'Flowchart',
              code: `flowchart TD\n  A[Input] --> B{Keputusan}\n  B -->|Ya| C[Eksekusi]\n  B -->|Tidak| D[Evaluasi]`,
            },
            {
              label: 'Sequence',
              code: `sequenceDiagram\n  participant L as Lutfi\n  participant D as Donna\n  participant V as OKF Vault\n  L->>D: Catat keputusan\n  D->>V: Simpan konsep .md\n  V-->>D: SSE vault_updated`,
            },
            {
              label: 'Mindmap',
              code: `mindmap\n  root((Donna OKF))\n    Proyek\n      membran.app\n      FinnPlan\n    Kuliah SI\n      Metopen\n      Etika TI`,
            },
            {
              label: 'ER Diagram',
              code: `erDiagram\n  CONCEPT ||--o{ LINK : references\n  CONCEPT {\n    string id\n    string title\n    string type\n  }`,
            },
          ] as tpl (tpl.label)}
            <Button
              variant="ghost"
              size="xs"
              class="h-6 px-2 text-[11px] font-mono"
              onclick={() => {
                code = tpl.code;
                replaceEditorDoc?.(tpl.code);
                renderMermaid(tpl.code);
              }}
            >
              {tpl.label}
            </Button>
          {/each}
        </div>

        <span class="text-[10px] font-mono text-muted-foreground shrink-0 hidden lg:inline">
          {Math.round(splitRatio)}% / {Math.round(100 - splitRatio)}%
        </span>
      </div>
      <div bind:this={editorHost} class="flex-1 w-full h-full overflow-auto"></div>
    </div>

    <!-- Interactive Drag Resizer Handle -->
    <div
      role="slider"
      tabindex="0"
      aria-label="Pengatur ukuran panel"
      aria-valuenow={Math.round(splitRatio)}
      aria-valuemin={20}
      aria-valuemax={80}
      data-testid="mermaid-resizer"
      onpointerdown={startResize}
      onpointermove={moveResize}
      onpointerup={stopResize}
      onpointercancel={stopResize}
      ondblclick={() => (splitRatio = 50)}
      class="group relative shrink-0 flex items-center justify-center h-3 w-full md:w-2.5 md:h-full bg-card border-y md:border-y-0 md:border-x border-border cursor-row-resize md:cursor-col-resize hover:bg-primary/15 transition-colors z-10 touch-none {isDragging
        ? 'bg-primary/25 border-primary/50'
        : ''}"
      title="Geser untuk mengubah ukuran panel · Klik 2x untuk 50/50"
    >
      <div
        class="rounded-full transition-colors h-1 w-10 md:w-1 md:h-10 {isDragging
          ? 'bg-primary'
          : 'bg-muted-foreground/40 group-hover:bg-primary'}"
      ></div>
    </div>

    <!-- Right / Bottom: Live SVG Preview -->
    <div
      data-testid="mermaid-preview"
      class="flex-1 min-w-0 min-h-0 bg-background overflow-auto flex items-center justify-center p-6"
    >
      {#if renderError}
        <pre class="text-xs font-mono text-red-400 whitespace-pre-wrap max-w-full">{renderError}</pre>
      {:else if svgOutput}
        <div
          class="transition-transform origin-center"
          style={`transform: scale(${zoom})`}
        >
          {@html svgOutput}
        </div>
      {:else}
        <span class="text-xs font-mono text-muted-foreground">Menyiapkan diagram...</span>
      {/if}
    </div>
  </div>
</div>
