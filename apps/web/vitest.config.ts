import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  // Resolve Svelte's client build so components can be mounted in jsdom.
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
  },
});
