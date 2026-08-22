import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '.context/**', 'web/**'],
    testTimeout: 15_000,
  },
});
