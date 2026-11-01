<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import * as Popover from '$lib/components/ui/popover';
  import * as Dialog from '$lib/components/ui/dialog';
  import { studio } from '$lib/stores/studio.svelte';
  import type { VaultInfo } from '$lib/types';
  import FolderArchiveIcon from '@lucide/svelte/icons/folder-archive';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import CheckIcon from '@lucide/svelte/icons/check';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
  import ServerFolderPicker from '$lib/components/ServerFolderPicker.svelte';

  let popoverOpen = $state(false);
  let addDialogOpen = $state(false);

  let newVaultName = $state('');
  let newVaultPath = $state('');
  let addError = $state('');
  let isSubmitting = $state(false);

  function handleFolderChosen(path: string, suggestedName?: string) {
    newVaultPath = path;
    if (!newVaultName.trim() && suggestedName) {
      newVaultName = suggestedName;
    }
  }

  onMount(async () => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('donna_active_vault');
      if (saved) studio.activeVaultId = saved;
    }
    await studio.loadVaults();
  });

  function selectVault(v: VaultInfo) {
    studio.switchVault(v.id);
    popoverOpen = false;
  }

  async function handleAddVault() {
    if (!newVaultName.trim() || !newVaultPath.trim()) {
      addError = 'Nama dan path folder wajib diisi.';
      return;
    }

    addError = '';
    isSubmitting = true;

    try {
      const res = await fetch('/api/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newVaultName.trim(),
          path: newVaultPath.trim(),
        }),
      });

      const data = (await res.json()) as { ok: boolean; vault?: VaultInfo; error?: string };

      if (!res.ok || !data.ok) {
        addError = data.error || 'Gagal menambahkan vault.';
        return;
      }

      newVaultName = '';
      newVaultPath = '';
      addDialogOpen = false;
      await studio.loadVaults();
      if (data.vault) {
        studio.switchVault(data.vault.id);
      }
    } catch (err) {
      addError = err instanceof Error ? err.message : 'Koneksi gagal.';
    } finally {
      isSubmitting = false;
    }
  }

  let activeVault = $derived(
    studio.availableVaults.find((v) => v.id === studio.activeVaultId) || {
      id: 'global',
      name: 'Donna Global Vault',
      path: '~/.donna/vault/.okf',
      conceptCount: studio.stats.concepts,
    }
  );
</script>

<Popover.Root bind:open={popoverOpen}>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        variant="outline"
        size="xs"
        data-testid="vault-switcher-btn"
        class="h-7 max-w-[125px] sm:max-w-48 md:max-w-56 px-2 gap-1.5 border-border bg-background/50 hover:bg-background/90 text-left font-mono text-[11px] shrink-0"
        title="Vault OKF Aktif: {activeVault.name} ({activeVault.path})"
        aria-label="Pilih Vault OKF"
        {...props}
      >
        <FolderArchiveIcon class="size-3.5 text-primary shrink-0" />
        <span class="truncate font-semibold text-foreground">{activeVault.name}</span>
        <ChevronDownIcon class="size-3 text-muted-foreground shrink-0 opacity-60 ml-auto" />
      </Button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content class="w-80 p-0 bg-card border-border shadow-xl text-foreground" align="start">
    <div class="px-3 py-2 border-b border-border flex items-center justify-between">
      <span class="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
        Daftar Vault OKF
      </span>
      <Badge variant="secondary" class="text-[10px] px-1.5 py-0 h-4 font-mono">
        {studio.availableVaults.length} Vault
      </Badge>
    </div>

    <div class="max-h-64 overflow-y-auto p-1 space-y-0.5">
      {#each studio.availableVaults as vault (vault.id)}
        {@const isActive = vault.id === studio.activeVaultId}
        <button
          type="button"
          class="w-full text-left px-2.5 py-2 rounded-md transition-colors flex items-start gap-2.5 text-xs hover:bg-muted/50 {isActive
            ? 'bg-primary/10 border border-primary/30 text-primary'
            : 'text-foreground'}"
          onclick={() => selectVault(vault)}
        >
          <div class="size-4 shrink-0 mt-0.5 flex items-center justify-center">
            {#if isActive}
              <CheckIcon class="size-3.5 text-primary" />
            {:else}
              <FolderArchiveIcon class="size-3.5 text-muted-foreground" />
            {/if}
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1">
              <span class="font-medium truncate {isActive ? 'font-semibold' : ''}">
                {vault.name}
              </span>
              {#if vault.conceptCount > 0}
                <span class="text-[10px] font-mono text-muted-foreground shrink-0">
                  {vault.conceptCount} konsep
                </span>
              {/if}
            </div>
            <p class="text-[10px] font-mono text-muted-foreground truncate opacity-80 mt-0.5">
              {vault.path}
            </p>
          </div>
        </button>
      {/each}
    </div>

    <div class="p-1.5 border-t border-border bg-muted/20">
      <Button
        variant="ghost"
        size="xs"
        class="w-full justify-start gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7"
        onclick={() => {
          popoverOpen = false;
          addDialogOpen = true;
        }}
      >
        <PlusIcon class="size-3.5" />
        <span>Buka Folder Vault Lain...</span>
      </Button>
    </div>
  </Popover.Content>
</Popover.Root>

<!-- Dialog Tambah Folder Vault -->
<Dialog.Root bind:open={addDialogOpen}>
  <Dialog.Content class="sm:max-w-lg max-h-[88vh] overflow-y-auto overflow-x-hidden bg-card border-border text-foreground">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-base font-semibold">
        <FolderOpenIcon class="size-4 text-primary" />
        Buka Folder Vault OKF Baru
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Pilih direktori di server yang berisi berkas Open Knowledge Format (<code class="font-mono text-foreground">.okf</code>) atau ketik path manual.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 py-2 text-xs">
      <!-- Visual Server Folder Tree Browser -->
      <ServerFolderPicker bind:selectedPath={newVaultPath} onSelectPath={handleFolderChosen} />

      <div>
        <label for="vault-name" class="block font-medium mb-1 text-muted-foreground">
          Nama Tampilan Vault
        </label>
        <Input
          id="vault-name"
          placeholder="misal: Catatan Kuliah / Skripsi"
          bind:value={newVaultName}
          class="h-8 text-xs bg-background"
        />
      </div>

      <div>
        <label for="vault-path" class="block font-medium mb-1 text-muted-foreground">
          Path Folder Lengkap (.okf)
        </label>
        <Input
          id="vault-path"
          placeholder="/home/ubuntu/projects/nama-proyek/.okf"
          bind:value={newVaultPath}
          class="h-8 text-xs font-mono bg-background"
        />
        <p class="text-[10px] text-muted-foreground mt-1">
          Path absolut folder di server (contoh: <code class="font-mono">/home/ubuntu/projects/.okf</code>).
        </p>
      </div>

      {#if addError}
        <div class="p-2 rounded bg-destructive/15 border border-destructive/30 text-destructive text-[11px]">
          {addError}
        </div>
      {/if}
    </div>

    <Dialog.Footer class="gap-2 sm:gap-0">
      <Button
        variant="outline"
        size="xs"
        class="h-8 text-xs"
        onclick={() => (addDialogOpen = false)}
        disabled={isSubmitting}
      >
        Batal
      </Button>
      <Button
        size="xs"
        class="h-8 text-xs"
        onclick={handleAddVault}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Menyimpan...' : 'Buka Vault'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
