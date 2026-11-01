<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Popover from '$lib/components/ui/popover';
  import VaultSwitcher from '$lib/components/VaultSwitcher.svelte';
  import { studio } from '$lib/stores/studio.svelte';
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
  import SearchIcon from '@lucide/svelte/icons/search';
  import BookOpenIcon from '@lucide/svelte/icons/book-open';
  import NetworkIcon from '@lucide/svelte/icons/network';
  import PenToolIcon from '@lucide/svelte/icons/pen-tool';
  import GitGraphIcon from '@lucide/svelte/icons/git-graph';
  import Settings2Icon from '@lucide/svelte/icons/settings-2';
  import LogOutIcon from '@lucide/svelte/icons/log-out';

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    studio.session = null;
    window.location.reload();
  }

  function toggleSidebar() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (page.url.pathname === '/') {
        studio.mobileTab = studio.mobileTab === 'explorer' ? 'reader' : 'explorer';
      } else {
        studio.mobileDrawerOpen = !studio.mobileDrawerOpen;
      }
      return;
    }
    studio.sidebarOpen = !studio.sidebarOpen;
  }

  const navItems = [
    { href: '/', label: 'Dokumen', icon: BookOpenIcon },
    { href: '/graph', label: 'Graf', icon: NetworkIcon },
    { href: '/canvas', label: 'Kanvas', icon: PenToolIcon },
    { href: '/mermaid', label: 'Mermaid', icon: GitGraphIcon },
  ];
</script>

<header
  class="h-12 sm:h-14 w-full max-w-full border-b border-border bg-card px-1.5 sm:px-4 flex items-center justify-between gap-1 sm:gap-2 shrink-0 overflow-hidden z-30"
>
  <!-- Left -->
  <div data-testid="header-left" class="flex items-center gap-0.5 sm:gap-2.5 shrink-0">
    <Button
      variant="ghost"
      size="icon-xs"
      onclick={toggleSidebar}
      title="Toggle Sidebar"
      aria-label="Toggle Sidebar"
    >
      <PanelLeftIcon />
    </Button>

    <a href="/" class="hidden sm:flex items-center gap-1.5 shrink-0">
      <span
        class="px-1.5 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold rounded bg-primary/15 text-primary border border-primary/30"
      >
        OKF
      </span>
      <span class="font-semibold text-sm tracking-tight hidden md:inline">Donna · OKF</span>
    </a>

    <VaultSwitcher />

    <nav class="flex items-center gap-0.5 sm:gap-1" aria-label="Navigasi Utama">
      {#each navItems as item (item.href)}
        {@const active = page.url.pathname === item.href}
        {@const Icon = item.icon}
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="xs"
          href={item.href}
          class="px-1.5 sm:px-2.5 h-7 text-[11px] sm:text-xs {active
            ? 'text-primary font-semibold'
            : 'text-muted-foreground'}"
        >
          <Icon class="hidden lg:inline" />
          <span>{item.label}</span>
        </Button>
      {/each}
    </nav>
  </div>

  <!-- Center -->
  <div data-testid="header-center" class="flex items-center justify-center shrink-0">
    <Button
      variant="outline"
      size="xs"
      onclick={() => (studio.searchOpen = true)}
      aria-label="Cari Konsep"
      class="text-muted-foreground gap-1.5 px-2 sm:px-3 h-7 border-border bg-background/60"
    >
      <SearchIcon />
      <span class="hidden sm:inline">Cari Konsep</span>
      <kbd
        class="hidden sm:inline-block text-[10px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border"
      >
        ⌘K
      </kbd>
    </Button>
  </div>

  <!-- Right -->
  <div data-testid="header-right" class="flex items-center gap-0.5 sm:gap-2 shrink-0">
    <Badge variant="outline" class="hidden lg:inline-flex gap-1.5 font-mono text-[11px]">
      <span
        class="size-2 rounded-full {studio.syncStatus === 'connected'
          ? 'bg-emerald-400'
          : studio.syncStatus === 'updated'
            ? 'bg-sky-400'
            : 'bg-amber-400'}"
      ></span>
      <span>{studio.syncStatus === 'updated' ? 'Vault Synced' : 'Live Sync'}</span>
    </Badge>

    {#if studio.stats.concepts > 0}
      <span class="hidden xl:inline text-xs font-mono text-muted-foreground">
        {studio.stats.concepts} konsep · {studio.stats.edges} tautan
      </span>
    {/if}

    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            variant="ghost"
            size="icon-xs"
            title="Pengaturan Tampilan"
            aria-label="Pengaturan Tampilan"
            {...props}
          >
            <Settings2Icon />
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-56 bg-card border-border text-foreground p-3" align="end">
        <div class="flex flex-col gap-2">
          <span class="text-xs font-mono uppercase text-muted-foreground">Lebar Bacaan</span>
          <div class="flex gap-1">
            {#each ['normal', 'wide', 'full'] as mode (mode)}
              <Button
                variant={studio.readerMaxWidth === mode ? 'default' : 'outline'}
                size="xs"
                class="flex-1 capitalize"
                onclick={() => (studio.readerMaxWidth = mode as 'normal' | 'wide' | 'full')}
              >
                {mode}
              </Button>
            {/each}
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>

    {#if studio.session}
      <div class="flex items-center gap-0.5 sm:gap-1 sm:pl-1 sm:border-l sm:border-border">
        <span class="hidden lg:inline text-xs font-medium text-muted-foreground truncate max-w-28">
          {studio.session.name}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onclick={handleLogout}
          title="Keluar"
          aria-label="Keluar"
        >
          <LogOutIcon />
        </Button>
      </div>
    {/if}
  </div>
</header>
