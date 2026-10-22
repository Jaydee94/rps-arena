import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  // svelteTesting() resolves Svelte's client build for jsdom and cleans up mounted components.
  plugins: [
    svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) }),
    svelteTesting(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
