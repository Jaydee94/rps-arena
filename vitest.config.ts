import { defineConfig } from 'vitest/config';

// Vitest 5 replaced `vitest.workspace.ts` / `defineWorkspace` with `test.projects`.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'scripts'],
  },
});
