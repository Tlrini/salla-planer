import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Test against the shared TypeScript sources, never a stale dist build.
    alias: { '@salla/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
