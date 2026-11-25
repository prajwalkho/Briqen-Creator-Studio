import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import { projects, scenes } from '../../../db/schema.ts';
import type { LLMProviderName } from '../config.ts';
import { getLLMProvider } from '../factory.ts';
import type { AIUsageStats } from '../interfaces/llmProvider.ts';

export interface ExtractScenesServiceInput {
  projectId: string;
  aspectRatio: string;
  platform: string;
  activeScriptRevisionId?: string | null;
  scriptRevisionId?: string | null;
  content: string;
  replaceExisting?: boolean;
  provider?: LLMProviderName;
}

export async function extractAndSaveScenes(input: ExtractScenesServiceInput) {
  const llm = getLLMProvider(input.provider);

  const extracted = await llm.extractScenes({
    scriptContent: input.content,
    aspectRatio: input.aspectRatio,
    platform: input.platform,
  });

  const savedScenes = await db.transaction(async (tx) => {
    let startOrder = 0;
    if (input.replaceExisting !== false) {
      await tx.delete(scenes).where(eq(scenes.projectId, input.projectId));
    } else {
      const existingMax = await tx
        .select({ maxOrd: sql<number>`coalesce(max(${scenes.sceneOrder}), -1)::int` })
        .from(scenes)
        .where(eq(scenes.projectId, input.projectId));
      startOrder = (existingMax[0]?.maxOrd ?? -1) + 1;
    }

    const inserted = [];
    for (let i = 0; i < extracted.scenes.length; i++) {
      const item = extracted.scenes[i];
      const [row] = await tx
        .insert(scenes)
        .values({
          projectId: input.projectId,
          scriptRevisionId: input.scriptRevisionId ?? input.activeScriptRevisionId ?? null,
          sceneOrder: startOrder + i,
          title: item.title,
          narration: item.narration,
          visualDescription: item.visualDescription,
          imagePrompt: item.imagePrompt,
          videoPrompt: item.videoPrompt,
          durationSec: item.durationSec,
          transition: item.transition,
          mediaPreference: item.mediaPreference,
        })
        .returning();
      inserted.push(row);
    }

    await tx
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, input.projectId));

    return inserted;
  });

  return {
    scenes: savedScenes,
    extractedDto: extracted.scenes,
    modelUsed: extracted.modelUsed,
    usage: extracted.usage as AIUsageStats,
    isMock: llm.capabilities.isMock,
    provider: llm.name,
  };
}
