import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
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
import { loadAIConfig } from '../ai/config.ts';
import { ProviderTimeoutError } from '../ai/exceptions.ts';
import {
  getMediaProvider,
  type MediaGenerationOutput,
  type MediaGenerationRequest,
} from '../providers/mediaProvider.ts';
import { createSignedMediaUrl, readObjectBuffer, resolveSafeStoragePath, saveObject } from '../storage.ts';

const execFileAsync = promisify(execFile);

// Track active in-flight jobs for cooperative AbortController cancellation
const activeControllers = new Map<string, AbortController>();

// Optional deterministic hook used exclusively by automated tests to simulate delays/timeouts/failures
export type JobWorkerTestSimulator = (
  req: MediaGenerationRequest,
  context: { jobId: string; attemptId: string; attemptNumber: number; signal: AbortSignal }
) => Promise<MediaGenerationOutput | null>;

let testSimulator: JobWorkerTestSimulator | null = null;
export function setJobWorkerTestSimulator(fn: JobWorkerTestSimulator | null) {
  testSimulator = fn;
}

export function calculateCreditCost(
  mediaType: 'image' | 'video' | 'audio_tts' | 'audio_music',
  provider: 'gemini' | 'openai' | 'mock',
  model: string
): number {
  if (provider === 'mock') return 1;
  switch (mediaType) {
    case 'image':
      return provider === 'openai' ? 10 : model === 'gemini-nano-banana-2.1' ? 12 : 5;
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

function actionTypeForMedia(mediaType: MediaGenerationRequest['mediaType']): string {
  switch (mediaType) {
    case 'image':
      return 'image_generation';
    case 'video':
      return 'video_generation';
    case 'audio_tts':
      return 'tts_generation';
    case 'audio_music':
      return 'music_generation';
    default:
      return 'media_generation';
  }
}

export interface EnqueueGenerationParams {
  projectId: string;
  sceneId?: string | null;
  userId: string;
  idempotencyKey?: string;
  requestTimeoutMs?: number;
  request: MediaGenerationRequest;
}

export async function enqueueMediaGenerationJob(params: EnqueueGenerationParams) {
  const { projectId, sceneId, userId, request, requestTimeoutMs } = params;
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
        actionType: actionTypeForMedia(request.mediaType),
        mediaType: request.mediaType,
        provider: request.provider,
        model: request.model,
        prompt: request.prompt,
        status: 'queued',
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
        provider: request.provider,
        status: 'queued',
        progress: 5,
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
    setImmediate(() => {
      void executeGenerationAttempt(
        txResult.job.id,
        txResult.attemptId!,
        1,
        request,
        requestTimeoutMs
      ).catch((err) => {
        console.error('Unhandled background generation error:', err);
      });
    });
  }

  return txResult;
}

export async function retryGenerationJob(
  jobId: string,
  userId: string,
  referenceImage?: { base64: string; mimeType: string },
  requestTimeoutMs?: number
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
    if (job.status === 'queued' || job.status === 'processing' || job.status === 'retrying') {
      throw new Error('Job is currently active and cannot be retried yet.');
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

    // Technical retry REUSES action.id and NEVER inserts another billingTransaction or deducts credits
    const [updatedJob] = await tx
      .update(generationJobs)
      .set({
        status: 'retrying',
        progress: 10,
        attemptCount: nextAttemptNum,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id))
      .returning();

    await tx
      .update(generationActions)
      .set({ status: 'processing' })
      .where(eq(generationActions.id, action.id));

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
    provider: prep.action.provider as 'gemini' | 'openai' | 'mock',
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
    void executeGenerationAttempt(
      prep.job.id,
      prep.attempt.id,
      prep.attempt.attemptNumber,
      req,
      requestTimeoutMs
    ).catch((err) => {
      console.error('Unhandled retry error:', err);
    });
  });

  return prep;
}

export async function cancelGenerationJob(jobId: string, userId: string) {
  const controller = activeControllers.get(jobId);
  if (controller) {
    controller.abort(new Error('Job cancelled by user.'));
  }

  return db.transaction(async (tx) => {
    const jobRows = await tx
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.id, jobId), eq(generationJobs.userId, userId)))
      .limit(1);
    const job = jobRows[0];
    if (!job) {
      throw new Error('Generation job not found.');
    }
    if (job.status === 'succeeded' || job.status === 'cancelled') {
      return job;
    }

    const [updated] = await tx
      .update(generationJobs)
      .set({
        status: 'cancelled',
        errorMessage: 'Cancelled by user.',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id))
      .returning();

    await tx
      .update(generationActions)
      .set({ status: 'cancelled' })
      .where(eq(generationActions.id, job.actionId));

    await tx
      .update(generationAttempts)
      .set({
        status: 'stale_ignored',
        errorMessage: 'Job cancelled before attempt completed.',
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(generationAttempts.jobId, job.id),
          inArray(generationAttempts.status, ['queued', 'processing'])
        )
      );

    if (job.sceneId) {
      const scRows = await tx.select().from(scenes).where(eq(scenes.id, job.sceneId)).limit(1);
      const sc = scRows[0];
      if (sc) {
        await tx
          .update(scenes)
          .set({
            generationStatus: sc.selectedAssetId ? 'succeeded' : 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(scenes.id, sc.id));
      }
    }

    return updated;
  });
}

export async function acceptAssetForScene(assetId: string, userId: string, targetSceneId?: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
      .limit(1);
    const asset = rows[0];
    if (!asset) {
      throw new Error('Asset not found.');
    }

    const resolvedSceneId = targetSceneId || asset.sceneId;
    if (!resolvedSceneId) {
      throw new Error('Target sceneId is required.');
    }

    const scRows = await tx.select().from(scenes).where(eq(scenes.id, resolvedSceneId)).limit(1);
    const sc = scRows[0];
    if (!sc) {
      throw new Error('Target scene not found.');
    }

    const projRows = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, sc.projectId), eq(projects.userId, userId)))
      .limit(1);
    if (!projRows[0]) {
      throw new Error('Forbidden: scene belongs to another account.');
    }

    const [updatedAsset] = await tx
      .update(assets)
      .set({ isAccepted: true, sceneId: resolvedSceneId })
      .where(eq(assets.id, asset.id))
      .returning();

    if (asset.assetType === 'audio_tts') {
      await tx
        .update(scenes)
        .set({ voiceoverAssetId: asset.id, updatedAt: new Date() })
        .where(eq(scenes.id, resolvedSceneId));
    } else {
      await tx
        .update(scenes)
        .set({ selectedAssetId: asset.id, generationStatus: 'succeeded', updatedAt: new Date() })
        .where(eq(scenes.id, resolvedSceneId));

      // Cancel/supersede any other in-flight jobs on this scene so late responses cannot overwrite the user's choice
      const inFlight = await tx
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.sceneId, resolvedSceneId),
            inArray(generationJobs.status, ['queued', 'processing', 'retrying'])
          )
        );
      for (const job of inFlight) {
        if (asset.generationActionId && job.actionId === asset.generationActionId) continue;
        await tx
          .update(generationJobs)
          .set({
            status: 'cancelled',
            errorMessage: 'Superseded by user-accepted asset.',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, job.id));
        const ctrl = activeControllers.get(job.id);
        if (ctrl) ctrl.abort(new Error('Superseded by user-accepted asset.'));
      }
    }

    return updatedAsset;
  });
}

export async function rejectAssetForScene(assetId: string, userId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
      .limit(1);
    const asset = rows[0];
    if (!asset) {
      throw new Error('Asset not found.');
    }

    const [updatedAsset] = await tx
      .update(assets)
      .set({ isAccepted: false })
      .where(eq(assets.id, asset.id))
      .returning();

    let fallbackAssetId: string | null = null;
    if (asset.sceneId) {
      const scRows = await tx.select().from(scenes).where(eq(scenes.id, asset.sceneId)).limit(1);
      const sc = scRows[0];
      if (sc && sc.selectedAssetId === asset.id) {
        // Preserve previous accepted asset on the scene if one exists
        const prevRows = await tx
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.sceneId, sc.id),
              eq(assets.isAccepted, true),
              ne(assets.id, asset.id)
            )
          )
          .orderBy(desc(assets.createdAt))
          .limit(1);

        fallbackAssetId = prevRows[0]?.id ?? null;
        await tx
          .update(scenes)
          .set({
            selectedAssetId: fallbackAssetId,
            generationStatus: fallbackAssetId ? 'succeeded' : 'idle',
            updatedAt: new Date(),
          })
          .where(eq(scenes.id, sc.id));
      } else if (sc && sc.voiceoverAssetId === asset.id) {
        await tx
          .update(scenes)
          .set({ voiceoverAssetId: null, updatedAt: new Date() })
          .where(eq(scenes.id, sc.id));
      }
    }

    return { asset: updatedAsset, fallbackAssetId };
  });
}

async function runWithTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  providerName: string,
  jobId: string
): Promise<T> {
  const controller = new AbortController();
  activeControllers.set(jobId, controller);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const err = new ProviderTimeoutError(
        `AI provider "${providerName}" exceeded timeout of ${Math.round(timeoutMs / 1000)}s.`,
        providerName
      );
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([work(controller.signal), timeoutPromise]);
  } catch (err) {
    if (timedOut) {
      throw new ProviderTimeoutError(
        `AI provider "${providerName}" exceeded timeout of ${Math.round(timeoutMs / 1000)}s.`,
        providerName
      );
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    activeControllers.delete(jobId);
  }
}

async function executeGenerationAttempt(
  jobId: string,
  attemptId: string,
  attemptNumber: number,
  request: MediaGenerationRequest,
  requestTimeoutMs?: number
) {
  const startedAtMs = Date.now();
  const startedAtDate = new Date(startedAtMs);
  const effectiveTimeoutMs =
    requestTimeoutMs ?? Math.max(500, loadAIConfig().requestTimeoutSec * 1000);

  try {
    const jobRows = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
    const job = jobRows[0];
    if (!job) return;
    if (job.status === 'cancelled') {
      await db
        .update(generationAttempts)
        .set({
          status: 'stale_ignored',
          errorMessage: 'Job already cancelled before execution.',
          finishedAt: new Date(),
        })
        .where(eq(generationAttempts.id, attemptId));
      return;
    }

    await db
      .update(generationAttempts)
      .set({ status: 'processing', startedAt: startedAtDate })
      .where(eq(generationAttempts.id, attemptId));

    await db
      .update(generationJobs)
      .set({
        status: 'processing',
        progress: 25,
        startedAt: job.startedAt || startedAtDate,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, jobId));

    await db
      .update(generationActions)
      .set({ status: 'processing' })
      .where(eq(generationActions.id, job.actionId));

    if (job.sceneId && (request.mediaType === 'image' || request.mediaType === 'video')) {
      await db
        .update(scenes)
        .set({ generationStatus: 'processing', updatedAt: new Date() })
        .where(eq(scenes.id, job.sceneId));
    }

    const output = await runWithTimeout(
      async (signal) => {
        if (testSimulator) {
          const simResult = await testSimulator(request, {
            jobId,
            attemptId,
            attemptNumber,
            signal,
          });
          if (simResult) return simResult;
        }
        const provider = getMediaProvider(request.provider);
        return provider.generate(request, signal);
      },
      effectiveTimeoutMs,
      request.provider,
      jobId
    );

    await db
      .update(generationJobs)
      .set({
        progress: 75,
        providerJobId: output.providerJobId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, jobId));

    const fileId = crypto.randomUUID();
    const fileName = `${request.mediaType}_${fileId.slice(0, 8)}.${output.fileExtension}`;
    const storageKey = `projects/${job.projectId}/${request.mediaType}/${fileName}`;
    const { sizeBytes } = await saveObject(storageKey, output.buffer);
    const durationMs = Date.now() - startedAtMs;

    // Transactional acceptance & late-response guard
    await db.transaction(async (tx) => {
      const freshJobRows = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .limit(1);
      const freshJob = freshJobRows[0];
      if (!freshJob) return;

      const isLateOrCancelled =
        freshJob.status === 'cancelled' ||
        freshJob.status === 'timed_out' ||
        Boolean(freshJob.acceptedAttemptId && freshJob.acceptedAttemptId !== attemptId);

      if (isLateOrCancelled) {
        await tx
          .update(generationAttempts)
          .set({
            status: 'stale_ignored',
            providerRequestId: output.providerRequestId ?? output.providerJobId ?? null,
            usageJson: (output.usage as unknown as Record<string, unknown>) ?? null,
            durationMs,
            finishedAt: new Date(),
            errorMessage:
              freshJob.status === 'cancelled'
                ? 'Ignored late provider completion because the job was cancelled or superseded.'
                : freshJob.status === 'timed_out'
                  ? 'Ignored late provider completion after timeout.'
                  : 'Ignored late completion because another attempt was already accepted.',
          })
          .where(eq(generationAttempts.id, attemptId));
        return;
      }

      // Also verify scene does not already have an explicitly accepted asset created after this job
      let sceneHasNewerAccepted = false;
      if (freshJob.sceneId) {
        const scRows = await tx
          .select()
          .from(scenes)
          .where(eq(scenes.id, freshJob.sceneId))
          .limit(1);
        const sc = scRows[0];
        if (sc?.selectedAssetId) {
          const curAssetRows = await tx
            .select()
            .from(assets)
            .where(eq(assets.id, sc.selectedAssetId))
            .limit(1);
          const curAsset = curAssetRows[0];
          if (curAsset && curAsset.isAccepted && curAsset.createdAt > freshJob.createdAt) {
            sceneHasNewerAccepted = true;
          }
        }
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
          model: output.modelUsed || request.model,
          promptUsed: request.prompt,
          metadataJson: {
            ...(output.metadata ?? {}),
            providerJobId: output.providerJobId,
            providerRequestId: output.providerRequestId,
          },
          generationActionId: freshJob.actionId,
          isAccepted: !sceneHasNewerAccepted,
        })
        .returning();

      await tx
        .update(generationAttempts)
        .set({
          status: sceneHasNewerAccepted ? 'stale_ignored' : 'succeeded',
          providerRequestId: output.providerRequestId ?? output.providerJobId ?? null,
          usageJson: (output.usage as unknown as Record<string, unknown>) ?? null,
          durationMs,
          finishedAt: new Date(),
          ...(sceneHasNewerAccepted
            ? { errorMessage: 'Scene already has a newer accepted asset; saved as candidate only.' }
            : {}),
        })
        .where(eq(generationAttempts.id, attemptId));

      await tx
        .update(generationJobs)
        .set({
          status: 'succeeded',
          progress: 100,
          providerJobId: output.providerJobId ?? freshJob.providerJobId ?? null,
          acceptedAttemptId: sceneHasNewerAccepted ? freshJob.acceptedAttemptId : attemptId,
          resultAssetId: asset.id,
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(generationJobs.id, jobId));

      await tx
        .update(generationActions)
        .set({ status: 'completed' })
        .where(eq(generationActions.id, freshJob.actionId));

      await tx
        .update(billingTransactions)
        .set({
          status: 'settled',
          actualCredits: sql`${billingTransactions.estimatedCredits}`,
          updatedAt: new Date(),
        })
        .where(eq(billingTransactions.actionId, freshJob.actionId));

      if (freshJob.sceneId && !sceneHasNewerAccepted) {
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
    const durationMs = Date.now() - startedAtMs;
    const isTimeout =
      error instanceof ProviderTimeoutError ||
      (error instanceof Error && error.name === 'ProviderTimeoutError');
    const message = error instanceof Error ? error.message : 'Generation failed.';
    console.error(`Generation attempt ${attemptId} failed:`, error);

    await db.transaction(async (tx) => {
      const freshJobRows = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .limit(1);
      const freshJob = freshJobRows[0];

      if (freshJob?.status === 'cancelled') {
        await tx
          .update(generationAttempts)
          .set({
            status: 'stale_ignored',
            errorMessage: 'Attempt aborted because job was cancelled.',
            durationMs,
            finishedAt: new Date(),
          })
          .where(eq(generationAttempts.id, attemptId));
        return;
      }

      const failStatus = isTimeout ? 'timed_out' : 'failed';

      await tx
        .update(generationAttempts)
        .set({
          status: failStatus,
          errorMessage: message,
          durationMs,
          finishedAt: new Date(),
        })
        .where(eq(generationAttempts.id, attemptId));

      // Never overwrite an already accepted job or wipe existing scene selectedAssetId
      if (freshJob && !freshJob.acceptedAttemptId) {
        await tx
          .update(generationJobs)
          .set({
            status: failStatus,
            progress: 0,
            errorMessage: message,
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, jobId));

        await tx
          .update(generationActions)
          .set({ status: 'failed' })
          .where(eq(generationActions.id, freshJob.actionId));

        if (freshJob.sceneId) {
          await tx
            .update(scenes)
            .set({
              generationStatus: failStatus,
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
  quality?: 'standard' | 'low';
}) {
  const { projectId, userId, title, aspectRatio, musicAssetId, quality = 'standard' } = params;

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
    const resolution =
      quality === 'low'
        ? aspectRatio === '9:16'
          ? '360x640'
          : '640x360'
        : aspectRatio === '9:16'
          ? '720x1280'
          : '1280x720';

    const snapshot = {
      aspectRatio,
      quality,
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
        currentStep:
          quality === 'low'
            ? 'Queued for fast 360p quick draft render'
            : 'Queued for FFmpeg rendering',
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
    const isLowResDraft = Math.min(width, height) <= 360;
    const targetFps = isLowResDraft ? 24 : 30;
    const encodePreset = isLowResDraft ? 'ultrafast' : 'veryfast';
    const encodeCrf = isLowResDraft ? '28' : '23';

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

      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#0B0D12,setsar=1,fps=${targetFps}`;

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
          '-preset',
          encodePreset,
          '-crf',
          encodeCrf,
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
          '-preset',
          encodePreset,
          '-crf',
          encodeCrf,
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
