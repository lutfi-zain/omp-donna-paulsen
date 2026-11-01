import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    {
      name: 'donna-tldraw-selfhosted',
      transform(code, id) {
        if (id.includes('LicenseManager') || id.includes('LicenseProvider') || id.includes('tldraw')) {
          let out = code;
          if (out.includes('shouldHideEditorAfterDelay')) {
            out = out.replace(
              /function shouldHideEditorAfterDelay\([^)]*\)\s*\{[\s\S]*?\}/,
              'function shouldHideEditorAfterDelay() { return false; }'
            );
          }
          if (out.includes('unlicensed-production')) {
            out = out.replaceAll('"unlicensed-production"', '"licensed"');
          }
          return out !== code ? { code: out, map: null } : null;
        }
        return null;
      },
    },
    tailwindcss(),
    sveltekit(),
  ],
  server: { port: 3456 },
  optimizeDeps: {
    include: [
      'clsx',
      'tailwind-merge',
      'tailwind-variants',
      'bits-ui',
      'fuse.js',
      'marked',
      'dompurify',
      'katex',
      'cytoscape',
      'mermaid',
      'tldraw',
      'react',
      'react-dom',
      'react-dom/client',
      '@milkdown/core',
      '@milkdown/ctx',
      '@milkdown/preset-commonmark',
      '@milkdown/preset-gfm',
      '@milkdown/plugin-listener',
      '@milkdown/theme-nord',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/lang-markdown',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/search',
    ],
  },
});
