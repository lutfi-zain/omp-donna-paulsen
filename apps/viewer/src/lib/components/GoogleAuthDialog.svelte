<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { browser } from '$app/environment';

  interface Props {
    open: boolean;
    onCredential: (credential: string) => void;
  }

  let { open = $bindable(false), onCredential }: Props = $props();
  let buttonContainer = $state<HTMLDivElement | null>(null);
  let errorMsg = $state<string>('');

  interface GoogleAccountsId {
    initialize: (config: {
      client_id: string;
      callback: (response: { credential?: string }) => void;
    }) => void;
    renderButton: (
      parent: HTMLElement,
      options: { theme?: string; size?: string; shape?: string; width?: number }
    ) => void;
  }

  function getGoogleId(): GoogleAccountsId | undefined {
    const win = window as unknown as {
      google?: { accounts?: { id?: GoogleAccountsId } };
    };
    return win.google?.accounts?.id;
  }

  async function initGoogleSignIn(container: HTMLDivElement) {
    try {
      const cfgRes = await fetch('/api/auth/config');
      const cfg = (await cfgRes.json()) as { clientId?: string };
      if (!cfg.clientId) {
        errorMsg = 'Google Client ID tidak ditemukan';
        return;
      }

      if (!getGoogleId()) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(
            'script[src="https://accounts.google.com/gsi/client"]'
          );
          if (existing) {
            existing.addEventListener('load', () => resolve());
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Gagal memuat Google Identity Services'));
          document.head.appendChild(script);
        });
      }

      const gId = getGoogleId();
      if (gId && container) {
        gId.initialize({
          client_id: cfg.clientId,
          callback: (resp) => {
            if (resp.credential) {
              onCredential(resp.credential);
            }
          },
        });
        gId.renderButton(container, {
          theme: 'filled_black',
          size: 'large',
          shape: 'rectangular',
          width: 280,
        });
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Gagal memuat autentikasi Google';
    }
  }

  $effect(() => {
    if (browser && open && buttonContainer) {
      initGoogleSignIn(buttonContainer);
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="bg-card border-border text-foreground sm:max-w-md" showCloseButton={false}>
    <Dialog.Header>
      <div class="flex items-center gap-2 mb-2">
        <span class="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-primary/15 text-primary border border-primary/30">
          OKF
        </span>
        <span class="text-xs font-mono text-muted-foreground">PRIVATE SECOND BRAIN</span>
      </div>
      <Dialog.Title class="text-lg font-semibold">Donna Paulsen · Knowledge Studio</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        Akses terbatas untuk Principal (Lutfi). Silakan masuk menggunakan akun Google resmi.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col items-center justify-center py-4 gap-3">
      <div bind:this={buttonContainer} class="min-h-11 flex items-center justify-center"></div>
      {#if errorMsg}
        <p class="text-xs text-red-400">{errorMsg}</p>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
