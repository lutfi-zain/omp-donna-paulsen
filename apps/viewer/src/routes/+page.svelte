<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import VaultExplorer from '$lib/components/VaultExplorer.svelte';
  import DocumentPane from '$lib/components/DocumentPane.svelte';
  import { studio } from '$lib/stores/studio.svelte';

  function updateUrl(id: string | null) {
    if (typeof window === 'undefined') return;
    if (id) {
      const targetHash = '#' + id;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash);
      }
    } else {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }

  function handleSelectConcept(id: string) {
    studio.selectConcept(id);
    studio.mobileTab = 'reader';
    updateUrl(id);
  }

  function syncFromUrl() {
    if (typeof window === 'undefined') return;

    // Check query param first (?concept=...)
    const queryConcept = page.url.searchParams.get('concept');
    if (queryConcept) {
      studio.selectConcept(decodeURIComponent(queryConcept));
      return;
    }

    // Check hash (#...)
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash) {
      studio.selectConcept(decodeURIComponent(hash));
    }
  }

  onMount(() => {
    syncFromUrl();

    function onHashChange() {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash) {
        studio.selectConcept(decodeURIComponent(hash));
      }
    }

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });

  $effect(() => {
    if (studio.selectedConceptId) {
      updateUrl(studio.selectedConceptId);
    }
  });
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
</div>
