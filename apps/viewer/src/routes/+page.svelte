<script lang="ts">
  import VaultExplorer from '$lib/components/VaultExplorer.svelte';
  import DocumentPane from '$lib/components/DocumentPane.svelte';
  import { Button } from '$lib/components/ui/button';
  import { studio } from '$lib/stores/studio.svelte';
  import FolderIcon from '@lucide/svelte/icons/folder';
  import BookOpenIcon from '@lucide/svelte/icons/book-open';

  function handleSelectConcept(id: string) {
    studio.selectConcept(id);
    studio.mobileTab = 'reader';
  }
</script>

<div class="flex-1 min-h-0 w-full max-w-full flex flex-col md:flex-row overflow-hidden">
  <!-- Single Unified Explorer for / (Inline sidebar on desktop, full page on mobile) -->
  {#if studio.sidebarOpen || studio.mobileTab === 'explorer'}
    <div
      class="w-full md:w-72 lg:w-80 md:shrink-0 flex-1 min-h-0 md:flex-initial md:h-full overflow-hidden {studio.sidebarOpen
        ? 'md:flex md:flex-col'
        : 'md:hidden'} {studio.mobileTab === 'explorer' ? 'flex flex-col' : 'hidden'}"
    >
      <VaultExplorer selectedId={studio.selectedConceptId} onSelect={handleSelectConcept} />
    </div>
  {/if}

  <!-- Main Document Reader Stage -->
  <div
    class="flex-1 min-w-0 min-h-0 h-full overflow-hidden {studio.mobileTab === 'reader'
      ? 'flex flex-col'
      : 'hidden md:flex md:flex-col'}"
  >
    <DocumentPane conceptId={studio.selectedConceptId} />
  </div>

  <!-- Mobile Bottom Switcher on / -->
  <div class="flex md:hidden h-12 shrink-0 border-t border-border bg-card items-center justify-around px-2 gap-2 z-20">
    <Button
      variant={studio.mobileTab === 'explorer' ? 'secondary' : 'ghost'}
      size="sm"
      class="flex-1 gap-1.5"
      onclick={() => (studio.mobileTab = 'explorer')}
    >
      <FolderIcon />
      <span>Explorer</span>
    </Button>
    <Button
      variant={studio.mobileTab === 'reader' ? 'secondary' : 'ghost'}
      size="sm"
      class="flex-1 gap-1.5"
      onclick={() => (studio.mobileTab = 'reader')}
    >
      <BookOpenIcon />
      <span>Bacaan</span>
    </Button>
  </div>
</div>
