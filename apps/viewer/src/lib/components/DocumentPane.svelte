<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import ReaderView from '$lib/components/ReaderView.svelte';
  import MilkdownEditor from '$lib/components/MilkdownEditor.svelte';
  import { studio } from '$lib/stores/studio.svelte';
  import type { OKFConcept } from '$lib/types';
  import BookOpenIcon from '@lucide/svelte/icons/book-open';

  interface Props {
    conceptId: string | null;
  }

  let { conceptId }: Props = $props();

  let concept = $state<OKFConcept | null>(null);
  let loading = $state(false);
  let editMode = $state(false);
  let editableBody = $state('');

  async function fetchConcept(id: string) {
    loading = true;
    try {
      const q = studio.getVaultQuery();
      const res = await fetch(`/api/vault/concept/${encodeURIComponent(id)}${q}`);
      if (!res.ok) {
        concept = null;
        return;
      }
      const data = (await res.json()) as OKFConcept;
      concept = data;
      editableBody = data.body;
    } catch {
      concept = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const _vid = studio.activeVaultId;
    if (conceptId) {
      editMode = false;
      fetchConcept(conceptId);
    } else {
      concept = null;
      editMode = false;
    }
  });

  function handleSaved(newBody: string) {
    if (concept) {
      concept = {
        ...concept,
        body: newBody,
      };
    }
  }
</script>

<section
  data-concept-id={conceptId ?? ''}
  class="flex-1 h-full w-full overflow-y-auto bg-background"
>
  {#if !conceptId}
    <div class="h-full w-full flex items-center justify-center p-6">
      <div class="max-w-md text-center flex flex-col items-center gap-3 p-6 rounded-xl border border-border bg-card">
        <BookOpenIcon class="size-10 text-primary" />
        <h2 class="text-base font-semibold">Pilih Konsep untuk Membaca</h2>
        <p class="text-xs text-muted-foreground">
          Pilih berkas dari Explorer di sebelah kiri atau tekan <kbd class="px-1.5 py-0.5 rounded bg-muted font-mono">⌘K</kbd> untuk mencari konsep dalam Second Brain Donna.
        </p>
        <Button variant="default" size="sm" onclick={() => (studio.searchOpen = true)}>
          Cari di Second Brain (⌘K)
        </Button>
      </div>
    </div>
  {:else if loading && !concept}
    <div class="mx-auto max-w-3xl p-8 flex flex-col gap-4">
      <Skeleton class="h-6 w-32" />
      <Skeleton class="h-10 w-2/3" />
      <Skeleton class="h-64 w-full" />
    </div>
  {:else if concept}
    {#if editMode}
      <MilkdownEditor
        conceptId={concept.id}
        title={concept.title}
        bind:content={editableBody}
        onSaved={handleSaved}
        onCancel={() => (editMode = false)}
      />
    {:else}
      <ReaderView
        {concept}
        onEdit={() => {
          editableBody = concept?.body || '';
          editMode = true;
        }}
        onNavigateConcept={(id) => studio.selectConcept(id)}
      />
    {/if}
  {/if}
</section>
