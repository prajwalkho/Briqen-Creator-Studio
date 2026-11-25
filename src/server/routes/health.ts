import { execFile } from 'child_process';
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { promisify } from 'util';
import { db } from '../../db/index.ts';
import { hasGeminiApiKey } from '../providers/aiClient.ts';

const execFileAsync = promisify(execFile);
export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let dbHealthy = false;
  let ffmpegHealthy = false;

  try {
    await db.execute(sql`SELECT 1`);
    dbHealthy = true;
  } catch (err) {
    console.error('Health check DB error:', err);
  }

  try {
    await execFileAsync('ffmpeg', ['-version']);
    ffmpegHealthy = true;
  } catch {
    ffmpegHealthy = false;
  }

  const healthy = dbHealthy && ffmpegHealthy;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    service: 'Briqen Creator Studio API',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: dbHealthy ? 'ok' : 'unavailable',
      ffmpeg: ffmpegHealthy ? 'ok' : 'unavailable',
      geminiConfigured: hasGeminiApiKey(),
    },
  });
});
