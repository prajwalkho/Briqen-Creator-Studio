import 'dotenv/config';
import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createPool, db } from '../../db/index.ts';
import {
  adminPermissions,
  assets,
  billingTransactions,
  exportJobs,
  exportsTable,
  generationActions,
  generationAttempts,
  generationJobs,
  notificationPreferences,
  projects,
  scenes,
  scriptRevisions,
  userActivities,
  userPreferences,
  users,
} from '../../db/schema.ts';
import {
  DEFAULT_ADMIN_PERMISSIONS,
  ensurePermissionCatalogSeeded,
  type PermissionName,
  setAdminPermissions,
} from '../auth/permissions.ts';
import { hashPassword } from '../auth/security.ts';
import { deleteObject, saveObject } from '../storage.ts';
import { assertDemoSeedingAllowed } from './demoConfig.ts';

const execFileAsync = promisify(execFile);

export interface DemoAccountSpec {
  email: string;
  fullName: string;
  username: string;
  role: 'super_admin' | 'admin' | 'user';
  bio: string;
  country: string;
  state: string;
  city: string;
  phoneNumber: string;
  website: string;
}

const DEMO_REGULAR_PROFILES: Array<{
  fullName: string;
  city: string;
  state: string;
  country: string;
  niche: string;
}> = [
  { fullName: 'Maya Lin', city: 'San Francisco', state: 'California', country: 'United States', niche: 'SaaS Product Launches' },
  { fullName: 'Liam O’Connor', city: 'Austin', state: 'Texas', country: 'United States', niche: 'Developer Tools Marketing' },
  { fullName: 'Aria Patel', city: 'Seattle', state: 'Washington', country: 'United States', niche: 'E-Commerce Brand Films' },
  { fullName: 'Noah Alvarez', city: 'Chicago', state: 'Illinois', country: 'United States', niche: 'B2B Explainer Videos' },
  { fullName: 'Chloe Martin', city: 'Toronto', state: 'Ontario', country: 'Canada', niche: 'Social Ad Creatives' },
  { fullName: 'Ethan Brooks', city: 'New York', state: 'New York', country: 'United States', niche: 'Fintech Campaigns' },
  { fullName: 'Zoe Takahashi', city: 'Los Angeles', state: 'California', country: 'United States', niche: 'Creator Economy Growth' },
  { fullName: 'Lucas Weber', city: 'Berlin', state: 'Berlin', country: 'Germany', niche: 'Hardware Launch Trailers' },
  { fullName: 'Sofia Rossi', city: 'Milan', state: 'Lombardy', country: 'Italy', niche: 'Lifestyle Brand Teasers' },
  { fullName: 'Oliver Grant', city: 'London', state: 'England', country: 'United Kingdom', niche: 'YouTube Product Reviews' },
  { fullName: 'Amara Okafor', city: 'Atlanta', state: 'Georgia', country: 'United States', niche: 'Educational Micro-Courses' },
  { fullName: 'Daniel Kim', city: 'San Jose', state: 'California', country: 'United States', niche: 'AI Workflow Demos' },
  { fullName: 'Hannah Novak', city: 'Denver', state: 'Colorado', country: 'United States', niche: 'Outdoor Gear Spots' },
  { fullName: 'Mateo Silva', city: 'Miami', state: 'Florida', country: 'United States', niche: 'Short-Form Reels & TikTok' },
  { fullName: 'Nadia Haddad', city: 'Boston', state: 'Massachusetts', country: 'United States', niche: 'Healthcare Explainers' },
  { fullName: 'Julian Becker', city: 'Munich', state: 'Bavaria', country: 'Germany', niche: 'Automotive Digital Ads' },
  { fullName: 'Priya Nair', city: 'Bengaluru', state: 'Karnataka', country: 'India', niche: 'Cloud Platform Storytelling' },
  { fullName: 'Sebastian Moore', city: 'Dublin', state: 'Leinster', country: 'Ireland', niche: 'Enterprise Case Studies' },
  { fullName: 'Elena Costa', city: 'Lisbon', state: 'Lisbon', country: 'Portugal', niche: 'Travel & Hospitality Spots' },
  { fullName: 'Caleb Wright', city: 'Portland', state: 'Oregon', country: 'United States', niche: 'Direct-to-Consumer Video' },
];

export function buildDemoAccountSpecs(): DemoAccountSpec[] {
  const specs: DemoAccountSpec[] = [];

  for (let i = 1; i <= 2; i++) {
    specs.push({
      email: `superadmin${i}@briqen.demo`,
      fullName: `Super Admin ${i}`,
      username: `demo_superadmin${i}`,
      role: 'super_admin',
      bio: `Demo Super Administrator #${i} for Briqen Creator Studio RBAC and governance verification.`,
      country: 'United States',
      state: 'California',
      city: 'San Francisco',
      phoneNumber: `+1 415 555 010${i}`,
      website: 'https://demo.briqen.local/superadmin',
    });
  }

  for (let i = 1; i <= 5; i++) {
    specs.push({
      email: `admin${i}@briqen.demo`,
      fullName: `Admin ${i}`,
      username: `demo_admin${i}`,
      role: 'admin',
      bio: `Demo Operations Admin #${i} managing demo creator accounts, moderation, and media inspections.`,
      country: 'United States',
      state: 'New York',
      city: 'New York',
      phoneNumber: `+1 212 555 011${i}`,
      website: 'https://demo.briqen.local/admin',
    });
  }

  for (let i = 1; i <= 20; i++) {
    const profile = DEMO_REGULAR_PROFILES[i - 1];
    specs.push({
      email: `user${i}@briqen.demo`,
      fullName: `${profile.fullName} (Demo)`,
      username: `demo_user${i}`,
      role: 'user',
      bio: `Demo creator account focusing on ${profile.niche}. Seeded for Briqen Creator Studio testing.`,
      country: profile.country,
      state: profile.state,
      city: profile.city,
      phoneNumber: `+1 650 555 ${String(1200 + i).padStart(4, '0')}`,
      website: `https://demo.briqen.local/creators/user${i}`,
    });
  }

  return specs;
}

const DEMO_ADMIN_PERMISSION_PROFILES: Record<string, PermissionName[]> = {
  'admin1@briqen.demo': [
    'users.view',
    'users.create',
    'users.edit',
    'users.ban',
    'users.unban',
    'projects.view',
    'analytics.operational.view',
    'reports.export',
  ],
  'admin2@briqen.demo': [
    'users.view',
    'projects.view',
    'projects.manage',
    'scripts.view',
    'scripts.manage',
    'scenes.view',
    'scenes.manage',
    'assets.view',
    'analytics.operational.view',
  ],
  'admin3@briqen.demo': [
    'users.view',
    'projects.view',
    'generations.view',
    'generations.retry',
    'assets.view',
    'support.view',
    'support.manage',
    'analytics.operational.view',
  ],
  'admin4@briqen.demo': [
    'users.view',
    'users.ban',
    'users.unban',
    'analytics.operational.view',
    'financial.view',
    'reports.export',
  ],
  'admin5@briqen.demo': [...DEFAULT_ADMIN_PERMISSIONS],
};

const DEMO_IMAGE_KEY = 'demo/mock_scene_frame.png';
const DEMO_VIDEO_KEY = 'demo/mock_scene_clip.mp4';
const DEMO_EXPORT_KEY = 'demo/mock_export_preview.mp4';

async function ensureDemoSampleStorageObjects(): Promise<{
  imageSize: number;
  videoSize: number;
  exportSize: number;
}> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-demo-assets-'));
  try {
    const imgPath = path.join(tmpDir, 'demo-frame.png');
    const vidPath = path.join(tmpDir, 'demo-clip.mp4');
    const expPath = path.join(tmpDir, 'demo-export.mp4');

    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x111827:s=640x360:d=0.1',
      '-frames:v',
      '1',
      imgPath,
    ]);

    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x1E293B:s=640x360:d=1',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo:d=1',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-t',
      '1',
      vidPath,
    ]);

    await fs.promises.copyFile(vidPath, expPath);

    const imgBuf = await fs.promises.readFile(imgPath);
    const vidBuf = await fs.promises.readFile(vidPath);
    const expBuf = await fs.promises.readFile(expPath);

    const [imgSaved, vidSaved, expSaved] = await Promise.all([
      saveObject(DEMO_IMAGE_KEY, imgBuf),
      saveObject(DEMO_VIDEO_KEY, vidBuf),
      saveObject(DEMO_EXPORT_KEY, expBuf),
    ]);

    return {
      imageSize: imgSaved.sizeBytes,
      videoSize: vidSaved.sizeBytes,
      exportSize: expSaved.sizeBytes,
    };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

export interface DemoSeedSummary {
  superAdminsCreated: number;
  superAdminsExisting: number;
  adminsCreated: number;
  adminsExisting: number;
  usersCreated: number;
  usersExisting: number;
  totalAccounts: number;
  demoProjectsSeeded: number;
  demoScriptsSeeded: number;
  demoScenesSeeded: number;
  demoJobsSeeded: number;
  demoAssetsSeeded: number;
  demoExportsSeeded: number;
  demoActivitiesSeeded: number;
}

export async function seedDemoAccounts(options: {
  forcePasswordSync?: boolean;
  quiet?: boolean;
} = {}): Promise<DemoSeedSummary> {
  const cfg = assertDemoSeedingAllowed();
  const specs = buildDemoAccountSpecs();
  const passwordHash = await hashPassword(cfg.demoPassword);
  const storageSizes = await ensureDemoSampleStorageObjects();
  await ensurePermissionCatalogSeeded();

  const summary: DemoSeedSummary = {
    superAdminsCreated: 0,
    superAdminsExisting: 0,
    adminsCreated: 0,
    adminsExisting: 0,
    usersCreated: 0,
    usersExisting: 0,
    totalAccounts: specs.length,
    demoProjectsSeeded: 0,
    demoScriptsSeeded: 0,
    demoScenesSeeded: 0,
    demoJobsSeeded: 0,
    demoAssetsSeeded: 0,
    demoExportsSeeded: 0,
    demoActivitiesSeeded: 0,
  };

  const seededDemoAdmins: Array<{ id: string; email: string }> = [];

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('briqen-demo-seed-v1'))`);

    const seededRegularUsers: Array<{ id: string; uid: string; email: string; fullName: string; index: number }> = [];

    for (let idx = 0; idx < specs.length; idx++) {
      const spec = specs[idx];
      const existingRows = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${spec.email}`)
        .limit(1);

      let userId: string;
      let userUid: string;

      if (existingRows.length === 0) {
        const now = new Date();
        const createdAtOffset = new Date(now.getTime() - (28 - idx) * 6 * 3600 * 1000);
        const [inserted] = await tx
          .insert(users)
          .values({
            uid: `demo:${crypto.randomUUID()}`,
            email: spec.email,
            fullName: spec.fullName,
            displayName: spec.fullName,
            username: spec.username,
            passwordHash,
            passwordChangedAt: createdAtOffset,
            role: spec.role,
            accountStatus: 'active',
            isActive: true,
            isVerified: true,
            isDemoAccount: true,
            bio: spec.bio,
            country: spec.country,
            state: spec.state,
            city: spec.city,
            phoneNumber: spec.phoneNumber,
            website: spec.website,
            creditsBalance: spec.role === 'user' ? 1000 : 2500,
            lastLoginAt: new Date(now.getTime() - (idx % 7) * 3600 * 1000),
            createdAt: createdAtOffset,
            updatedAt: now,
          })
          .returning();

        userId = inserted.id;
        userUid = inserted.uid;

        await tx
          .insert(userPreferences)
          .values({ userId, theme: 'dark', defaultAspectRatio: '16:9', defaultExportQuality: 'standard' })
          .onConflictDoNothing({ target: userPreferences.userId });

        await tx
          .insert(notificationPreferences)
          .values({ userId })
          .onConflictDoNothing({ target: notificationPreferences.userId });

        await tx.insert(userActivities).values({
          userId,
          activityType: 'registration',
          description: `Demo account provisioned (${spec.role.replace('_', ' ')}).`,
          metadata: { isDemo: true, seededRole: spec.role },
          createdAt: createdAtOffset,
        });
        summary.demoActivitiesSeeded += 1;

        if (spec.role === 'super_admin') summary.superAdminsCreated += 1;
        else if (spec.role === 'admin') summary.adminsCreated += 1;
        else summary.usersCreated += 1;
      } else {
        const existing = existingRows[0];
        userId = existing.id;
        userUid = existing.uid;

        // Safe update: preserve existing user password unless explicitly requested or empty,
        // and only update demo profile metadata for demo accounts.
        const updateSet: Partial<typeof users.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (existing.isDemoAccount || existing.email.endsWith('@briqen.demo')) {
          updateSet.isDemoAccount = true;
          updateSet.role = spec.role;
          updateSet.fullName = spec.fullName;
          updateSet.displayName = spec.fullName;
          updateSet.isVerified = true;
          if (!existing.passwordHash || options.forcePasswordSync) {
            updateSet.passwordHash = passwordHash;
            updateSet.passwordChangedAt = new Date();
          }
          await tx.update(users).set(updateSet).where(eq(users.id, existing.id));
        }

        if (spec.role === 'super_admin') summary.superAdminsExisting += 1;
        else if (spec.role === 'admin') summary.adminsExisting += 1;
        else summary.usersExisting += 1;
      }

      if (spec.role === 'admin') {
        seededDemoAdmins.push({ id: userId, email: spec.email });
      } else if (spec.role === 'user') {
        const userNumber = Number(spec.email.match(/user(\d+)@/)?.[1] || '1');
        seededRegularUsers.push({
          id: userId,
          uid: userUid,
          email: spec.email,
          fullName: spec.fullName,
          index: userNumber,
        });
      }
    }

    // Seed sample projects, scripts, scenes, generation jobs, assets, exports, and activities
    // for each of the 20 regular demo users if they do not already have projects.
    const platforms = ['YouTube', 'TikTok', 'Instagram', 'LinkedIn', 'Web'] as const;
    const aspectRatios = ['16:9', '9:16', '1:1', '16:9'] as const;
    const projectStatuses = ['completed', 'processing', 'draft', 'failed'] as const;
    const jobStatuses = ['succeeded', 'processing', 'queued', 'failed'] as const;

    for (const demoUser of seededRegularUsers) {
      const existingProjects = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.userId, demoUser.id))
        .limit(1);

      if (existingProjects.length > 0) {
        continue;
      }

      const now = Date.now();
      const projectCountForUser = demoUser.index <= 10 ? 2 : 1;

      for (let pIdx = 0; pIdx < projectCountForUser; pIdx++) {
        const seedIdx = demoUser.index * 10 + pIdx;
        const platform = platforms[seedIdx % platforms.length];
        const aspectRatio = aspectRatios[seedIdx % aspectRatios.length];
        const projStatus = projectStatuses[(demoUser.index + pIdx) % projectStatuses.length];
        const projCreatedAt = new Date(now - ((demoUser.index + pIdx * 3) % 14 + 1) * 24 * 3600 * 1000);
        const brandLabel = `Demo Brand ${demoUser.index}`;
        const projTitle =
          pIdx === 0
            ? `${DEMO_REGULAR_PROFILES[demoUser.index - 1].niche} — Campaign ${demoUser.index}`
            : `Q4 Promo Teaser #${demoUser.index}`;

        const [proj] = await tx
          .insert(projects)
          .values({
            userId: demoUser.id,
            title: projTitle,
            description: `Demo sample project for ${demoUser.email}. Uses clearly labeled mock/demo assets for Admin Dashboard QA.`,
            brandName: brandLabel,
            targetAudience: 'Digital creators and marketing teams',
            platform,
            aspectRatio,
            status: projStatus,
            createdAt: projCreatedAt,
            updatedAt: new Date(projCreatedAt.getTime() + 3600 * 1000),
          })
          .returning();
        summary.demoProjectsSeeded += 1;

        // 2 Script Revisions per first project, 1 on second
        const revCount = pIdx === 0 ? 2 : 1;
        let activeRevId: string | null = null;
        for (let v = 1; v <= revCount; v++) {
          const [rev] = await tx
            .insert(scriptRevisions)
            .values({
              projectId: proj.id,
              versionNumber: v,
              title: `${projTitle} (v${v})`,
              brandName: brandLabel,
              targetAudience: 'Marketing decision-makers',
              platform,
              targetDurationSec: 30,
              language: 'English',
              toneOfVoice: v === 1 ? 'Confident' : 'Energetic',
              marketingObjective: 'Conversions',
              topic: DEMO_REGULAR_PROFILES[demoUser.index - 1].niche,
              contentType: platform === 'YouTube' ? 'YouTube' : 'advertisement',
              content: `[00:00 - 00:08] HOOK\nDiscover how ${brandLabel} accelerates campaign output (Mock Demo Script v${v}).\n\n[00:08 - 00:22] BODY\nStructured multi-scene workflow with clear pacing and studio captions.\n\n[00:22 - 00:30] CTA\nLaunch your next production in Briqen Creator Studio.`,
              aiModelUsed: v === 1 ? 'mock-script-provider' : 'mock-script-improver',
              aiNotes: `Mock/Demo script revision v${v} (not live AI output)`,
              usageJson: {
                promptTokens: 180 + v * 25,
                completionTokens: 240 + v * 30,
                totalTokens: 420 + v * 55,
                estimatedCostUsd: 0,
                provider: 'mock',
                isMock: true,
              },
              createdByUid: demoUser.uid,
              createdAt: new Date(projCreatedAt.getTime() + v * 1200 * 1000),
            })
            .returning();
          activeRevId = rev.id;
          summary.demoScriptsSeeded += 1;
        }

        if (activeRevId) {
          await tx
            .update(projects)
            .set({ activeScriptRevisionId: activeRevId })
            .where(eq(projects.id, proj.id));
        }

        // 2 Scenes per project: Scene 1 -> mock image, Scene 2 -> mock video
        const [scene1] = await tx
          .insert(scenes)
          .values({
            projectId: proj.id,
            scriptRevisionId: activeRevId,
            sceneOrder: 0,
            title: 'Opening Hook Frame',
            narration: `Meet ${brandLabel}, engineered for rapid creative workflows.`,
            visualDescription: 'Clean dark studio product frame with subtle key lighting.',
            imagePrompt: `Demo mock prompt: ${brandLabel} studio hero product shot`,
            videoPrompt: `Demo mock prompt: slow dolly push on ${brandLabel}`,
            durationSec: 5,
            transition: 'fade',
            mediaPreference: 'image',
            generationStatus: 'succeeded',
            createdAt: projCreatedAt,
          })
          .returning();

        const scene2JobStatus = jobStatuses[(demoUser.index + pIdx) % jobStatuses.length];
        const [scene2] = await tx
          .insert(scenes)
          .values({
            projectId: proj.id,
            scriptRevisionId: activeRevId,
            sceneOrder: 1,
            title: 'Product Motion Sequence',
            narration: 'Move from script draft to storyboard scenes in minutes.',
            visualDescription: 'Motion sequence highlighting timeline assembly.',
            imagePrompt: `Demo mock prompt: timeline editing studio view`,
            videoPrompt: `Demo mock prompt: dynamic camera sweep across ${brandLabel}`,
            durationSec: 6,
            transition: 'dissolve',
            mediaPreference: 'video',
            generationStatus: scene2JobStatus,
            createdAt: projCreatedAt,
          })
          .returning();
        summary.demoScenesSeeded += 2;

        // Image generation action + job + attempt + mock asset for Scene 1
        const imgActionKey = `demo-img-${proj.id}`;
        const [imgAction] = await tx
          .insert(generationActions)
          .values({
            projectId: proj.id,
            sceneId: scene1.id,
            userId: demoUser.id,
            idempotencyKey: imgActionKey,
            actionType: 'image_generation',
            mediaType: 'image',
            provider: 'mock',
            model: 'demo-mock-asset',
            prompt: scene1.imagePrompt,
            status: 'completed',
            configJson: { aspectRatio, isDemo: true },
            createdAt: new Date(projCreatedAt.getTime() + 1800 * 1000),
          })
          .returning();

        await tx.insert(billingTransactions).values({
          actionId: imgAction.id,
          userId: demoUser.id,
          provider: 'mock',
          model: 'demo-mock-asset',
          mediaType: 'image',
          usageUnits: 1,
          estimatedCredits: 1,
          actualCredits: 1,
          status: 'settled',
          createdAt: imgAction.createdAt,
        });

        const [imgAsset] = await tx
          .insert(assets)
          .values({
            projectId: proj.id,
            sceneId: scene1.id,
            userId: demoUser.id,
            assetType: 'image',
            mimeType: 'image/png',
            storageKey: DEMO_IMAGE_KEY,
            fileName: `demo_mock_image_${demoUser.index}_${pIdx + 1}.png`,
            fileSizeBytes: storageSizes.imageSize,
            width: 640,
            height: 360,
            provider: 'mock',
            model: 'demo-mock-asset',
            promptUsed: scene1.imagePrompt,
            metadataJson: {
              isDemo: true,
              mockLabel: 'Mock/Demo Image Asset',
              note: 'Synthetic demo placeholder generated for admin & UI testing',
            },
            generationActionId: imgAction.id,
            isAccepted: true,
            createdAt: new Date(projCreatedAt.getTime() + 1850 * 1000),
          })
          .returning();
        summary.demoAssetsSeeded += 1;

        const [imgJob] = await tx
          .insert(generationJobs)
          .values({
            actionId: imgAction.id,
            projectId: proj.id,
            sceneId: scene1.id,
            userId: demoUser.id,
            provider: 'mock',
            providerJobId: `demo-job-img-${demoUser.index}-${pIdx}`,
            status: 'succeeded',
            progress: 100,
            resultAssetId: imgAsset.id,
            attemptCount: 1,
            startedAt: imgAction.createdAt,
            createdAt: imgAction.createdAt,
            completedAt: imgAsset.createdAt,
          })
          .returning();

        const [imgAttempt] = await tx
          .insert(generationAttempts)
          .values({
            jobId: imgJob.id,
            actionId: imgAction.id,
            attemptNumber: 1,
            status: 'succeeded',
            providerRequestId: `demo-req-img-${demoUser.index}-${pIdx}`,
            usageJson: { isMock: true, estimatedCostUsd: 0 },
            durationMs: 320,
            startedAt: imgAction.createdAt,
            finishedAt: imgAsset.createdAt,
          })
          .returning();

        await tx
          .update(generationJobs)
          .set({ acceptedAttemptId: imgAttempt.id })
          .where(eq(generationJobs.id, imgJob.id));

        await tx
          .update(scenes)
          .set({ selectedAssetId: imgAsset.id })
          .where(eq(scenes.id, scene1.id));
        summary.demoJobsSeeded += 1;

        // Video generation action + job + attempt (varied status: succeeded / processing / queued / failed)
        const vidActionKey = `demo-vid-${proj.id}`;
        const [vidAction] = await tx
          .insert(generationActions)
          .values({
            projectId: proj.id,
            sceneId: scene2.id,
            userId: demoUser.id,
            idempotencyKey: vidActionKey,
            actionType: 'video_generation',
            mediaType: 'video',
            provider: 'mock',
            model: 'demo-mock-asset',
            prompt: scene2.videoPrompt,
            status:
              scene2JobStatus === 'succeeded'
                ? 'completed'
                : scene2JobStatus === 'failed'
                  ? 'failed'
                  : scene2JobStatus,
            configJson: { aspectRatio, durationSec: 6, isDemo: true },
            createdAt: new Date(projCreatedAt.getTime() + 2400 * 1000),
          })
          .returning();

        await tx.insert(billingTransactions).values({
          actionId: vidAction.id,
          userId: demoUser.id,
          provider: 'mock',
          model: 'demo-mock-asset',
          mediaType: 'video',
          usageUnits: 1,
          estimatedCredits: 1,
          actualCredits: scene2JobStatus === 'succeeded' ? 1 : null,
          status: scene2JobStatus === 'succeeded' ? 'settled' : scene2JobStatus === 'failed' ? 'refunded' : 'reserved',
          createdAt: vidAction.createdAt,
        });

        let vidAssetId: string | null = null;
        if (scene2JobStatus === 'succeeded' || pIdx === 0) {
          const [vidAsset] = await tx
            .insert(assets)
            .values({
              projectId: proj.id,
              sceneId: scene2.id,
              userId: demoUser.id,
              assetType: 'video',
              mimeType: 'video/mp4',
              storageKey: DEMO_VIDEO_KEY,
              fileName: `demo_mock_video_${demoUser.index}_${pIdx + 1}.mp4`,
              fileSizeBytes: storageSizes.videoSize,
              width: 640,
              height: 360,
              durationSec: 1,
              provider: 'mock',
              model: 'demo-mock-asset',
              promptUsed: scene2.videoPrompt,
              metadataJson: {
                isDemo: true,
                mockLabel: 'Mock/Demo Video Asset',
                note: 'Synthetic demo clip generated via FFmpeg for QA',
              },
              generationActionId: vidAction.id,
              isAccepted: scene2JobStatus === 'succeeded',
              createdAt: new Date(projCreatedAt.getTime() + 2500 * 1000),
            })
            .returning();
          vidAssetId = vidAsset.id;
          summary.demoAssetsSeeded += 1;

          if (scene2JobStatus === 'succeeded') {
            await tx
              .update(scenes)
              .set({ selectedAssetId: vidAsset.id })
              .where(eq(scenes.id, scene2.id));
          }
        }

        const [vidJob] = await tx
          .insert(generationJobs)
          .values({
            actionId: vidAction.id,
            projectId: proj.id,
            sceneId: scene2.id,
            userId: demoUser.id,
            provider: 'mock',
            providerJobId: `demo-job-vid-${demoUser.index}-${pIdx}`,
            status: scene2JobStatus,
            progress:
              scene2JobStatus === 'succeeded'
                ? 100
                : scene2JobStatus === 'processing'
                  ? 55
                  : scene2JobStatus === 'queued'
                    ? 10
                    : 0,
            resultAssetId: scene2JobStatus === 'succeeded' ? vidAssetId : null,
            errorMessage:
              scene2JobStatus === 'failed'
                ? 'Mock demo failure: simulated upstream video render timeout.'
                : null,
            attemptCount: scene2JobStatus === 'failed' ? 2 : 1,
            startedAt: scene2JobStatus === 'queued' ? null : vidAction.createdAt,
            createdAt: vidAction.createdAt,
            completedAt:
              scene2JobStatus === 'succeeded' ? new Date(projCreatedAt.getTime() + 2600 * 1000) : null,
          })
          .returning();

        await tx.insert(generationAttempts).values({
          jobId: vidJob.id,
          actionId: vidAction.id,
          attemptNumber: 1,
          status: scene2JobStatus === 'succeeded' ? 'succeeded' : scene2JobStatus === 'failed' ? 'failed' : scene2JobStatus,
          providerRequestId: `demo-req-vid-${demoUser.index}-${pIdx}-1`,
          errorMessage:
            scene2JobStatus === 'failed'
              ? 'Simulated transient failure (attempt 1)'
              : null,
          usageJson: { isMock: true, estimatedCostUsd: 0 },
          durationMs: scene2JobStatus === 'queued' ? null : 840,
          startedAt: scene2JobStatus === 'queued' ? null : vidAction.createdAt,
          finishedAt:
            scene2JobStatus === 'succeeded' || scene2JobStatus === 'failed'
              ? new Date(projCreatedAt.getTime() + 2550 * 1000)
              : null,
        });

        if (scene2JobStatus === 'failed') {
          await tx.insert(generationAttempts).values({
            jobId: vidJob.id,
            actionId: vidAction.id,
            attemptNumber: 2,
            status: 'failed',
            providerRequestId: `demo-req-vid-${demoUser.index}-${pIdx}-2`,
            errorMessage: 'Mock demo failure: simulated upstream video render timeout.',
            usageJson: { isMock: true, estimatedCostUsd: 0 },
            durationMs: 1200,
            startedAt: new Date(projCreatedAt.getTime() + 2580 * 1000),
            finishedAt: new Date(projCreatedAt.getTime() + 2650 * 1000),
          });
        }
        summary.demoJobsSeeded += 1;

        // Export record on project #1 of each demo user
        if (pIdx === 0) {
          const exportStatus =
            demoUser.index % 5 === 0 ? 'failed' : demoUser.index % 4 === 0 ? 'queued' : 'succeeded';
          const [expRec] = await tx
            .insert(exportsTable)
            .values({
              projectId: proj.id,
              userId: demoUser.id,
              title: `${projTitle} — Demo MP4`,
              format: 'mp4',
              resolution: aspectRatio === '9:16' ? '360x640' : '640x360',
              totalDurationSec: 11,
              snapshotJson: {
                aspectRatio,
                scenes: [
                  {
                    sceneId: scene1.id,
                    title: scene1.title,
                    order: 0,
                    durationSec: 5,
                    transition: 'fade',
                    assetId: imgAsset.id,
                  },
                ],
              },
              storageKey: exportStatus === 'succeeded' ? DEMO_EXPORT_KEY : null,
              fileSizeBytes: exportStatus === 'succeeded' ? storageSizes.exportSize : null,
              status: exportStatus,
              createdAt: new Date(projCreatedAt.getTime() + 3000 * 1000),
            })
            .returning();

          await tx.insert(exportJobs).values({
            exportId: expRec.id,
            projectId: proj.id,
            status: exportStatus,
            progressPct: exportStatus === 'succeeded' ? 100 : exportStatus === 'queued' ? 5 : 40,
            currentStep:
              exportStatus === 'succeeded'
                ? 'Mock demo export completed'
                : exportStatus === 'queued'
                  ? 'Queued for demo draft render'
                  : 'Mock export simulation failed',
            errorMessage:
              exportStatus === 'failed' ? 'Mock export test failure for Admin QA' : null,
            createdAt: expRec.createdAt,
            completedAt: exportStatus === 'succeeded' ? expRec.createdAt : null,
          });
          summary.demoExportsSeeded += 1;
        }

        // Distinct per-user chronological activities
        const activityRows: Array<typeof userActivities.$inferInsert> = [
          {
            userId: demoUser.id,
            activityType: 'project_created',
            description: `Created demo project "${projTitle}".`,
            relatedProjectId: proj.id,
            metadata: { platform, aspectRatio, isDemo: true },
            createdAt: projCreatedAt,
          },
          {
            userId: demoUser.id,
            activityType: 'script_generated',
            description: `Generated mock demo script revisions for "${projTitle}".`,
            relatedProjectId: proj.id,
            metadata: { revisionCount: revCount, isMock: true },
            createdAt: new Date(projCreatedAt.getTime() + 1200 * 1000),
          },
          {
            userId: demoUser.id,
            activityType: 'image_generated',
            description: `Generated mock demo image for "${scene1.title}".`,
            relatedProjectId: proj.id,
            relatedAssetId: imgAsset.id,
            metadata: { provider: 'mock', isDemo: true },
            createdAt: imgAsset.createdAt,
          },
        ];

        if (scene2JobStatus === 'failed') {
          activityRows.push({
            userId: demoUser.id,
            activityType: 'generation_failed',
            description: `Mock video generation failed for "${scene2.title}" after retry.`,
            relatedProjectId: proj.id,
            metadata: { jobStatus: 'failed', isDemo: true },
            createdAt: new Date(projCreatedAt.getTime() + 2650 * 1000),
          });
        } else if (pIdx === 0) {
          activityRows.push({
            userId: demoUser.id,
            activityType: 'video_exported',
            description: `Queued/rendered demo video export for "${projTitle}".`,
            relatedProjectId: proj.id,
            metadata: { isDemo: true },
            createdAt: new Date(projCreatedAt.getTime() + 3100 * 1000),
          });
        }

        if (demoUser.index % 2 === 0 && pIdx === 0) {
          activityRows.push({
            userId: demoUser.id,
            activityType: 'login',
            description: `Demo user ${demoUser.email} signed into Briqen Creator Studio.`,
            metadata: { isDemo: true },
            createdAt: new Date(now - (demoUser.index % 5) * 3600 * 1000),
          });
        }

        await tx.insert(userActivities).values(activityRows);
        summary.demoActivitiesSeeded += activityRows.length;
      }
    }
  });

  // Assign differentiated granular permissions to demo Admins if they have none assigned yet
  for (const demoAdmin of seededDemoAdmins) {
    const existingPerms = await db
      .select({ id: adminPermissions.id })
      .from(adminPermissions)
      .where(eq(adminPermissions.adminUserId, demoAdmin.id))
      .limit(1);
    if (existingPerms.length === 0) {
      const profile = DEMO_ADMIN_PERMISSION_PROFILES[demoAdmin.email] ?? DEFAULT_ADMIN_PERMISSIONS;
      await setAdminPermissions(demoAdmin.id, profile, null);
    }
  }

  if (!options.quiet) {
    printDemoSeedSummary(summary);
  }

  return summary;
}

export function printDemoSeedSummary(summary: DemoSeedSummary): void {
  const createdTotal =
    summary.superAdminsCreated + summary.adminsCreated + summary.usersCreated;
  const totalInDb =
    summary.superAdminsCreated +
    summary.superAdminsExisting +
    summary.adminsCreated +
    summary.adminsExisting +
    summary.usersCreated +
    summary.usersExisting;

  console.log('');
  console.log('BRIQEN CREATOR STUDIO - DEMO SEED');
  console.log('');
  console.log(
    `Super Admins: ${summary.superAdminsCreated} created (${summary.superAdminsCreated + summary.superAdminsExisting} total)`
  );
  console.log(
    `Admins:       ${summary.adminsCreated} created (${summary.adminsCreated + summary.adminsExisting} total)`
  );
  console.log(
    `Users:        ${summary.usersCreated} created (${summary.usersCreated + summary.usersExisting} total)`
  );
  console.log('');
  console.log(`Total:       ${totalInDb} demo accounts (${createdTotal} newly created)`);
  console.log(
    `Sample Data:  ${summary.demoProjectsSeeded} projects, ${summary.demoScriptsSeeded} scripts, ${summary.demoScenesSeeded} scenes, ${summary.demoJobsSeeded} jobs, ${summary.demoAssetsSeeded} mock assets, ${summary.demoExportsSeeded} exports, ${summary.demoActivitiesSeeded} activity logs`
  );
  console.log('');
  console.log('Database seeding completed successfully.');
}

export async function resetDemoData(): Promise<{ deletedDemoUsers: number }> {
  assertDemoSeedingAllowed();

  const deletedUsers = await db.transaction(async (tx) => {
    const demoRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        sql`${users.isDemoAccount} = true OR lower(${users.email}) LIKE '%@briqen.demo'`
      );

    if (demoRows.length === 0) {
      return [];
    }

    const demoIds = demoRows.map((r) => r.id);
    // Only delete demo user rows (cascades to demo projects, scripts, scenes, jobs, assets, exports, activities).
    // Real customer accounts (is_demo_account = false and non-@briqen.demo) remain untouched.
    return tx
      .delete(users)
      .where(and(inArray(users.id, demoIds)))
      .returning({ id: users.id });
  });

  await Promise.all([
    deleteObject(DEMO_IMAGE_KEY),
    deleteObject(DEMO_VIDEO_KEY),
    deleteObject(DEMO_EXPORT_KEY),
  ]);

  return { deletedDemoUsers: deletedUsers.length };
}

async function runCli() {
  const args = new Set(process.argv.slice(2));
  const shouldReset = args.has('--reset');
  const forcePasswordSync = args.has('--sync-passwords');

  try {
    if (shouldReset) {
      const resetRes = await resetDemoData();
      console.log(`Removed ${resetRes.deletedDemoUsers} demo account(s) and associated demo data.`);
      if (!args.has('--seed-after-reset')) {
        return;
      }
    }
    await seedDemoAccounts({ forcePasswordSync, quiet: false });
  } finally {
    await createPool().end();
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli().catch((err) => {
    console.error('Demo seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
