import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  assets,
  billingTransactions,
  exportJobs,
  exportsTable,
  generationActions,
  generationAttempts,
  generationJobs,
  projects,
  scenes,
  users,
} from '../../db/schema.ts';
import { getMediaProvider, MediaGenerationRequest } from '../providers/mediaProvider.ts';
import { createSignedMediaUrl, readObjectBuffer, resolveSafeStoragePath, saveObject } from '../storage.ts';

const execFileAsync = promisify(execFile);

export function calculateCreditCost(
  mediaType: 'image' | 'video' | 'audio_tts' | 'audio_music',
  provider: 'gemini' | 'mock',
  model: string
): number {
  if (provider === 'mock') return 1;
  switch (mediaType) {
    case 'image':
      return model === 'gemini-nano-banana-2.1' ? 12 : 5;
    case 'video':
      return 35;
    case 'audio_tts':
      return 6;
    case 'audio_music':
      return model === 'lyria-3-pro-preview' ? 20 : 10;
    default:
      return 5;
  }
}

export interface EnqueueGenerationParams {
  projectId: string;
  sceneId?: string | null;
  userId: string;
  idempotencyKey?: string;
  request: MediaGenerationRequest;
}

export async function enqueueMediaGenerationJob(params: EnqueueGenerationParams) {
  const { projectId, sceneId, userId, request } = params;
  const idempotencyKey = params.idempotencyKey || crypto.randomUUID();
  const estimatedCredits = calculateCreditCost(request.mediaType, request.provider, request.model);

  const txResult = await db.transaction(async (tx) => {
    // 1. Idempotency check
    const existingAction = await tx
      .select()
      .from(generationActions)
      .where(eq(generationActions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingAction.length > 0) {
      const existingJob = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.actionId, existingAction[0].id))
        .limit(1);
      return {
        isDuplicate: true,
        action: existingAction[0],
        job: existingJob[0],
        attemptId: null as string | null,
      };
    }

    // 2. Check & reserve user credits atomically
    const userRows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    const currentUser = userRows[0];
    if (!currentUser) {
      throw new Error('User account not found.');
    }
    if (currentUser.creditsBalance < estimatedCredits) {
      throw new Error(
        `Insufficient studio credits (${currentUser.creditsBalance} remaining, ${estimatedCredits} required).`
      );
    }

    await tx
      .update(users)
      .set({
        creditsBalance: sql`${users.creditsBalance} - ${estimatedCredits}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // 3. Create generation action
    const [action] = await tx
      .insert(generationActions)
      .values({
        projectId,
        sceneId: sceneId ?? null,
        userId,
        idempotencyKey,
        mediaType: request.mediaType,
        provider: request.provider,
        model: request.model,
        prompt: request.prompt,
        configJson: {
          aspectRatio: request.aspectRatio,
          resolution: request.resolution,
          style: request.style,
          durationSec: request.durationSec,
          useSearchGrounding: request.useSearchGrounding,
          voiceName: request.voiceName,
          voiceStyle: request.voiceStyle,
          secondSpeakerText: request.secondSpeakerText,
          secondSpeakerVoice: request.secondSpeakerVoice,
        },
      })
      .returning();

    // 4. Create 1-to-1 billing transaction (prevents duplicate billing)
    await tx.insert(billingTransactions).values({
      actionId: action.id,
      userId,
      provider: request.provider,
      model: request.model,
      mediaType: request.mediaType,
      usageUnits: 1,
      estimatedCredits,
      status: 'reserved',
    });

    // 5. Create job & initial attempt
    const [job] = await tx
      .insert(generationJobs)
      .values({
        actionId: action.id,
        projectId,
        sceneId: sceneId ?? null,
        userId,
        status: 'queued',
        attemptCount: 1,
      })
      .returning();

    const [attempt] = await tx
      .insert(generationAttempts)
      .values({
        jobId: job.id,
        actionId: action.id,
        attemptNumber: 1,
        status: 'queued',
      })
      .returning();

    if (sceneId && (request.mediaType === 'image' || request.mediaType === 'video')) {
      await tx
        .update(scenes)
        .set({ generationStatus: 'queued', updatedAt: new Date() })
        .where(eq(scenes.id, sceneId));
    }

    return {
      isDuplicate: false,
      action,
      job,
      attemptId: attempt.id,
    };
  });

  if (!txResult.isDuplicate && txResult.attemptId) {
    // Dispatch asynchronously so HTTP 202 returns immediately
    setImmediate(() => {
      void executeGenerationAttempt(txResult.job.id, txResult.attemptId!, request).catch((err) => {
        console.error('Unhandled background generation error:', err);
      });
    });
  }

  return txResult;
}

export async function retryGenerationJob(
  jobId: string,
  userId: string,
  referenceImage?: { base64: string; mimeType: string }
) {
  const prep = await db.transaction(async (tx) => {
    const jobRows = await tx
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.id, jobId), eq(generationJobs.userId, userId)))
      .limit(1);

    const job = jobRows[0];
    if (!job) {
      throw new Error('Generation job not found.');
    }
    if (job.status === 'succeeded' || job.acceptedAttemptId) {
      throw new Error('Job already succeeded and has an accepted asset.');
    }

    const actionRows = await tx
      .select()
      .from(generationActions)
      .where(eq(generationActions.id, job.actionId))
      .limit(1);
    const action = actionRows[0];
    if (!action) {
      throw new Error('Original generation action not found.');
    }

    const nextAttemptNum = job.attemptCount + 1;

    // Update job status to retrying — note we REUSE action.id and do NOT insert a new billingTransaction
    const [updatedJob] = await tx
      .update(generationJobs)
      .set({
        status: 'retrying',
        attemptCount: nextAttemptNum,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id))
      .returning();

    const [attempt] = await tx
      .insert(generationAttempts)
      .values({
        jobId: job.id,
        actionId: action.id,
        attemptNumber: nextAttemptNum,
        status: 'queued',
      })
      .returning();

    if (job.sceneId && (action.mediaType === 'image' || action.mediaType === 'video')) {
      await tx
        .update(scenes)
        .set({ generationStatus: 'retrying', updatedAt: new Date() })
        .where(eq(scenes.id, job.sceneId));
    }

    return { job: updatedJob, action, attempt };
  });

  const cfg = (prep.action.configJson || {}) as Record<string, unknown>;
  const req: MediaGenerationRequest = {
    mediaType: prep.action.mediaType as MediaGenerationRequest['mediaType'],
    provider: prep.action.provider as 'gemini' | 'mock',
    model: prep.action.model,
    prompt: prep.action.prompt,
    aspectRatio: cfg.aspectRatio as string | undefined,
    resolution: cfg.resolution as string | undefined,
    style: cfg.style as string | undefined,
    durationSec: cfg.durationSec as number | undefined,
    useSearchGrounding: Boolean(cfg.useSearchGrounding),
    voiceName: cfg.voiceName as string | undefined,
    voiceStyle: cfg.voiceStyle as string | undefined,
    secondSpeakerText: cfg.secondSpeakerText as string | undefined,
    secondSpeakerVoice: cfg.secondSpeakerVoice as string | undefined,
    referenceImageBase64: referenceImage?.base64,
    referenceImageMimeType: referenceImage?.mimeType,
  };

  setImmediate(() => {
    void executeGenerationAttempt(prep.job.id, prep.attempt.id, req).catch((err) => {
      console.error('Unhandled retry error:', err);
    });
  });

  return prep;
}

async function executeGenerationAttempt(
  jobId: string,
  attemptId: string,
  request: MediaGenerationRequest
) {
  const startedAt = Date.now();
  try {
    await db
      .update(generationAttempts)
      .set({ status: 'processing' })
      .where(eq(generationAttempts.id, attemptId));

    const jobRows = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
    const job = jobRows[0];
    if (!job) return;

    await db
      .update(generationJobs)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(generationJobs.id, jobId));

    if (job.sceneId && (request.mediaType === 'image' || request.mediaType === 'video')) {
      await db
        .update(scenes)
        .set({ generationStatus: 'processing', updatedAt: new Date() })
        .where(eq(scenes.id, job.sceneId));
    }

    const provider = getMediaProvider(request.provider);
    const output = await provider.generate(request);

    const fileId = crypto.randomUUID();
    const fileName = `${request.mediaType}_${fileId.slice(0, 8)}.${output.fileExtension}`;
    const storageKey = `projects/${job.projectId}/${request.mediaType}/${fileName}`;
    const { sizeBytes } = await saveObject(storageKey, output.buffer);
    const durationMs = Date.now() - startedAt;

    // Transactional acceptance check (prevents late/stale results from overwriting an already accepted asset)
    await db.transaction(async (tx) => {
      const freshJobRows = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .limit(1);
      const freshJob = freshJobRows[0];
      if (!freshJob) return;

      if (freshJob.acceptedAttemptId && freshJob.acceptedAttemptId !== attemptId) {
        // Late response protection: mark stale_ignored and do not overwrite accepted asset
        await tx
          .update(generationAttempts)
          .set({
            status: 'stale_ignored',
            durationMs,
            finishedAt: new Date(),
            errorMessage: 'Ignored late completion because another attempt was already accepted.',
          })
          .where(eq(generationAttempts.id, attemptId));
        return;
      }

      const [asset] = await tx
        .insert(assets)
        .values({
          projectId: freshJob.projectId,
          sceneId: freshJob.sceneId,
          userId: freshJob.userId,
          assetType: request.mediaType,
          mimeType: output.mimeType,
          storageKey,
          fileName,
          fileSizeBytes: sizeBytes,
          width: output.width ?? null,
          height: output.height ?? null,
          durationSec: output.durationSec ?? null,
          provider: request.provider,
          model: request.model,
          promptUsed: request.prompt,
          metadataJson: output.metadata ?? {},
          generationActionId: freshJob.actionId,
          isAccepted: true,
        })
        .returning();

      await tx
        .update(generationAttempts)
        .set({
          status: 'succeeded',
          durationMs,
          finishedAt: new Date(),
        })
        .where(eq(generationAttempts.id, attemptId));

      await tx
        .update(generationJobs)
        .set({
          status: 'succeeded',
          acceptedAttemptId: attemptId,
          resultAssetId: asset.id,
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(generationJobs.id, jobId));

      await tx
        .update(billingTransactions)
        .set({
          status: 'settled',
          actualCredits: sql`${billingTransactions.estimatedCredits}`,
          updatedAt: new Date(),
        })
        .where(eq(billingTransactions.actionId, freshJob.actionId));

      if (freshJob.sceneId) {
        if (request.mediaType === 'image' || request.mediaType === 'video') {
          await tx
            .update(scenes)
            .set({
              selectedAssetId: asset.id,
              generationStatus: 'succeeded',
              updatedAt: new Date(),
            })
            .where(eq(scenes.id, freshJob.sceneId));
        } else if (request.mediaType === 'audio_tts') {
          await tx
            .update(scenes)
            .set({
              voiceoverAssetId: asset.id,
              updatedAt: new Date(),
            })
            .where(eq(scenes.id, freshJob.sceneId));
        }
      }

      if (request.mediaType === 'image') {
        const projRows = await tx
          .select()
          .from(projects)
          .where(eq(projects.id, freshJob.projectId))
          .limit(1);
        if (projRows[0] && !projRows[0].thumbnailUrl) {
          await tx
            .update(projects)
            .set({
              thumbnailUrl: createSignedMediaUrl(storageKey, 3600 * 24 * 30),
              updatedAt: new Date(),
            })
            .where(eq(projects.id, freshJob.projectId));
        }
      } else if (request.mediaType === 'audio_music') {
        await tx
          .update(projects)
          .set({
            selectedMusicAssetId: asset.id,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, freshJob.projectId));
      }
    });
  } catch (error: unknown) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'Generation failed.';
    console.error(`Generation attempt ${attemptId} failed:`, error);

    await db.transaction(async (tx) => {
      const freshJobRows = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .limit(1);
      const freshJob = freshJobRows[0];

      await tx
        .update(generationAttempts)
        .set({
          status: 'failed',
          errorMessage: message,
          durationMs,
          finishedAt: new Date(),
        })
        .where(eq(generationAttempts.id, attemptId));

      // Never overwrite an already accepted job
      if (freshJob && !freshJob.acceptedAttemptId) {
        await tx
          .update(generationJobs)
          .set({
            status: 'failed',
            errorMessage: message,
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, jobId));

        if (freshJob.sceneId) {
          await tx
            .update(scenes)
            .set({
              generationStatus: 'failed',
              updatedAt: new Date(),
            })
            .where(eq(scenes.id, freshJob.sceneId));
        }
      }
    });
  }
}

export async function enqueueExportJob(params: {
  projectId: string;
  userId: string;
  title: string;
  aspectRatio: string;
  musicAssetId?: string | null;
}) {
  const { projectId, userId, title, aspectRatio, musicAssetId } = params;

  const result = await db.transaction(async (tx) => {
    const projectScenes = await tx
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, projectId))
      .orderBy(scenes.sceneOrder);

    if (projectScenes.length === 0) {
      throw new Error('Cannot export a project with no scenes.');
    }

    const missingAssets = projectScenes.filter((s) => !s.selectedAssetId);
    if (missingAssets.length > 0) {
      throw new Error(
        `Every scene must have a selected media asset before exporting. Missing asset on: ${missingAssets
          .map((s) => s.title)
          .join(', ')}`
      );
    }

    const totalDurationSec = projectScenes.reduce((sum, s) => sum + (s.durationSec || 5), 0);
    const resolution = aspectRatio === '9:16' ? '720x1280' : '1280x720';

    const snapshot = {
      aspectRatio,
      musicAssetId: musicAssetId || null,
      scenes: projectScenes.map((s) => ({
        sceneId: s.id,
        title: s.title,
        order: s.sceneOrder,
        durationSec: s.durationSec || 5,
        transition: s.transition || 'fade',
        assetId: s.selectedAssetId!,
        voiceoverAssetId: s.voiceoverAssetId || null,
      })),
    };

    const [exportRecord] = await tx
      .insert(exportsTable)
      .values({
        projectId,
        userId,
        title,
        format: 'mp4',
        resolution,
        totalDurationSec,
        snapshotJson: snapshot,
        musicAssetId: musicAssetId || null,
        status: 'queued',
      })
      .returning();

    const [exportJob] = await tx
      .insert(exportJobs)
      .values({
        exportId: exportRecord.id,
        projectId,
        status: 'queued',
        progressPct: 5,
        currentStep: 'Queued for FFmpeg rendering',
      })
      .returning();

    await tx
      .update(projects)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return { exportRecord, exportJob };
  });

  setImmediate(() => {
    void processExportJob(result.exportRecord.id).catch((err) => {
      console.error('Unhandled export job error:', err);
    });
  });

  return result;
}

async function processExportJob(exportId: string) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-export-'));
  try {
    const expRows = await db.select().from(exportsTable).where(eq(exportsTable.id, exportId)).limit(1);
    const exp = expRows[0];
    if (!exp) return;

    await db
      .update(exportJobs)
      .set({ status: 'processing', progressPct: 15, currentStep: 'Preparing scene media', updatedAt: new Date() })
      .where(eq(exportJobs.exportId, exportId));

    await db
      .update(exportsTable)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(exportsTable.id, exportId));

    const [widthStr, heightStr] = exp.resolution.split('x');
    const width = Number(widthStr) || 1280;
    const height = Number(heightStr) || 720;

    const segmentPaths: string[] = [];
    const totalScenes = exp.snapshotJson.scenes.length;

    for (let i = 0; i < totalScenes; i++) {
      const sc = exp.snapshotJson.scenes[i];
      const assetRows = await db.select().from(assets).where(eq(assets.id, sc.assetId)).limit(1);
      const asset = assetRows[0];
      if (!asset) {
        throw new Error(`Asset missing for scene "${sc.title}".`);
      }

      const srcPath = resolveSafeStoragePath(asset.storageKey);
      const segPath = path.join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp4`);
      const dur = Math.max(1, sc.durationSec || 5);

      let voicePath: string | null = null;
      if (sc.voiceoverAssetId) {
        const voRows = await db
          .select()
          .from(assets)
          .where(eq(assets.id, sc.voiceoverAssetId))
          .limit(1);
        if (voRows[0]) {
          const candidate = resolveSafeStoragePath(voRows[0].storageKey);
          if (fs.existsSync(candidate)) {
            voicePath = candidate;
          }
        }
      }

      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#0B0D12,setsar=1,fps=30`;

      if (asset.assetType === 'image' || asset.mimeType.startsWith('image/')) {
        const args = ['-y', '-loop', '1', '-t', String(dur), '-i', srcPath];
        if (voicePath) {
          args.push('-i', voicePath);
        } else {
          args.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${dur}`);
        }
        args.push(
          '-vf',
          scaleFilter,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-t',
          String(dur),
          segPath
        );
        await execFileAsync('ffmpeg', args);
      } else {
        // Video input: loop if shorter than dur, trim to dur
        const args = ['-y', '-stream_loop', '-1', '-t', String(dur), '-i', srcPath];
        if (voicePath) {
          args.push('-i', voicePath, '-map', '0:v:0', '-map', '1:a:0');
        } else {
          args.push('-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${dur}`, '-map', '0:v:0', '-map', '1:a:0');
        }
        args.push(
          '-vf',
          scaleFilter,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-t',
          String(dur),
          segPath
        );
        await execFileAsync('ffmpeg', args);
      }

      segmentPaths.push(segPath);
      const pct = Math.min(75, 20 + Math.round(((i + 1) / totalScenes) * 55));
      await db
        .update(exportJobs)
        .set({
          progressPct: pct,
          currentStep: `Rendered scene ${i + 1} of ${totalScenes}`,
          updatedAt: new Date(),
        })
        .where(eq(exportJobs.exportId, exportId));
    }

    // Concatenate normalized segments
    const concatListPath = path.join(tmpDir, 'concat.txt');
    const concatContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.promises.writeFile(concatListPath, concatContent, 'utf8');

    const joinedPath = path.join(tmpDir, 'joined.mp4');
    await db
      .update(exportJobs)
      .set({ progressPct: 82, currentStep: 'Combining timeline tracks', updatedAt: new Date() })
      .where(eq(exportJobs.exportId, exportId));

    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      joinedPath,
    ]);

    let finalPath = joinedPath;
    if (exp.musicAssetId) {
      const musicRows = await db.select().from(assets).where(eq(assets.id, exp.musicAssetId)).limit(1);
      if (musicRows[0]) {
        const musicPath = resolveSafeStoragePath(musicRows[0].storageKey);
        if (fs.existsSync(musicPath)) {
          const mixedPath = path.join(tmpDir, 'final_mixed.mp4');
          await db
            .update(exportJobs)
            .set({ progressPct: 90, currentStep: 'Mixing soundtrack audio', updatedAt: new Date() })
            .where(eq(exportJobs.exportId, exportId));

          await execFileAsync('ffmpeg', [
            '-y',
            '-i',
            joinedPath,
            '-stream_loop',
            '-1',
            '-i',
            musicPath,
            '-filter_complex',
            '[1:a]volume=0.22[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]',
            '-map',
            '0:v',
            '-map',
            '[aout]',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-shortest',
            mixedPath,
          ]);
          finalPath = mixedPath;
        }
      }
    }

    const finalBuffer = await fs.promises.readFile(finalPath);
    const storageKey = `projects/${exp.projectId}/exports/export_${exportId.slice(0, 8)}.mp4`;
    const { sizeBytes } = await saveObject(storageKey, finalBuffer);

    await db.transaction(async (tx) => {
      await tx
        .update(exportsTable)
        .set({
          storageKey,
          fileSizeBytes: sizeBytes,
          status: 'succeeded',
          updatedAt: new Date(),
        })
        .where(eq(exportsTable.id, exportId));

      await tx
        .update(exportJobs)
        .set({
          status: 'succeeded',
          progressPct: 100,
          currentStep: 'Export ready for preview & download',
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(exportJobs.exportId, exportId));

      await tx
        .update(projects)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(projects.id, exp.projectId));
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'FFmpeg export failed.';
    console.error(`Export job ${exportId} failed:`, error);
    await db
      .update(exportsTable)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(exportsTable.id, exportId));
    await db
      .update(exportJobs)
      .set({
        status: 'failed',
        errorMessage: message,
        currentStep: 'Export failed',
        updatedAt: new Date(),
      })
      .where(eq(exportJobs.exportId, exportId));
    const expRows = await db.select().from(exportsTable).where(eq(exportsTable.id, exportId)).limit(1);
    if (expRows[0]) {
      await db
        .update(projects)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(projects.id, expRows[0].projectId));
    }
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function readAssetAsBase64(assetId: string): Promise<{ base64: string; mimeType: string } | null> {
  const rows = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!rows[0]) return null;
  const buf = await readObjectBuffer(rows[0].storageKey);
  return { base64: buf.toString('base64'), mimeType: rows[0].mimeType };
}
