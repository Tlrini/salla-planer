import { buildApp } from './app.js';
import { configFromEnv, isProduction } from './config.js';

// PORT is honored in production (default 3000). In development the API stays on 3001 behind the
// Vite proxy, even if a tool sets PORT for the web dev server. SALLA_PORT overrides both.
const port = Number(process.env.SALLA_PORT ?? (isProduction() ? (process.env.PORT ?? 3000) : 3001));
const host = process.env.HOST ?? '0.0.0.0';

const { app } = await buildApp(configFromEnv());
try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
