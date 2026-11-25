import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import { projects, scriptRevisions } from '../../../db/schema.ts';
import type { LLMProviderName } from '../config.ts';
import { getLLMProvider } from '../factory.ts';
import type { AIUsageStats, LLMImproveScriptRequest } from '../interfaces/llmProvider.ts';

export interface ImproveScriptServiceInput {
  projectId: string;
  userUid: string;
  baseRevision?: {
    title: string;
    brandName: string;
    targetAudience: string;
    platform: string;
    targetDurationSec: number;
    language: string;
    toneOfVoice: string;
    marketingObjective: string;
    topic?: string;
    contentType?: string;
    content: string;
  };
  title?: string;
  brandName?: string;
  targetAudience?: string;
  platform?: string;
  targetDurationSec?: number;
  language?: string;
  toneOfVoice?: string;
  marketingObjective?: string;
  currentContent?: string;
  action: LLMImproveScriptRequest['action'];
  targetTone?: string;
  instructions?: string;
  provider?: LLMProviderName;
}

export async function improveAndSaveScriptRevision(input: ImproveScriptServiceInput) {
  const sourceContent = input.currentContent?.trim() || input.baseRevision?.content || '';
  if (!sourceContent) {
    throw new Error('Cannot improve an empty script.');
  }

  const llm = getLLMProvider(input.provider);
  const platform = input.platform || input.baseRevision?.platform || 'YouTube';
  const language = input.language || input.baseRevision?.language || 'English';

  const aiResult = await llm.improveScript({
    currentContent: sourceContent,
    action: input.action,
    targetTone: input.targetTone,
    instructions: input.instructions,
    platform,
    language,
  });

  // Always inserts a brand new immutable row so the original script revision is preserved intact.
  const revision = await db.transaction(async (tx) => {
    const maxRows = await tx
      .select({ maxVer: sql<number>`coalesce(max(${scriptRevisions.versionNumber}), 0)::int` })
      .from(scriptRevisions)
      .where(eq(scriptRevisions.projectId, input.projectId));
    const nextVer = (maxRows[0]?.maxVer ?? 0) + 1;

    const [rev] = await tx
      .insert(scriptRevisions)
      .values({
        projectId: input.projectId,
        versionNumber: nextVer,
        title: input.title || input.baseRevision?.title || 'Improved Script',
        brandName: input.brandName ?? input.baseRevision?.brandName ?? '',
        targetAudience: input.targetAudience ?? input.baseRevision?.targetAudience ?? '',
        platform,
        targetDurationSec: input.targetDurationSec ?? input.baseRevision?.targetDurationSec ?? 30,
        language,
        toneOfVoice: input.targetTone || input.toneOfVoice || input.baseRevision?.toneOfVoice || 'Energetic',
        marketingObjective:
          input.marketingObjective ?? input.baseRevision?.marketingObjective ?? 'Brand Awareness',
        topic: input.baseRevision?.topic || '',
        contentType: input.baseRevision?.contentType || 'YouTube',
        content: aiResult.content,
        aiModelUsed: aiResult.aiModelUsed,
        aiNotes: aiResult.aiNotes,
        usageJson: aiResult.usage,
        createdByUid: input.userUid,
      })
      .returning();

    await tx
      .update(projects)
      .set({ activeScriptRevisionId: rev.id, updatedAt: new Date() })
      .where(eq(projects.id, input.projectId));

    return rev;
  });

  return {
    revision,
    usage: aiResult.usage as AIUsageStats,
    isMock: llm.capabilities.isMock,
    provider: llm.name,
  };
}
