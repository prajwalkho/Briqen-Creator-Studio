import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import { projects, scriptRevisions } from '../../../db/schema.ts';
import type { LLMProviderName } from '../config.ts';
import { getLLMProvider } from '../factory.ts';
import type { AIUsageStats } from '../interfaces/llmProvider.ts';

export interface GenerateScriptServiceInput {
  projectId: string;
  userUid: string;
  topic?: string;
  title: string;
  description?: string;
  brandName?: string;
  targetAudience?: string;
  platform?: string;
  contentType?: 'YouTube' | 'advertisement' | 'educational' | 'promotional' | 'social_media';
  targetDurationSec?: number;
  language?: string;
  toneOfVoice?: string;
  marketingObjective?: string;
  brief?: string;
  useSearchGrounding?: boolean;
  provider?: LLMProviderName;
}

export async function generateAndSaveScriptRevision(input: GenerateScriptServiceInput) {
  const llm = getLLMProvider(input.provider);

  const aiResult = await llm.generateScript({
    topic: input.topic,
    title: input.title,
    description: input.description,
    brandName: input.brandName || '',
    targetAudience: input.targetAudience || '',
    platform: input.platform || 'YouTube',
    contentType: input.contentType || 'YouTube',
    targetDurationSec: input.targetDurationSec || 30,
    language: input.language || 'English',
    toneOfVoice: input.toneOfVoice || 'Energetic',
    marketingObjective: input.marketingObjective || 'Brand Awareness',
    brief: input.brief,
    useSearchGrounding: Boolean(input.useSearchGrounding),
  });

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
        title: input.title,
        brandName: input.brandName || '',
        targetAudience: input.targetAudience || '',
        platform: input.platform || 'YouTube',
        targetDurationSec: input.targetDurationSec || 30,
        language: input.language || 'English',
        toneOfVoice: input.toneOfVoice || 'Energetic',
        marketingObjective: input.marketingObjective || 'Brand Awareness',
        topic: input.topic || '',
        contentType: input.contentType || 'YouTube',
        content: aiResult.content,
        aiModelUsed: aiResult.aiModelUsed,
        aiNotes: aiResult.aiNotes,
        groundingSources: aiResult.groundingSources,
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
    sections: aiResult.sections,
    usage: aiResult.usage as AIUsageStats,
    isMock: llm.capabilities.isMock,
    provider: llm.name,
  };
}
