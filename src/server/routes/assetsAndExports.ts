import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import multer from 'multer';
import { db } from '../../db/index.ts';
import { assets, exportJobs, exportsTable, projects, scenes } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import {
  createSignedMediaUrl,
  deleteObject,
  resolveSafeStoragePath,
  saveObject,
  verifySignedMediaParams,
} from '../storage.ts';
import { acceptAssetForScene, enqueueExportJob } from '../workers/jobWorker.ts';
import { logUserActivity } from '../services/activityService.ts';

export const assetsAndExportsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
]);

// Signed URL media streaming endpoint (supports Range requests for MP4/audio seeking)
assetsAndExportsRouter.get('/media/signed', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const exp = typeof req.query.exp === 'string' ? req.query.exp : '';
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
  const download = req.query.download === '1';

  if (!verifySignedMediaParams(key, exp, sig)) {
    return res.status(403).json({ success: false, message: 'Invalid or expired media signature.' });
  }

  try {
    const filePath = resolveSafeStoragePath(key);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Media object not found.' });
    }

    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.mp4'
        ? 'video/mp4'
        : ext === '.webm'
          ? 'video/webm'
          : ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : ext === '.wav'
                  ? 'audio/wav'
                  : ext === '.mp3'
                    ? 'audio/mpeg'
                    : 'application/octet-stream';

    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Signed media stream error:', error);
    res.status(500).json({ success: false, message: 'Failed to read media object.' });
  }
});

// Protected routes below
assetsAndExportsRouter.use(requireAuth);

assetsAndExportsRouter.get('/projects/:projectId/assets', async (req: AuthRequest, res) => {
  try {
    const projRows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, req.dbUser!.id)))
      .limit(1);
    if (!projRows[0]) return res.status(404).json({ success: false, message: 'Project not found.' });

    const list = await db
      .select()
      .from(assets)
      .where(eq(assets.projectId, projRows[0].id))
      .orderBy(desc(assets.createdAt));

    const enriched = list.map((a) => ({
      ...a,
      signedUrl: createSignedMediaUrl(a.storageKey),
      downloadUrl: `${createSignedMediaUrl(a.storageKey)}&download=1`,
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('List assets error:', error);
    res.status(500).json({ success: false, message: 'Failed to load media library.' });
  }
});

assetsAndExportsRouter.post(
  '/projects/:projectId/assets/upload',
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const projRows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, req.dbUser!.id)))
        .limit(1);
      if (!projRows[0]) return res.status(404).json({ success: false, message: 'Project not found.' });

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }
      if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Unsupported file type.' });
      }

      const sceneId = typeof req.body?.sceneId === 'string' && req.body.sceneId ? req.body.sceneId : null;
      const assetType = req.file.mimetype.startsWith('video/')
        ? 'video'
        : req.file.mimetype.startsWith('audio/')
          ? 'audio_music'
          : 'image';

      const ext = path.extname(req.file.originalname) || (assetType === 'video' ? '.mp4' : '.png');
      const fileName = `upload_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const storageKey = `projects/${projRows[0].id}/uploads/${fileName}`;
      const { sizeBytes } = await saveObject(storageKey, req.file.buffer);

      const [created] = await db
        .insert(assets)
        .values({
          projectId: projRows[0].id,
          sceneId,
          userId: req.dbUser!.id,
          assetType,
          mimeType: req.file.mimetype,
          storageKey,
          fileName: req.file.originalname || fileName,
          fileSizeBytes: sizeBytes,
          provider: 'upload',
          model: 'user-upload',
          isAccepted: Boolean(sceneId),
        })
        .returning();

      if (sceneId && (assetType === 'image' || assetType === 'video')) {
        await db
          .update(scenes)
          .set({ selectedAssetId: created.id, generationStatus: 'succeeded', updatedAt: new Date() })
          .where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projRows[0].id)));
      }

      await logUserActivity({
        userId: req.dbUser!.id,
        activityType: 'asset_uploaded',
        description: `Uploaded media asset "${created.fileName}".`,
        relatedProjectId: projRows[0].id,
        relatedAssetId: created.id,
      });

      res.status(201).json({
        success: true,
        message: 'Media asset uploaded',
        data: {
          ...created,
          signedUrl: createSignedMediaUrl(created.storageKey),
          downloadUrl: `${createSignedMediaUrl(created.storageKey)}&download=1`,
        },
      });
    } catch (error) {
      console.error('Upload asset error:', error);
      res.status(500).json({ success: false, message: 'Upload failed.' });
    }
  }
);

assetsAndExportsRouter.post('/assets/:assetId/select', async (req: AuthRequest, res) => {
  try {
    const targetSceneId = typeof req.body?.sceneId === 'string' ? req.body.sceneId : undefined;
    await acceptAssetForScene(req.params.assetId, req.dbUser!.id, targetSceneId);
    res.json({ success: true, message: 'Asset selected for scene' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to assign asset.';
    const status = msg.includes('not found') ? 404 : msg.includes('Forbidden') ? 403 : 400;
    res.status(status).json({ success: false, message: msg });
  }
});

assetsAndExportsRouter.delete('/assets/:assetId', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, req.params.assetId), eq(assets.userId, req.dbUser!.id)))
      .limit(1);
    const asset = rows[0];
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });

    // Prevent deleting if currently assigned to a scene
    const inUse = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.selectedAssetId, asset.id))
      .limit(1);
    if (inUse.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This asset is currently active on a scene. Assign another asset before deleting.',
      });
    }

    await db.delete(assets).where(eq(assets.id, asset.id));
    await deleteObject(asset.storageKey);

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'asset_deleted',
      description: `Deleted media asset "${asset.fileName}".`,
      relatedProjectId: asset.projectId,
    });

    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete asset.' });
  }
});

// Draft Video Export (FFmpeg)
assetsAndExportsRouter.post('/projects/:projectId/exports', async (req: AuthRequest, res) => {
  try {
    const projRows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, req.dbUser!.id)))
      .limit(1);
    const project = projRows[0];
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const title = typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : `${project.title} Draft`;

    const musicAssetId =
      typeof req.body?.musicAssetId === 'string' && req.body.musicAssetId
        ? req.body.musicAssetId
        : project.selectedMusicAssetId;

    const quality = req.body?.quality === 'low' ? 'low' : 'standard';

    const result = await enqueueExportJob({
      projectId: project.id,
      userId: req.dbUser!.id,
      title,
      aspectRatio: project.aspectRatio,
      musicAssetId,
      quality,
    });

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'video_exported',
      description: `Queued ${quality === 'low' ? 'quick draft ' : ''}video export "${title}".`,
      relatedProjectId: project.id,
      metadata: { exportId: result.exportRecord.id, quality, resolution: result.exportRecord.resolution },
    });

    res.status(202).json({
      success: true,
      message:
        quality === 'low'
          ? 'Low-resolution quick draft export job queued'
          : 'Draft video export job queued',
      data: {
        export_id: result.exportRecord.id,
        job_id: result.exportJob.id,
        resolution: result.exportRecord.resolution,
        status: result.exportJob.status,
        status_url: `/api/v1/exports/${result.exportRecord.id}`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Export failed to start.';
    res.status(400).json({ success: false, message: msg });
  }
});

assetsAndExportsRouter.get('/exports/:exportId', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(exportsTable)
      .where(and(eq(exportsTable.id, req.params.exportId), eq(exportsTable.userId, req.dbUser!.id)))
      .limit(1);
    const exp = rows[0];
    if (!exp) return res.status(404).json({ success: false, message: 'Export not found.' });

    const jobRows = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.exportId, exp.id))
      .limit(1);

    res.json({
      success: true,
      data: {
        ...exp,
        job: jobRows[0] || null,
        previewUrl: exp.storageKey ? createSignedMediaUrl(exp.storageKey) : null,
        downloadUrl: exp.storageKey ? `${createSignedMediaUrl(exp.storageKey)}&download=1` : null,
      },
    });
  } catch (error) {
    console.error('Get export error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch export status.' });
  }
});

assetsAndExportsRouter.get('/projects/:projectId/exports', async (req: AuthRequest, res) => {
  try {
    const projRows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, req.dbUser!.id)))
      .limit(1);
    if (!projRows[0]) return res.status(404).json({ success: false, message: 'Project not found.' });

    const rows = await db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.projectId, projRows[0].id))
      .orderBy(desc(exportsTable.createdAt));

    const jobList = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.projectId, projRows[0].id));
    const jobMap = new Map(jobList.map((j) => [j.exportId, j]));

    const enriched = rows.map((exp) => ({
      ...exp,
      job: jobMap.get(exp.id) || null,
      previewUrl: exp.storageKey ? createSignedMediaUrl(exp.storageKey) : null,
      downloadUrl: exp.storageKey ? `${createSignedMediaUrl(exp.storageKey)}&download=1` : null,
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('List exports error:', error);
    res.status(500).json({ success: false, message: 'Failed to load exports.' });
  }
});
