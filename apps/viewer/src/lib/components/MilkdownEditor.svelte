<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import katex from 'katex';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { studio } from '$lib/stores/studio.svelte';
  import SaveIcon from '@lucide/svelte/icons/save';
  import EyeIcon from '@lucide/svelte/icons/eye';
  import BoldIcon from '@lucide/svelte/icons/bold';
  import ItalicIcon from '@lucide/svelte/icons/italic';
  import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
  import CodeIcon from '@lucide/svelte/icons/code';
  import Heading1Icon from '@lucide/svelte/icons/heading-1';
  import Heading2Icon from '@lucide/svelte/icons/heading-2';
  import Heading3Icon from '@lucide/svelte/icons/heading-3';
  import ListIcon from '@lucide/svelte/icons/list';
  import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
  import QuoteIcon from '@lucide/svelte/icons/quote';
  import TableIcon from '@lucide/svelte/icons/table';
  import MinusIcon from '@lucide/svelte/icons/minus';
  import Columns2Icon from '@lucide/svelte/icons/columns-2';
  import FileCodeIcon from '@lucide/svelte/icons/file-code';
  import SparklesIcon from '@lucide/svelte/icons/sparkles';

  interface Props {
    conceptId: string;
    title: string;
    content: string;
    onSaved: (newBody: string) => void;
    onCancel: () => void;
  }

  let { conceptId, title, content = $bindable(''), onSaved, onCancel }: Props = $props();

  let editorMode = $state<'visual' | 'split' | 'source'>('visual');
  let editorRoot = $state<HTMLDivElement | null>(null);
  let cmRoot = $state<HTMLDivElement | null>(null);
  let saving = $state(false);
  let dirty = $state(false);
  let toastMessage = $state<string>('');

  // Synchronize between Milkdown and CodeMirror
  let getLiveMarkdown: (() => string) | null = null;
  let applyMarkdownToMilkdown: ((md: string) => void) | null = null;
  let execMilkdownFormat: ((actionType: string, payload?: string) => void) | null = null;
  let replaceCmDoc: ((md: string) => void) | null = null;

  let wordCount = $derived(
    content
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
  );
  let lineCount = $derived(content.split('\n').length);

  function renderPreviewHtml(md: string): string {
    if (!browser) return '';
    let withMath = md.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
      try {
        return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return _m;
      }
    });
    withMath = withMath.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_m, tex: string) => {
      try {
        return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return _m;
      }
    });
    const rawHtml = marked.parse(withMath, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml);
  }

  // Mount Milkdown when editorRoot is active (Visual mode)
  $effect(() => {
    if (!browser || !editorRoot || editorMode !== 'visual') return;
    let destroyed = false;
    let editorInstance: { destroy: () => Promise<unknown> } | null = null;

    (async () => {
      const [
        { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, parserCtx },
        { commonmark },
        { gfm },
        { listener, listenerCtx },
        { nord },
      ] = await Promise.all([
        import('@milkdown/core'),
        import('@milkdown/preset-commonmark'),
        import('@milkdown/preset-gfm'),
        import('@milkdown/plugin-listener'),
        import('@milkdown/theme-nord'),
      ]);

      if (destroyed || !editorRoot) return;

      const editor = await Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, editorRoot!);
          ctx.set(defaultValueCtx, content);
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            content = markdown;
            dirty = true;
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .create();

      editorInstance = editor;

      getLiveMarkdown = () => {
        let md = content;
        try {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const serializer = ctx.get(serializerCtx);
            md = serializer(view.state.doc);
          });
        } catch {
          // fallback to content
        }
        return md;
      };

      applyMarkdownToMilkdown = (newMd: string) => {
        try {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const serializer = ctx.get(serializerCtx);
            const doc = parser(newMd);
            if (doc) {
              const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
              view.dispatch(tr);
              content = serializer(view.state.doc);
            }
          });
        } catch {
          content = newMd;
        }
      };

      execMilkdownFormat = (actionType: string, payload?: string) => {
        try {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const serializer = ctx.get(serializerCtx);
            const parser = ctx.get(parserCtx);
            const { state, dispatch } = view;
            const { from, to, empty } = state.selection;
            const selectedText = state.doc.textBetween(from, to, ' ');

            if (actionType === 'bold' || actionType === 'italic' || actionType === 'strike' || actionType === 'code') {
              const markName =
                actionType === 'bold'
                  ? 'strong'
                  : actionType === 'italic'
                    ? 'emphasis'
                    : actionType === 'strike'
                      ? 'strike_through'
                      : 'inlineCode';
              const markType = state.schema.marks[markName];
              if (markType) {
                if (!empty) {
                  const hasMark = state.doc.rangeHasMark(from, to, markType);
                  if (hasMark) {
                    dispatch(state.tr.removeMark(from, to, markType));
                  } else {
                    dispatch(state.tr.addMark(from, to, markType.create()));
                  }
                } else {
                  const sample = actionType === 'code' ? 'kode' : 'teks';
                  const node = state.schema.text(sample, [markType.create()]);
                  dispatch(state.tr.replaceSelectionWith(node, false));
                }
                view.focus();
                content = serializer(view.state.doc);
                dirty = true;
                return;
              }
            }

            // Block-level insertions via Markdown re-parse so tables, code blocks, headings, lists render natively
            const currentMd = serializer(state.doc);
            const snippet = payload || (selectedText ? `# ${selectedText}` : '## Subjudul Baru');
            const nextMd = `${currentMd.trimEnd()}\n\n${snippet}\n`;
            const nextDoc = parser(nextMd);
            if (nextDoc) {
              dispatch(state.tr.replaceWith(0, state.doc.content.size, nextDoc.content));
              view.focus();
              content = serializer(view.state.doc);
              dirty = true;
            }
          });
        } catch {
          if (payload) {
            content = `${content.trimEnd()}\n\n${payload}\n`;
            dirty = true;
          }
        }
      };
    })();

    return () => {
      destroyed = true;
      getLiveMarkdown = null;
      applyMarkdownToMilkdown = null;
      execMilkdownFormat = null;
      editorInstance?.destroy();
    };
  });

  // Mount CodeMirror 6 when cmRoot is active (Split or Source mode)
  $effect(() => {
    if (!browser || !cmRoot || (editorMode !== 'split' && editorMode !== 'source')) return;
    let destroyed = false;
    let destroyCm: (() => void) | null = null;

    (async () => {
      const [
        { EditorState },
        { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter },
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

      if (destroyed || !cmRoot) return;

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          content = update.state.doc.toString();
          dirty = true;
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
      ];

      const darkTheme = EditorView.theme(
        {
          '&': {
            backgroundColor: '#0d1218',
            color: '#e2e8f0',
            height: '100%',
            minHeight: '440px',
            fontSize: '13.5px',
            fontFamily: "'JetBrains Mono', monospace",
          },
          '.cm-content': {
            caretColor: '#38bdf8',
            padding: '16px 8px',
            lineHeight: '1.65',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(56, 189, 248, 0.07)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
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
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          indentOnInput(),
          indentUnit.of('  '),
          bracketMatching(),
          highlightSelectionMatches(),
          history(),
          EditorView.lineWrapping,
          keymap.of([...vscodeKeymap, ...searchKeymap, ...defaultKeymap, ...historyKeymap]),
          markdown(),
          darkTheme,
          updateListener,
        ],
      });

      const view = new EditorView({
        state,
        parent: cmRoot,
      });

      replaceCmDoc = (newMd: string) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: newMd },
        });
      };

      destroyCm = () => view.destroy();
    })();

    return () => {
      destroyed = true;
      replaceCmDoc = null;
      destroyCm?.();
    };
  });

  function switchMode(nextMode: 'visual' | 'split' | 'source') {
    if (editorMode === 'visual' && getLiveMarkdown) {
      content = getLiveMarkdown();
    }
    editorMode = nextMode;
  }

  function triggerToolbar(actionType: string, markdownSnippet?: string) {
    if (editorMode === 'visual' && execMilkdownFormat) {
      execMilkdownFormat(actionType, markdownSnippet);
    } else if (markdownSnippet) {
      const next = `${content.trimEnd()}\n\n${markdownSnippet}\n`;
      content = next;
      dirty = true;
      replaceCmDoc?.(next);
    }
  }

  async function handleSave() {
    saving = true;
    try {
      const bodyToSave = editorMode === 'visual' && getLiveMarkdown ? getLiveMarkdown() : content;
      content = bodyToSave;
      const q = studio.getVaultQuery();
      const res = await fetch(`/api/vault/concept/${encodeURIComponent(conceptId)}${q}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: bodyToSave }),
      });
      if (!res.ok) {
        throw new Error('Gagal menyimpan dokumen');
      }
      dirty = false;
      toastMessage = 'Tersimpan ke Vault';
      onSaved(bodyToSave);
      setTimeout(() => {
        toastMessage = '';
      }, 3000);
    } catch (err) {
      toastMessage = err instanceof Error ? err.message : 'Gagal menyimpan';
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="mx-auto w-full max-w-6xl px-3 sm:px-8 py-4 sm:py-6 flex flex-col gap-3">
  <!-- Top Editor Header Bar -->
  <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
    <div class="flex items-center gap-2 min-w-0">
      <Badge variant="default" class="font-mono text-[11px] shrink-0">EDITOR</Badge>
      <h2 class="text-sm sm:text-lg font-semibold truncate">{title}</h2>
      {#if dirty}
        <span class="text-xs font-mono text-amber-400 shrink-0">●</span>
      {:else}
        <span class="text-xs font-mono text-emerald-400 hidden sm:inline">✓ Sinkron</span>
      {/if}
    </div>

    <div class="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto">
      <!-- Mode Switcher: Visual WYSIWYG / Split / Markdown Source -->
      <div class="flex items-center rounded-lg border border-border bg-card p-0.5">
        <Button
          variant={editorMode === 'visual' ? 'secondary' : 'ghost'}
          size="xs"
          onclick={() => switchMode('visual')}
          class="gap-1 px-2 text-xs"
        >
          <SparklesIcon class="size-3.5" />
          <span>Visual</span>
        </Button>
        <Button
          variant={editorMode === 'split' ? 'secondary' : 'ghost'}
          size="xs"
          onclick={() => switchMode('split')}
          class="gap-1 px-2 text-xs"
        >
          <Columns2Icon class="size-3.5" />
          <span>Split</span>
        </Button>
        <Button
          variant={editorMode === 'source' ? 'secondary' : 'ghost'}
          size="xs"
          onclick={() => switchMode('source')}
          class="gap-1 px-2 text-xs"
        >
          <FileCodeIcon class="size-3.5" />
          <span>Kode</span>
        </Button>
      </div>

      <div class="flex items-center gap-1.5">
        <Button variant="ghost" size="xs" onclick={onCancel}>
          <EyeIcon data-icon="inline-start" />
          <span>Selesai</span>
        </Button>
        <Button
          variant="default"
          size="xs"
          data-testid="btn-save"
          disabled={saving}
          onclick={handleSave}
        >
          <SaveIcon data-icon="inline-start" />
          <span>{saving ? '...' : 'Simpan'}</span>
        </Button>
      </div>
    </div>
  </div>

  <!-- Rich Formatting Toolbar -->
  <div class="flex flex-wrap items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-card shadow-sm">
    <Button
      variant="ghost"
      size="icon-xs"
      title="Heading 1"
      onclick={() => triggerToolbar('h1', '# Judul Utama')}
    >
      <Heading1Icon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Heading 2"
      onclick={() => triggerToolbar('h2', '## Subjudul Bagian')}
    >
      <Heading2Icon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Heading 3"
      onclick={() => triggerToolbar('h3', '### Sub-bagian')}
    >
      <Heading3Icon />
    </Button>

    <span class="h-4 w-px bg-border mx-1"></span>

    <Button
      variant="ghost"
      size="icon-xs"
      title="Tebal (Bold)"
      onclick={() => triggerToolbar('bold', '**teks tebal**')}
    >
      <BoldIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Miring (Italic)"
      onclick={() => triggerToolbar('italic', '*teks miring*')}
    >
      <ItalicIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Coret (Strikethrough)"
      onclick={() => triggerToolbar('strike', '~~coret~~')}
    >
      <StrikethroughIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Kode Inline"
      onclick={() => triggerToolbar('code', '`kode`')}
    >
      <CodeIcon />
    </Button>

    <span class="h-4 w-px bg-border mx-1"></span>

    <Button
      variant="ghost"
      size="icon-xs"
      title="Daftar Poin (Bullet List)"
      onclick={() => triggerToolbar('bullet', '- Poin pertama\n- Poin kedua')}
    >
      <ListIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Daftar Bernomor"
      onclick={() => triggerToolbar('ordered', '1. Langkah pertama\n2. Langkah kedua')}
    >
      <ListOrderedIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Kutipan (Blockquote)"
      onclick={() => triggerToolbar('quote', '> Catatan penting atau kutipan utama.')}
    >
      <QuoteIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Tabel GFM"
      onclick={() =>
        triggerToolbar(
          'table',
          '| Parameter | Nilai | Keterangan |\n| --- | --- | --- |\n| Target | 100% | Terverifikasi |'
        )}
    >
      <TableIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon-xs"
      title="Garis Pemisah"
      onclick={() => triggerToolbar('hr', '---')}
    >
      <MinusIcon />
    </Button>

    <span class="h-4 w-px bg-border mx-1"></span>

    <Button
      variant="outline"
      size="xs"
      class="font-mono text-[11px] h-6"
      onclick={() => triggerToolbar('codeblock', '```ts\n// Blok kode\n```')}
    >
      + Code Block
    </Button>
    <Button
      variant="outline"
      size="xs"
      class="font-mono text-[11px] h-6"
      onclick={() =>
        triggerToolbar('mermaid', '```mermaid\nflowchart LR\n  A[Mulai] --> B[Selesai]\n```')}
    >
      + Mermaid
    </Button>
    <Button
      variant="outline"
      size="xs"
      class="font-mono text-[11px] h-6"
      onclick={() => triggerToolbar('math', '$$\n\\mathcal{L}(\\theta) = \\sum_{i=1}^n y_i\n$$')}
    >
      + Math LaTeX
    </Button>
  </div>

  <!-- Main Editor Surface -->
  {#if browser}
    {#if editorMode === 'visual'}
      <div
        bind:this={editorRoot}
        class="milkdown-wrapper min-h-[480px] rounded-xl border border-border bg-card px-6 sm:px-10 py-6 sm:py-8 shadow-inner focus-within:border-primary/60 transition-colors"
      ></div>
    {:else if editorMode === 'split'}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[480px]">
        <div class="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          <div class="px-3 py-1.5 border-b border-border bg-background/50 text-[11px] font-mono text-muted-foreground">
            MARKDOWN SOURCE
          </div>
          <div bind:this={cmRoot} class="flex-1 w-full overflow-auto"></div>
        </div>
        <div class="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          <div class="px-3 py-1.5 border-b border-border bg-background/50 text-[11px] font-mono text-muted-foreground">
            LIVE PREVIEW
          </div>
          <div class="flex-1 p-6 overflow-y-auto markdown-prose text-sm">
            {@html renderPreviewHtml(content)}
          </div>
        </div>
      </div>
    {:else}
      <div class="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[480px]">
        <div class="px-3 py-1.5 border-b border-border bg-background/50 text-[11px] font-mono text-muted-foreground">
          MARKDOWN SOURCE (`⌘S` untuk simpan)
        </div>
        <div bind:this={cmRoot} class="flex-1 w-full overflow-auto"></div>
      </div>
    {/if}
  {/if}

  <!-- Editor Footer Status Bar -->
  <div class="flex items-center justify-between px-2 text-xs font-mono text-muted-foreground">
    <span>ID: {conceptId}</span>
    <span>{wordCount} kata · {lineCount} baris · {content.length} karakter</span>
  </div>

  {#if toastMessage}
    <div
      data-testid="toast"
      role="status"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-mono shadow-lg"
    >
      {toastMessage}
    </div>
  {/if}
</div>
