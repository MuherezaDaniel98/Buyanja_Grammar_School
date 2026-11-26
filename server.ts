import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
import { initializeDatabaseSchema } from './server/db.js';
import { logger } from './server/logger.js';
import { academicsRouter } from './server/routes/academics.routes.js';
import { adminRouter } from './server/routes/admin.routes.js';
import { analyticsRouter } from './server/routes/analytics.routes.js';
import { authRouter } from './server/routes/auth.routes.js';
import { dashboardRouter } from './server/routes/dashboard.routes.js';
import { marksRouter } from './server/routes/marks.routes.js';
import { reportsRouter } from './server/routes/reports.routes.js';
import { studentsRouter } from './server/routes/students.routes.js';
import { seedDatabaseIfEmpty } from './server/seed.js';

export function createApp() {
  initializeDatabaseSchema();
  seedDatabaseIfEmpty();

  const app = express();
  app.set('trust proxy', 1);

  // HTTP security headers (iframe-compatible for AI Studio preview)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting on auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication requests. Please wait a moment and try again.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api', apiLimiter);

  // Serve uploaded assets (logos, student photos) safely
  const uploadsDir = path.resolve(process.cwd(), 'public/uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'buyanja-grammar-academic-system' });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/academics', academicsRouter);
  app.use('/api/marks', marksRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/admin', adminRouter);

  // API error handler
  app.use('/api', (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled API error');
    res.status(400).json({ error: err.message || 'An unexpected server error occurred.' });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'Buyanja Grammar School server running');
  });
}

// Only start HTTP listener when executed directly (not imported by Vitest)
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
if (!isTestEnv) {
  startServer().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });
}
