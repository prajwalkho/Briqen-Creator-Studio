import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import fs from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import {
  assets,
  billingTransactions,
  generationAttempts,
  generationJobs,
  projects,
  scenes,
  users,
} from '../src/db/schema.ts';
import {
  ProviderCapabilityError,
  ProviderConfigurationError,
  SchemaValidationError,
} from '../src/server/ai/exceptions.ts';
import { getImageProvider, getLLMProvider, getVideoProvider } from '../src/server/ai/factory.ts';
import { OpenAIVideoProvider } from '../src/server/ai/providers/video/openaiVideoProvider.ts';
import { extractedScenesArraySchema } from '../src/server/ai/schemas.ts';
import { resolveSafeStoragePath } from '../src/server/storage.ts';
import {
  acceptAssetForScene,
  enqueueMediaGenerationJob,
  retryGenerationJob,
  setJobWorkerTestSimulator,
} from '../src/server/workers/jobWorker.ts';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

async function apiFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
  } = {}
) {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function pollJobUntilDone(urlPath: string, token: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await apiFetch(urlPath, { token });
    const status = res.data?.data?.status;
    if (status && !['queued', 'processing', 'retrying'].includes(status)) {
      return res.data.data;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for job at ${urlPath}`);
}

test('Provider factory respects environment selection and capability/config errors', async () => {
  const origLlm = process.env.LLM_PROVIDER;
  const origImg = process.env.IMAGE_PROVIDER;
  const origVid = process.env.VIDEO_PROVIDER;
  const origOpenAI = process.env.OPENAI_API_KEY;
  const origOpenAIVid = process.env.OPENAI_VIDEO_ENDPOINT;

  try {
    process.env.LLM_PROVIDER = 'mock';
    process.env.IMAGE_PROVIDER = 'mock';
    process.env.VIDEO_PROVIDER = 'mock';
    assert.equal(getLLMProvider().name, 'mock');
    assert.equal(getImageProvider().name, 'mock');
    assert.equal(getVideoProvider().name, 'mock');

    process.env.LLM_PROVIDER = 'openai';
    process.env.IMAGE_PROVIDER = 'openai';
    process.env.VIDEO_PROVIDER = 'openai';
    assert.equal(getLLMProvider().name, 'openai');
    assert.equal(getImageProvider().name, 'openai');
    assert.equal(getVideoProvider().name, 'openai');

    // Missing OPENAI_API_KEY fails cleanly with ProviderConfigurationError
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_VIDEO_ENDPOINT;
    await assert.rejects(
      () =>
        getLLMProvider('openai').generateScript({
          title: 'Test',
          brandName: 'Brand',
          targetAudience: 'Founders',
          platform: 'YouTube',
          contentType: 'YouTube',
          targetDurationSec: 30,
          language: 'English',
          toneOfVoice: 'Bold',
          marketingObjective: 'Sales',
        }),
      (err: unknown) => err instanceof ProviderConfigurationError
    );

    // Configured OPENAI_API_KEY without OPENAI_VIDEO_ENDPOINT throws ProviderCapabilityError cleanly
    process.env.OPENAI_API_KEY = 'sk-test-placeholder-123456';
    const openaiVid = new OpenAIVideoProvider();
    await assert.rejects(
      () =>
        openaiVid.generateVideo({
          prompt: 'Tracking studio shot',
          aspectRatio: '16:9',
          durationSec: 5,
        }),
      (err: unknown) => err instanceof ProviderCapabilityError
    );
  } finally {
    if (origLlm === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = origLlm;
    if (origImg === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = origImg;
    if (origVid === undefined) delete process.env.VIDEO_PROVIDER;
    else process.env.VIDEO_PROVIDER = origVid;
    if (origOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origOpenAI;
    if (origOpenAIVid === undefined) delete process.env.OPENAI_VIDEO_ENDPOINT;
    else process.env.OPENAI_VIDEO_ENDPOINT = origOpenAIVid;
  }
});

test('Scene extraction Zod schema validates valid JSON and rejects malformed scene payloads', () => {
  const valid = extractedScenesArraySchema.safeParse([
    {
      sceneNumber: 1,
      title: 'Hook',
      narration: 'Meet the future of desks.',
      visualDescription: 'Macro pan across walnut surface',
      imagePrompt: 'Studio desk hero shot',
      videoPrompt: 'Slow push in on walnut desk',
      durationSec: 5,
      transition: 'fade',
      mediaPreference: 'image',
    },
  ]);
  assert.equal(valid.success, true);

  const invalid = extractedScenesArraySchema.safeParse([
    {
      title: '',
      durationSec: 999,
      transition: 'unknown_wipe',
    },
  ]);
  assert.equal(invalid.success, false);
  const schemaErr = new SchemaValidationError('Invalid scene schema', 'test');
  assert.equal(schemaErr.code, 'SCHEMA_VALIDATION_FAILED');
});

test('End-to-end /api/v1/ai/* workflow: scripts, scenes, async image/video, accept/reject, and isolation', async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const emailA = `aitest-a-${suffix}@example.com`;
  const emailB = `aitest-b-${suffix}@example.com`;
  const password = 'Briqen!AITest2026';

  try {
    // Register & login User A and User B
    await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'AI Owner',
        email: emailA,
        password,
        confirmPassword: password,
        acceptTerms: true,
      },
    });
    const loginA = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password },
    });
    const tokenA = loginA.data.data.accessToken as string;

    await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'AI Intruder',
        email: emailB,
        password,
        confirmPassword: password,
        acceptTerms: true,
      },
    });
    const loginB = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailB, password },
    });
    const tokenB = loginB.data.data.accessToken as string;

    // 1. Provider overview endpoint exposes capabilities without secrets
    const provRes = await apiFetch('/ai/providers', { token: tokenA });
    assert.equal(provRes.status, 200);
    assert.ok(provRes.data.data.providers.llm.some((p: { name: string }) => p.name === 'openai'));
    assert.equal(JSON.stringify(provRes.data).includes('sk-'), false);

    // Create Project
    const projRes = await apiFetch('/projects', {
      method: 'POST',
      token: tokenA,
      body: {
        title: 'AI Integration Launch',
        brandName: 'Briqen Studio',
        targetAudience: 'Performance marketers',
        platform: 'YouTube',
        aspectRatio: '16:9',
      },
    });
    assert.equal(projRes.status, 201);
    const projectId = projRes.data.data.id as string;

    // 2. Script generation with topic & contentType
    const genScriptRes = await apiFetch('/ai/scripts/generate', {
      method: 'POST',
      token: tokenA,
      body: {
        projectId,
        topic: 'Automated video ad pipelines',
        title: 'Launch Script v1',
        contentType: 'advertisement',
        brandName: 'Briqen Studio',
        targetAudience: 'Growth teams',
        platform: 'YouTube',
        targetDurationSec: 30,
        language: 'English',
        toneOfVoice: 'Confident',
        marketingObjective: 'Conversions',
        provider: 'mock',
      },
    });
    assert.equal(genScriptRes.status, 201);
    assert.equal(genScriptRes.data.data.versionNumber, 1);
    assert.equal(genScriptRes.data.data.contentType, 'advertisement');
    assert.equal(genScriptRes.data.meta.isMock, true);
    const scriptId1 = genScriptRes.data.data.id as string;

    // 3. Script improvement preserves v1 and creates v2
    const improveRes = await apiFetch(`/ai/scripts/${scriptId1}/improve`, {
      method: 'POST',
      token: tokenA,
      body: {
        action: 'clarity',
        provider: 'mock',
      },
    });
    assert.equal(improveRes.status, 201);
    assert.equal(improveRes.data.data.versionNumber, 2);
    assert.ok(improveRes.data.data.content.includes('CLARITY'));

    const revsRes = await apiFetch(`/ai/scripts/${scriptId1}/revisions`, { token: tokenA });
    assert.equal(revsRes.status, 200);
    assert.equal(revsRes.data.data.length, 2);

    // User B cannot improve or read User A's script
    const crossRev = await apiFetch(`/ai/scripts/${scriptId1}/revisions`, { token: tokenB });
    assert.equal(crossRev.status, 403);

    // 4. AI Scene Extraction -> persisted & ordered
    const extractRes = await apiFetch('/ai/scenes/extract', {
      method: 'POST',
      token: tokenA,
      body: {
        projectId,
        scriptRevisionId: improveRes.data.data.id,
        replaceExisting: true,
        provider: 'mock',
      },
    });
    assert.equal(extractRes.status, 201);
    assert.ok(extractRes.data.data.length >= 2);
    const scene1Id = extractRes.data.data[0].id as string;
    const scene2Id = extractRes.data.data[1].id as string;
    assert.equal(extractRes.data.data[0].sceneOrder, 0);
    assert.equal(extractRes.data.data[1].sceneOrder, 1);

    // Patch scene
    const patchRes = await apiFetch(`/ai/scenes/${scene1Id}`, {
      method: 'PATCH',
      token: tokenA,
      body: { durationSec: 4, narration: 'Updated sharp hook narration.' },
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.data.data.durationSec, 4);

    // 5. Async Image Generation (HTTP 202 + Idempotency + Object Storage)
    const idemKey = `idem-img-${suffix}`;
    const imgQueue1 = await apiFetch('/ai/images/generate', {
      method: 'POST',
      token: tokenA,
      body: {
        sceneId: scene1Id,
        provider: 'mock',
        prompt: 'Walnut studio desk macro light',
        aspectRatio: '16:9',
        style: 'Commercial studio lighting',
        idempotencyKey: idemKey,
      },
    });
    assert.equal(imgQueue1.status, 202);
    const imgJobId = imgQueue1.data.data.job_id as string;

    // Duplicate idempotencyKey returns exact same job without duplicate billing
    const imgQueueDup = await apiFetch('/ai/images/generate', {
      method: 'POST',
      token: tokenA,
      body: {
        sceneId: scene1Id,
        provider: 'mock',
        prompt: 'Walnut studio desk macro light',
        aspectRatio: '16:9',
        idempotencyKey: idemKey,
      },
    });
    assert.equal(imgQueueDup.status, 202);
    assert.equal(imgQueueDup.data.data.job_id, imgJobId);

    const completedImgJob = await pollJobUntilDone(`/ai/images/jobs/${imgJobId}`, tokenA);
    assert.equal(completedImgJob.status, 'succeeded');
    assert.equal(completedImgJob.progress, 100);
    assert.ok(completedImgJob.asset?.id);
    assert.equal(fs.existsSync(resolveSafeStoragePath(completedImgJob.asset.storageKey)), true);
    const firstImageAssetId = completedImgJob.asset.id as string;

    // 6. Async Video Generation (Image-to-Video using firstImageAssetId)
    const vidQueue = await apiFetch('/ai/videos/generate', {
      method: 'POST',
      token: tokenA,
      body: {
        sceneId: scene2Id,
        provider: 'mock',
        prompt: 'Smooth cinematic push-in across studio',
        aspectRatio: '16:9',
        durationSec: 3,
        referenceAssetId: firstImageAssetId,
      },
    });
    assert.equal(vidQueue.status, 202);
    const vidJobId = vidQueue.data.data.job_id as string;
    const completedVidJob = await pollJobUntilDone(`/ai/videos/jobs/${vidJobId}`, tokenA, 20_000);
    assert.equal(completedVidJob.status, 'succeeded');
    assert.ok(completedVidJob.providerJobId?.startsWith('mock-vid-'));
    assert.equal(completedVidJob.asset.mimeType, 'video/mp4');
    assert.equal(fs.existsSync(resolveSafeStoragePath(completedVidJob.asset.storageKey)), true);

    // 7. Accept / Reject Asset preserves previous candidate
    const imgQueue2 = await apiFetch('/ai/images/generate', {
      method: 'POST',
      token: tokenA,
      body: {
        sceneId: scene1Id,
        provider: 'mock',
        prompt: 'Alternate desk angle',
        aspectRatio: '1:1',
      },
    });
    assert.equal(imgQueue2.status, 202);
    const completedImgJob2 = await pollJobUntilDone(
      `/ai/images/jobs/${imgQueue2.data.data.job_id}`,
      tokenA
    );
    const secondImageAssetId = completedImgJob2.asset.id as string;

    // Reject second image -> scene reverts cleanly to first accepted image
    const rejectRes = await apiFetch(`/ai/assets/${secondImageAssetId}/reject`, {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.data.data.fallbackAssetId, firstImageAssetId);

    // User B cannot accept User A's asset
    const crossAccept = await apiFetch(`/ai/assets/${firstImageAssetId}/accept`, {
      method: 'POST',
      token: tokenB,
      body: { sceneId: scene1Id },
    });
    assert.equal(crossAccept.status, 404);
  } finally {
    await db.delete(users).where(sql`${users.email} IN (${emailA}, ${emailB})`);
  }
});

async function waitForDbJob(
  jobId: string,
  predicate: (job: typeof generationJobs.$inferSelect) => boolean,
  timeoutMs = 10_000
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
    if (row && predicate(row)) return row;
    await new Promise((r) => setTimeout(r, 75));
  }
  const [last] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  return last;
}

async function waitForDbAttempt(
  jobId: string,
  predicate: (attempt: typeof generationAttempts.$inferSelect) => boolean,
  timeoutMs = 10_000
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.jobId, jobId));
    if (row && predicate(row)) return row;
    await new Promise((r) => setTimeout(r, 75));
  }
  const [last] = await db
    .select()
    .from(generationAttempts)
    .where(eq(generationAttempts.jobId, jobId));
  return last;
}

test('Worker reliability: timeout enforcement, failed job preserves asset, free retry reuses action_id, and late response ignored', async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const email = `aitest-worker-${suffix}@example.com`;
  let userId = '';

  try {
    const [user] = await db
      .insert(users)
      .values({
        uid: `worker_${suffix}`,
        email,
        fullName: 'Worker Test',
        displayName: 'Worker Test',
        creditsBalance: 500,
        isVerified: true,
      })
      .returning();
    userId = user.id;

    const [project] = await db
      .insert(projects)
      .values({
        userId: user.id,
        title: 'Reliability Test Project',
        platform: 'YouTube',
        aspectRatio: '16:9',
      })
      .returning();

    const [scene] = await db
      .insert(scenes)
      .values({
        projectId: project.id,
        sceneOrder: 0,
        title: 'Scene 1',
        durationSec: 5,
      })
      .returning();

    const [initialAsset] = await db
      .insert(assets)
      .values({
        projectId: project.id,
        sceneId: scene.id,
        userId: user.id,
        assetType: 'image',
        mimeType: 'image/png',
        storageKey: `projects/${project.id}/initial.png`,
        fileName: 'initial.png',
        fileSizeBytes: 128,
        provider: 'mock',
        model: 'mock-image-v1',
        isAccepted: true,
      })
      .returning();

    await db
      .update(scenes)
      .set({ selectedAssetId: initialAsset.id, generationStatus: 'succeeded' })
      .where(eq(scenes.id, scene.id));

    // A) Timeout enforcement -> timed_out without clearing initialAsset
    setJobWorkerTestSimulator(async (_req, ctx) => {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 600);
        ctx.signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(ctx.signal.reason || new Error('Aborted'));
        });
      });
      return null;
    });

    const timeoutEnq = await enqueueMediaGenerationJob({
      projectId: project.id,
      sceneId: scene.id,
      userId: user.id,
      requestTimeoutMs: 120,
      request: {
        mediaType: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        prompt: 'Slow hanging job',
        aspectRatio: '16:9',
      },
    });

    const timedOutJob = await waitForDbJob(
      timeoutEnq.job.id,
      (j) => !['queued', 'processing', 'retrying'].includes(j.status)
    );
    assert.equal(timedOutJob.status, 'timed_out');

    const [sceneAfterTimeout] = await db.select().from(scenes).where(eq(scenes.id, scene.id));
    assert.equal(sceneAfterTimeout.selectedAssetId, initialAsset.id);

    // B) Failed job preserves previous asset, and retry reuses action_id without duplicate billing
    let attemptSeen = 0;
    setJobWorkerTestSimulator(async (_req, ctx) => {
      attemptSeen = ctx.attemptNumber;
      if (ctx.attemptNumber === 1) {
        throw new Error('Simulated transient 503 failure');
      }
      return {
        buffer: Buffer.from('fake-png-bytes'),
        mimeType: 'image/png',
        fileExtension: 'png',
        width: 1280,
        height: 720,
        modelUsed: 'mock-image-v1',
        providerRequestId: 'retry-ok-1',
      };
    });

    const failEnq = await enqueueMediaGenerationJob({
      projectId: project.id,
      sceneId: scene.id,
      userId: user.id,
      request: {
        mediaType: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        prompt: 'Transient fail then succeed',
        aspectRatio: '16:9',
      },
    });

    const failedJob = await waitForDbJob(
      failEnq.job.id,
      (j) => !['queued', 'processing', 'retrying'].includes(j.status)
    );
    assert.equal(failedJob.status, 'failed');
    assert.equal(attemptSeen, 1);

    // Previous asset still preserved!
    const [sceneAfterFail] = await db.select().from(scenes).where(eq(scenes.id, scene.id));
    assert.equal(sceneAfterFail.selectedAssetId, initialAsset.id);

    // Retry reuses original actionId & creates zero extra billing_transactions
    const retryPrep = await retryGenerationJob(failEnq.job.id, user.id);
    assert.equal(retryPrep.action.id, failEnq.action.id);

    const retriedJob = await waitForDbJob(
      failEnq.job.id,
      (j) => j.attemptCount >= 2 && !['queued', 'processing', 'retrying'].includes(j.status)
    );
    assert.equal(retriedJob.status, 'succeeded');
    assert.equal(attemptSeen, 2);

    const billingRows = await db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.actionId, failEnq.action.id));
    assert.equal(billingRows.length, 1);

    // C) Late response ignored when user accepts another asset while job is in flight
    let resolveDelayed!: () => void;
    const delayedGate = new Promise<void>((r) => {
      resolveDelayed = r;
    });
    setJobWorkerTestSimulator(async () => {
      await delayedGate;
      return {
        buffer: Buffer.from('late-png-bytes'),
        mimeType: 'image/png',
        fileExtension: 'png',
        width: 1280,
        height: 720,
        modelUsed: 'mock-image-v1',
        providerRequestId: 'late-resp',
      };
    });

    const slowEnq = await enqueueMediaGenerationJob({
      projectId: project.id,
      sceneId: scene.id,
      userId: user.id,
      request: {
        mediaType: 'image',
        provider: 'mock',
        model: 'mock-image-v1',
        prompt: 'Slow response superseded by user accept',
        aspectRatio: '16:9',
      },
    });

    await waitForDbJob(slowEnq.job.id, (j) => j.status === 'processing');
    // User accepts initialAsset on the scene while slowEnq is still running
    await acceptAssetForScene(initialAsset.id, user.id, scene.id);
    resolveDelayed();

    const lateAttempt = await waitForDbAttempt(
      slowEnq.job.id,
      (a) => a.finishedAt !== null || a.status === 'stale_ignored'
    );
    assert.equal(lateAttempt.status, 'stale_ignored');

    const [sceneAfterLate] = await db.select().from(scenes).where(eq(scenes.id, scene.id));
    assert.equal(sceneAfterLate.selectedAssetId, initialAsset.id);
  } finally {
    setJobWorkerTestSimulator(null);
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
  }
});
