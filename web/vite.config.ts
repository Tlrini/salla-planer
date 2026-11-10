import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev:phone` runs Vite behind a gateway on 5173 that adds HTTPS (scripts/dev-phone.mjs).
// Live reload is off then: phones refuse its connection with a self-signed certificate.
const behindGateway = process.env.DEV_WEB_PORT;

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use @salla/shared TypeScript sources directly (no pre-build needed in dev).
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    host: true,
    port: behindGateway ? Number(behindGateway) : 5173,
    strictPort: !!behindGateway,
    ...(behindGateway ? { hmr: false } : {}),
    proxy: { '/api': 'http://localhost:3001', '/uploads': 'http://localhost:3001' },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
