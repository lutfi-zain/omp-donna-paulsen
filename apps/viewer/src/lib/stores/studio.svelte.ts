import type { VaultInfo } from '$lib/types';

export interface SessionUser {
  email: string;
  name: string;
  picture: string;
}

class StudioState {
  session = $state<SessionUser | null>(null);
  syncStatus = $state<'connected' | 'updated' | 'offline'>('connected');
  vaultVersion = $state(0);
  sidebarOpen = $state(true);
  mobileDrawerOpen = $state(false);
  searchOpen = $state(false);
  selectedConceptId = $state<string | null>(null);
  mobileTab = $state<'explorer' | 'reader'>('explorer');
  stats = $state<{ concepts: number; edges: number }>({ concepts: 0, edges: 0 });
  readerMaxWidth = $state<'normal' | 'wide' | 'full'>('normal');

  // Multi-Vault state
  activeVaultId = $state<string>('global');
  availableVaults = $state<VaultInfo[]>([]);

  // TTS state shared between ReaderView and TTSDock
  ttsSentences = $state<string[]>([]);
  ttsCurrentIndex = $state<number>(-1);
  ttsActive = $state<boolean>(false);
  ttsTitle = $state<string>('');
  ttsPlayTrigger = $state<number>(0);

  get activeVault(): VaultInfo | undefined {
    return this.availableVaults.find((v) => v.id === this.activeVaultId);
  }

  getVaultQuery(prefix = '?'): string {
    return this.activeVaultId ? `${prefix}vault=${encodeURIComponent(this.activeVaultId)}` : '';
  }

  async loadVaults(): Promise<VaultInfo[]> {
    try {
      const res = await fetch('/api/vaults');
      if (res.ok) {
        const list = (await res.json()) as VaultInfo[];
        this.availableVaults = list;
        if (!list.some((v) => v.id === this.activeVaultId)) {
          const def = list.find((v) => v.isDefault) || list[0];
          if (def) this.activeVaultId = def.id;
        }
        return list;
      }
    } catch (err) {
      console.warn('[Studio] Could not load vaults list:', err);
    }
    return [];
  }

  switchVault(id: string) {
    if (this.activeVaultId === id) return;
    this.activeVaultId = id;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('donna_active_vault', id);
      } catch {}
    }
    this.selectedConceptId = null;
    this.vaultVersion += 1;
  }

  selectConcept(id: string) {
    this.selectedConceptId = id;
    this.mobileTab = 'reader';
  }

  playTTS(sentences: string[], startIndex = 0, title = '') {
    this.ttsSentences = sentences;
    this.ttsCurrentIndex = startIndex;
    this.ttsTitle = title;
    this.ttsActive = true;
    this.ttsPlayTrigger += 1;
  }

  stopTTS() {
    this.ttsActive = false;
    this.ttsCurrentIndex = -1;
  }
}

export const studio = new StudioState();
