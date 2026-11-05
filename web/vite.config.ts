import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use @salla/shared TypeScript sources directly (no pre-build needed in dev).
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:3001', '/uploads': 'http://localhost:3001' },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
