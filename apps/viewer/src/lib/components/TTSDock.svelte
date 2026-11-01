<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { studio } from '$lib/stores/studio.svelte';
  import type { VoiceOption } from '$lib/server/tts';
  import PlayIcon from '@lucide/svelte/icons/play';
  import PauseIcon from '@lucide/svelte/icons/pause';
  import SkipBackIcon from '@lucide/svelte/icons/skip-back';
  import SkipForwardIcon from '@lucide/svelte/icons/skip-forward';
  import XIcon from '@lucide/svelte/icons/x';

  let voices = $state<VoiceOption[]>([]);
  let selectedVoice = $state('id-ID-GadisNeural');
  let selectedRate = $state('+0%');
  let status = $state<'idle' | 'loading' | 'playing' | 'paused'>('idle');

  let audioEl: HTMLAudioElement | null = null;
  const prefetchCache = new Map<string, string>();

  const RATES = ['-25%', '-10%', '+0%', '+10%', '+25%'];

  function buildUrl(text: string, voice: string, rate: string): string {
    return `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&rate=${encodeURIComponent(rate)}`;
  }

  async function prefetchSentence(idx: number) {
    if (!browser || idx < 0 || idx >= studio.ttsSentences.length) return;
    const text = studio.ttsSentences[idx];
    const key = `${selectedVoice}:${selectedRate}:${text}`;
    if (prefetchCache.has(key)) return;
    const url = buildUrl(text, selectedVoice, selectedRate);
    prefetchCache.set(key, url);
    try {
      await fetch(url);
    } catch {
      // ignore prefetch errors
    }
  }

  async function playIndex(idx: number) {
    if (!browser) return;
    if (idx < 0 || idx >= studio.ttsSentences.length) {
      status = 'idle';
      studio.stopTTS();
      return;
    }

    studio.ttsCurrentIndex = idx;
    status = 'loading';

    // Prefetch 2 sentences ahead
    prefetchSentence(idx + 1);
    prefetchSentence(idx + 2);

    const text = studio.ttsSentences[idx];
    const url = buildUrl(text, selectedVoice, selectedRate);

    if (!audioEl) {
      audioEl = new Audio();
    }

    audioEl.src = url;
    audioEl.onplay = () => {
      status = 'playing';
    };
    audioEl.onended = () => {
      if (studio.ttsActive && studio.ttsCurrentIndex + 1 < studio.ttsSentences.length) {
        playIndex(studio.ttsCurrentIndex + 1);
      } else {
        status = 'idle';
        studio.stopTTS();
      }
    };
    audioEl.onerror = () => {
      status = 'idle';
    };

    try {
      await audioEl.play();
    } catch {
      status = 'paused';
    }
  }

  function togglePlayPause() {
    if (!audioEl) return;
    if (status === 'playing') {
      audioEl.pause();
      status = 'paused';
    } else if (status === 'paused') {
      audioEl.play();
      status = 'playing';
    } else if (studio.ttsSentences.length > 0) {
      playIndex(Math.max(0, studio.ttsCurrentIndex));
    }
  }

  function closeDock() {
    if (audioEl) {
      audioEl.pause();
      audioEl.src = '';
    }
    status = 'idle';
    studio.stopTTS();
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/tts/voices');
      if (res.ok) {
        voices = (await res.json()) as VoiceOption[];
      }
    } catch {
      // ignore
    }
  });

  $effect(() => {
    if (studio.ttsPlayTrigger > 0 && studio.ttsActive) {
      playIndex(studio.ttsCurrentIndex);
    }
  });
</script>

{#if studio.ttsActive}
  <aside
    aria-label="Pemutar Suara Donna Edge-TTS"
    class="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card/95 p-3.5 shadow-2xl backdrop-blur flex flex-col gap-2.5"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <Badge variant="default" class="font-mono text-[10px] uppercase">{status}</Badge>
        <span class="text-xs font-medium truncate">{studio.ttsTitle || 'Read Aloud'}</span>
      </div>
      <span class="text-[11px] font-mono text-muted-foreground shrink-0">
        {studio.ttsCurrentIndex + 1}/{studio.ttsSentences.length}
      </span>
      <Button variant="ghost" size="icon-xs" onclick={closeDock} aria-label="Tutup TTS">
        <XIcon />
      </Button>
    </div>

    <div class="flex items-center gap-2">
      <select
        bind:value={selectedVoice}
        onchange={() => playIndex(studio.ttsCurrentIndex)}
        aria-label="Pilih Suara TTS"
        class="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs text-foreground truncate"
      >
        {#each voices as v (v.id)}
          <option value={v.id}>{v.name} ({v.lang})</option>
        {/each}
      </select>

      <select
        bind:value={selectedRate}
        onchange={() => playIndex(studio.ttsCurrentIndex)}
        aria-label="Pilih Kecepatan TTS"
        class="w-20 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
      >
        {#each RATES as r (r)}
          <option value={r}>{r}</option>
        {/each}
      </select>
    </div>

    <div class="flex items-center justify-center gap-2 pt-1">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={studio.ttsCurrentIndex <= 0}
        onclick={() => playIndex(studio.ttsCurrentIndex - 1)}
        aria-label="Kalimat Sebelumnya"
      >
        <SkipBackIcon />
      </Button>
      <Button variant="default" size="sm" class="px-5" onclick={togglePlayPause}>
        {#if status === 'playing'}
          <PauseIcon data-icon="inline-start" />
          <span>Jeda</span>
        {:else}
          <PlayIcon data-icon="inline-start" />
          <span>Putar</span>
        {/if}
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={studio.ttsCurrentIndex + 1 >= studio.ttsSentences.length}
        onclick={() => playIndex(studio.ttsCurrentIndex + 1)}
        aria-label="Kalimat Berikutnya"
      >
        <SkipForwardIcon />
      </Button>
    </div>
  </aside>
{/if}
