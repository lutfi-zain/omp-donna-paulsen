<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import GoogleAuthDialog from '$lib/components/GoogleAuthDialog.svelte';
  import FuzzySearchDialog from '$lib/components/FuzzySearchDialog.svelte';
  import VaultExplorer from '$lib/components/VaultExplorer.svelte';
  import TTSDock from '$lib/components/TTSDock.svelte';
  import { Button } from '$lib/components/ui/button';
  import { studio, type SessionUser } from '$lib/stores/studio.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import BookOpenIcon from '@lucide/svelte/icons/book-open';
  import FolderIcon from '@lucide/svelte/icons/folder';
  import NetworkIcon from '@lucide/svelte/icons/network';
  import PenToolIcon from '@lucide/svelte/icons/pen-tool';
  import GitGraphIcon from '@lucide/svelte/icons/git-graph';
  import type { Snippet } from 'svelte';

  interface Props {
    data: { session: SessionUser | null };
    children: Snippet;
  }

  let { data, children }: Props = $props();

  let authDialogOpen = $state(false);

  $effect(() => {
    if (data.session && !studio.session) {
      studio.session = data.session;
    }
  });

  async function verifyAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const body = (await res.json()) as {
        authenticated: boolean;
        user?: SessionUser;
      };
      if (body.authenticated && body.user) {
        studio.session = body.user;
        authDialogOpen = false;
        connectSSE();
      } else {
        studio.session = null;
        authDialogOpen = true;
      }
    } catch {
      if (!studio.session) {
        authDialogOpen = true;
      }
    }
  }

  let eventSource: EventSource | null = null;

  function connectSSE() {
    if (eventSource) return;
    eventSource = new EventSource('/api/events');
    eventSource.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as { type?: string };
        if (parsed.type === 'vault_updated') {
          studio.syncStatus = 'updated';
          studio.vaultVersion += 1;
          setTimeout(() => {
            studio.syncStatus = 'connected';
          }, 2500);
        } else if (parsed.type === 'connected') {
          studio.syncStatus = 'connected';
        }
      } catch {
        // ignore invalid event
      }
    };
    eventSource.onerror = () => {
      studio.syncStatus = 'offline';
    };
  }

  async function handleGoogleCredential(credential: string) {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const body = (await res.json()) as { ok: boolean; user?: SessionUser };
    if (body.ok && body.user) {
      studio.session = body.user;
      authDialogOpen = false;
      connectSSE();
    }
  }

  onMount(() => {
    verifyAuth();
    studio.loadVaults();
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        if (window.innerWidth < 768 && page.url.pathname !== '/') {
          studio.mobileDrawerOpen = !studio.mobileDrawerOpen;
        } else {
          studio.sidebarOpen = !studio.sidebarOpen;
        }
      }
    }
    window.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      eventSource?.close();
      eventSource = null;
    };
  });
</script>

<div class="flex flex-col h-dvh max-h-dvh w-full max-w-full overflow-hidden bg-background text-foreground">
  {#if studio.session || data.session}
    <AppHeader />
    <FuzzySearchDialog />

    <!-- Universal Stage Container -->
    <div class="flex-1 min-h-0 w-full max-w-full overflow-hidden flex flex-row relative">
      <!-- Universal Single Sidebar for non-root studio pages (/graph, /canvas, /mermaid) -->
      {#if page.url.pathname !== '/' && (studio.sidebarOpen || studio.mobileDrawerOpen)}
        <!-- Mobile Drawer Backdrop -->
        {#if studio.mobileDrawerOpen}
          <div
            role="presentation"
            class="fixed inset-0 top-12 sm:top-14 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onclick={() => (studio.mobileDrawerOpen = false)}
          ></div>
        {/if}

        <aside
          class="{studio.sidebarOpen ? 'md:flex md:flex-col' : 'md:hidden'} {studio.mobileDrawerOpen ? 'flex flex-col' : 'hidden'} fixed inset-y-0 top-12 sm:top-14 left-0 z-50 w-4/5 max-w-xs h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-3.5rem)] shadow-2xl md:static md:z-20 md:top-auto md:w-72 lg:w-80 md:h-full md:shadow-none shrink-0 border-r border-border bg-card overflow-hidden"
        >
          <!-- Mobile Drawer Header -->
          <div class="flex md:hidden items-center justify-between p-2 border-b border-border bg-card shrink-0">
            <span class="text-xs font-mono uppercase text-muted-foreground font-semibold px-2">
              Berkas Vault
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onclick={() => (studio.mobileDrawerOpen = false)}
              aria-label="Tutup Sidebar"
            >
              <XIcon class="size-4" />
            </Button>
          </div>

          <div class="flex-1 min-h-0 w-full overflow-hidden">
            <VaultExplorer
              selectedId={studio.selectedConceptId}
              onSelect={(id) => {
                studio.selectConcept(id);
                studio.mobileDrawerOpen = false;
              }}
            />
          </div>
        </aside>
      {/if}

      <!-- Main Page Stage -->
      <main class="flex-1 min-w-0 min-h-0 h-full overflow-hidden flex flex-col">
        {@render children()}
      </main>
    </div>

    <!-- Universal Mobile Bottom Navigation Bar (md:hidden) -->
    <nav
      data-testid="mobile-bottom-nav"
      class="flex md:hidden h-12 w-full max-w-full shrink-0 border-t border-border bg-card/95 backdrop-blur items-center justify-around px-1 z-30"
      aria-label="Navigasi Bawah Mobile"
    >
      <a
        href="/"
        onclick={() => { studio.mobileTab = 'reader'; }}
        class="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] transition-colors {page.url.pathname === '/' && studio.mobileTab === 'reader' ? 'text-primary font-semibold' : 'text-muted-foreground'}"
      >
        <BookOpenIcon class="size-4" />
        <span>Dokumen</span>
      </a>

      <button
        type="button"
        onclick={() => {
          if (page.url.pathname === '/') {
            studio.mobileTab = 'explorer';
          } else {
            studio.mobileDrawerOpen = !studio.mobileDrawerOpen;
          }
        }}
        class="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] transition-colors {page.url.pathname === '/' && studio.mobileTab === 'explorer' ? 'text-primary font-semibold' : studio.mobileDrawerOpen ? 'text-primary font-semibold' : 'text-muted-foreground'}"
      >
        <FolderIcon class="size-4" />
        <span>Berkas</span>
      </button>

      <a
        href="/graph"
        class="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] transition-colors {page.url.pathname === '/graph' ? 'text-primary font-semibold' : 'text-muted-foreground'}"
      >
        <NetworkIcon class="size-4" />
        <span>Graf</span>
      </a>

      <a
        href="/canvas"
        class="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] transition-colors {page.url.pathname === '/canvas' ? 'text-primary font-semibold' : 'text-muted-foreground'}"
      >
        <PenToolIcon class="size-4" />
        <span>Kanvas</span>
      </a>

      <a
        href="/mermaid"
        class="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-[10px] transition-colors {page.url.pathname === '/mermaid' ? 'text-primary font-semibold' : 'text-muted-foreground'}"
      >
        <GitGraphIcon class="size-4" />
        <span>Mermaid</span>
      </a>
    </nav>

    <TTSDock />
  {:else}
    <div class="flex-1 flex items-center justify-center p-4">
      <p class="text-sm text-muted-foreground font-mono">Memverifikasi sesi Donna OKF...</p>
    </div>
  {/if}

  <GoogleAuthDialog bind:open={authDialogOpen} onCredential={handleGoogleCredential} />
</div>
