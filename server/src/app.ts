import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { MAX_MODEL_BYTES } from '@salla/shared';
import { registerAuth } from './auth.js';
import { runDailyBackup } from './backup.js';
import { cleanupImages } from './cleanup.js';
import type { AppConfig } from './config.js';
import { openDb, type DB } from './db.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerHallRoutes } from './routes/halls.js';
import { registerImageRoutes } from './routes/images.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerPlanningRoutes } from './routes/planning.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { purgeTrash, registerProjectRoutes } from './routes/projects.js';
import { registerScanRoutes } from './routes/scans.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerUserRoutes } from './routes/users.js';
import { seed } from './seed.js';

const BACKUP_CHECK_MS = 60 * 60 * 1000;

export interface BuiltApp {
  app: FastifyInstance;
  db: DB;
}

export async function buildApp(config: AppConfig): Promise<BuiltApp> {
  const app = Fastify({
    logger: config.logger,
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: config.trustProxy ?? false,
  });
  const db = openDb(config.dbPath);
  seed(db, {
    adminUser: config.adminUser,
    adminPassword: config.adminPassword,
    production: config.production,
    log: (m) => app.log.warn(m),
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_MODEL_BYTES, files: 1 } });

  app.get('/api/health', async () => ({ ok: true }));
  registerAuth(app, db, config.secureCookies);
  registerProjectRoutes(app, db, config.dataDir);
  registerHallRoutes(app, db);
  registerCatalogRoutes(app, db);
  registerUploadRoutes(app, db, config.dataDir);
  registerLibraryRoutes(app, db, config.dataDir);
  registerImageRoutes(app, config.dataDir);
  registerPlanningRoutes(app, db);
  registerSettingsRoutes(app, db);
  registerUserRoutes(app, db);
  registerScanRoutes(app, db, config.dataDir, config.scanWorkerToken);

  // Uploaded GLB models.
  const uploads = path.join(config.dataDir, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploads,
    prefix: '/uploads/',
    decorateReply: false,
    maxAge: '1d',
  });

  // Built frontend + SPA fallback (production).
  if (config.webDist && fs.existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (
        req.method === 'GET' &&
        !req.url.startsWith('/api/') &&
        !req.url.startsWith('/uploads/')
      ) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  // Nightly backup: check hourly, copy once per day, keep 14 days. Then remove floor-plan
  // photos nothing uses any more.
  if (config.dbPath !== ':memory:') {
    const backup = () =>
      runDailyBackup(db, config.dataDir)
        .catch((err: unknown) => app.log.error(err, 'backup failed'))
        .then(() => {
          try {
            const purged = purgeTrash(db);
            if (purged) app.log.info({ purged }, 'removed projects from the bin');
            const removed = cleanupImages(db, config.dataDir);
            if (removed.length) app.log.info({ removed }, 'removed unused floor-plan photos');
          } catch (err) {
            app.log.error(err, 'cleanup failed');
          }
        });
    app.addHook('onReady', async () => {
      void backup();
    });
    const timer = setInterval(backup, BACKUP_CHECK_MS);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }
  app.addHook('onClose', async () => db.close());

  return { app, db };
}
