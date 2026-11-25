import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { healthRouter } from './src/server/routes/health.ts';
import { projectsRouter } from './src/server/routes/projects.ts';
import { scriptsRouter } from './src/server/routes/scripts.ts';
import { scenesRouter } from './src/server/routes/scenes.ts';
import { generationRouter } from './src/server/routes/generation.ts';
import { assetsAndExportsRouter } from './src/server/routes/assetsAndExports.ts';

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

// Simple per-IP sliding-window rate limiter for API protection
const rateBucket = new Map<string, { count: number; resetAt: number }>();
function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/media/signed')) return next();
  const ip = req.ip || 'local';
  const now = Date.now();
  const entry = rateBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 300) {
    return res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Please wait a moment and try again.',
    });
  }
  next();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Structured request logging (never logs Authorization headers or secrets)
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (!req.path.startsWith('/v1/media/signed')) {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      }
    });
    next();
  });

  app.use('/health', healthRouter);

  app.use('/api/v1', apiRateLimiter);
  app.use('/api/v1', assetsAndExportsRouter);
  app.use('/api/v1', projectsRouter);
  app.use('/api/v1', scriptsRouter);
  app.use('/api/v1', scenesRouter);
  app.use('/api/v1', generationRouter);

  // Unknown API routes return JSON 404
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found.' });
  });

  // Centralized error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Internal server error.',
    });
  });

  if (!isProd) {
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
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Briqen Creator Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Briqen Creator Studio server:', err);
  process.exit(1);
});
