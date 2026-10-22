import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // `npm run build` emits compiled tests into dist/; never run those a second time.
  test: { exclude: [...configDefaults.exclude, 'dist/**'] },
});
