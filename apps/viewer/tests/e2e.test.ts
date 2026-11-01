import { test, expect } from '@playwright/test';

test.describe('Donna OKF Knowledge Studio — E2E Suite', () => {
  test('1. Zero console errors on all routes (/, /graph, /canvas, /mermaid)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    for (const route of ['/', '/graph', '/canvas', '/mermaid']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }

    expect(errors).toEqual([]);
  });

  test('2. Zero broken asset requests (HTTP 404/500 = 0)', async ({ page }) => {
    const broken: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 400) {
        broken.push(`${res.status()} ${res.url()}`);
      }
    });

    for (const route of ['/', '/graph', '/canvas', '/mermaid']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }

    expect(broken).toEqual([]);
  });

  test('3. Document open & read mode renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="vault-file"]');
    await page.locator('[data-testid="vault-file"]').first().click();

    await page.waitForSelector('[data-testid="markdown-body"]');
    const title = await page.locator('[data-testid="concept-title"]').textContent();
    expect(title?.trim().length).toBeGreaterThan(0);
  });

  test('4. Milkdown editor saves to disk', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="vault-file"]');
    await page.locator('[data-testid="vault-file"]').first().click();
    await page.waitForSelector('[data-testid="markdown-body"]');

    const conceptId = await page.locator('[data-concept-id]').getAttribute('data-concept-id');
    expect(conceptId).toBeTruthy();

    const origResp = await page.evaluate(async (id) => {
      const r = await fetch(`/api/vault/concept/${encodeURIComponent(id)}`);
      return r.json();
    }, conceptId!);

    await page.locator('[data-testid="btn-edit-mode"]').click();
    await page.waitForSelector('.milkdown [contenteditable]');

    const marker = `e2e-${Date.now()}`;
    await page.locator('.milkdown [contenteditable]').focus();
    await page.keyboard.type(` ${marker}`);
    await page.locator('[data-testid="btn-save"]').click();
    await page.waitForSelector('[data-testid="toast"]');

    const updatedResp = await page.evaluate(async (id) => {
      const r = await fetch(`/api/vault/concept/${encodeURIComponent(id)}`);
      return r.json();
    }, conceptId!);

    // Restore original content
    await page.evaluate(
      async ({ id, body }) => {
        await fetch(`/api/vault/concept/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
      },
      { id: conceptId!, body: origResp.body }
    );

    expect(updatedResp.body).toContain(marker);
  });

  test('5. Mermaid studio renders flowchart and saves/loads from Vault', async ({ page }) => {
    await page.goto('/mermaid');
    const svg = page.locator('[data-testid="mermaid-preview"] svg');
    await expect(svg).toBeVisible({ timeout: 15000 });

    await page.locator('[data-testid="btn-save-mermaid"]').click();
    await expect(page.locator('[data-testid="mermaid-toast"]')).toContainText('Tersimpan');

    await page.locator('[data-testid="btn-load-mermaid"]').click();
    await expect(page.locator('[data-testid="mermaid-vault-item"]').first()).toBeVisible();
  });

  test('6. tldraw canvas mounts without errors and stays active past 5s license gate', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/canvas');
    const canvas = page.locator('.tl-canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(5500);
    await expect(canvas).toBeVisible();

    await page.locator('[data-testid="btn-save-canvas"]').click();
    await expect(page.locator('[data-testid="canvas-toast"]')).toContainText('Tersimpan');
    expect(errors).toEqual([]);
  });

  test('7. Desktop header layout non-overlapping at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="header-left"]');

    const left = await page.locator('[data-testid="header-left"]').boundingBox();
    const center = await page.locator('[data-testid="header-center"]').boundingBox();
    const right = await page.locator('[data-testid="header-right"]').boundingBox();

    expect(left).not.toBeNull();
    expect(center).not.toBeNull();
    expect(right).not.toBeNull();

    expect(left!.x + left!.width).toBeLessThanOrEqual(center!.x);
    expect(center!.x + center!.width).toBeLessThanOrEqual(right!.x);
  });

  test('8. Mobile no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="vault-explorer"]');

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('9. TTS audio endpoint returns audio/mpeg', async ({ page }) => {
    const res = await page.request.get(
      '/api/tts?text=Halo+Dunia&voice=id-ID-GadisNeural&rate=%2B0%25'
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('audio/mpeg');
  });

  test('10. SSE events endpoint responds 200 with text/event-stream', async ({ page }) => {
    await page.goto('/');
    const sseResult = await page.evaluate(async () => {
      const controller = new AbortController();
      const res = await fetch('/api/events', { signal: controller.signal });
      const status = res.status;
      const contentType = res.headers.get('content-type') || '';
      controller.abort();
      return { status, contentType };
    });

    expect(sseResult.status).toBe(200);
    expect(sseResult.contentType).toContain('text/event-stream');
  });

  test('11. Multi-Vault Switcher displays vaults and switches between Donna Global Vault and Projects OKF', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('[data-testid="vault-switcher-btn"]');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Donna Global Vault');

    // Click to open switcher popover
    await btn.click();
    await page.waitForSelector('text=Daftar Vault OKF');

    // Find and click Projects OKF
    const projectsBtn = page.locator('button:has-text("Projects OKF")');
    if (await projectsBtn.count() > 0) {
      await projectsBtn.click();
      await expect(btn).toContainText('Projects OKF');

      // Verify that the tree updated
      await page.waitForSelector('[data-testid="vault-file"]');

      // Switch back to Donna Global Vault
      await btn.click();
      await page.locator('button:has-text("Donna Global Vault")').click();
      await expect(btn).toContainText('Donna Global Vault');
    }
  });
});
