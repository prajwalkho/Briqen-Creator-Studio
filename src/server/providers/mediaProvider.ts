import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getImageProvider, getVideoProvider } from '../ai/factory.ts';
import type { AIUsageStats } from '../ai/interfaces/llmProvider.ts';
import { getAiClient } from './aiClient.ts';

const execFileAsync = promisify(execFile);

export interface MediaGenerationRequest {
  mediaType: 'image' | 'video' | 'audio_tts' | 'audio_music';
  provider: 'gemini' | 'openai' | 'mock';
  model: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  style?: string;
  durationSec?: number;
  useSearchGrounding?: boolean;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  voiceName?: string;
  voiceStyle?: string;
  secondSpeakerText?: string;
  secondSpeakerVoice?: string;
}

export interface MediaGenerationOutput {
  buffer: Buffer;
  mimeType: string;
  fileExtension: string;
  width?: number;
  height?: number;
  durationSec?: number;
  modelUsed?: string;
  providerJobId?: string;
  providerRequestId?: string;
  usage?: AIUsageStats;
  metadata?: Record<string, unknown>;
}

export interface BaseMediaProvider {
  name: string;
  generate(req: MediaGenerationRequest, signal?: AbortSignal): Promise<MediaGenerationOutput>;
}

export class MockMediaProvider implements BaseMediaProvider {
  name = 'mock';

  async generate(req: MediaGenerationRequest, signal?: AbortSignal): Promise<MediaGenerationOutput> {
    if (req.mediaType === 'image') {
      const img = await getImageProvider('mock').generateImage(
        {
          prompt: req.prompt,
          aspectRatio: (req.aspectRatio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4') || '16:9',
          resolution: (req.resolution as '1K' | '2K' | '4K') || '1K',
          style: req.style,
          referenceImageBase64: req.referenceImageBase64,
          referenceImageMimeType: req.referenceImageMimeType,
        },
        signal
      );
      return {
        buffer: img.buffer,
        mimeType: img.mimeType,
        fileExtension: img.fileExtension,
        width: img.width,
        height: img.height,
        modelUsed: img.model,
        providerRequestId: img.providerRequestId,
        usage: img.usage,
        metadata: img.metadata,
      };
    }

    if (req.mediaType === 'video') {
      const vid = await getVideoProvider('mock').generateVideo(
        {
          prompt: req.prompt,
          aspectRatio: req.aspectRatio === '9:16' ? '9:16' : '16:9',
          resolution: (req.resolution as '360p' | '720p' | '1080p' | '4k') || '720p',
          style: req.style,
          durationSec: req.durationSec || 5,
          referenceImageBase64: req.referenceImageBase64,
          referenceImageMimeType: req.referenceImageMimeType,
        },
        signal
      );
      return {
        buffer: vid.buffer,
        mimeType: vid.mimeType,
        fileExtension: vid.fileExtension,
        width: vid.width,
        height: vid.height,
        durationSec: vid.durationSec,
        modelUsed: vid.model,
        providerJobId: vid.providerJobId,
        usage: vid.usage,
        metadata: vid.metadata,
      };
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-mock-audio-'));
    try {
      if (req.mediaType === 'audio_tts' || req.mediaType === 'audio_music') {
        const dur = req.mediaType === 'audio_tts' ? 4 : 8;
        const ext = req.mediaType === 'audio_tts' ? 'wav' : 'mp3';
        const mime = req.mediaType === 'audio_tts' ? 'audio/wav' : 'audio/mpeg';
        const freq = req.mediaType === 'audio_tts' ? 220 : 330;
        const outPath = path.join(tmpDir, `mock_audio.${ext}`);
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `sine=frequency=${freq}:sample_rate=24000:duration=${dur}`,
            '-af',
            'volume=0.06',
            outPath,
          ],
          { signal }
        );
        const buffer = await fs.promises.readFile(outPath);
        return {
          buffer,
          mimeType: mime,
          fileExtension: ext,
          durationSec: dur,
          modelUsed: req.mediaType === 'audio_tts' ? 'mock-tts-v1' : 'mock-music-v1',
          metadata: { mockProvider: true, note: 'Synthesized locally via MockMediaProvider + FFmpeg' },
        };
      }
      throw new Error(`Unsupported mock media type: ${req.mediaType}`);
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }
}

export class UnifiedMediaProvider implements BaseMediaProvider {
  public readonly name: 'gemini' | 'openai' | 'mock';

  constructor(name: 'gemini' | 'openai' | 'mock') {
    this.name = name;
  }

  async generate(req: MediaGenerationRequest, signal?: AbortSignal): Promise<MediaGenerationOutput> {
    if (req.mediaType === 'image') {
      const img = await getImageProvider(this.name).generateImage(
        {
          model: req.model,
          prompt: req.prompt,
          aspectRatio: (req.aspectRatio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4') || '16:9',
          resolution: (req.resolution as '1K' | '2K' | '4K') || '1K',
          style: req.style,
          useSearchGrounding: req.useSearchGrounding,
          referenceImageBase64: req.referenceImageBase64,
          referenceImageMimeType: req.referenceImageMimeType,
        },
        signal
      );
      return {
        buffer: img.buffer,
        mimeType: img.mimeType,
        fileExtension: img.fileExtension,
        width: img.width,
        height: img.height,
        modelUsed: img.model,
        providerRequestId: img.providerRequestId,
        usage: img.usage,
        metadata: img.metadata,
      };
    }

    if (req.mediaType === 'video') {
      const vid = await getVideoProvider(this.name).generateVideo(
        {
          prompt: req.prompt,
          aspectRatio: req.aspectRatio === '9:16' ? '9:16' : '16:9',
          resolution: (req.resolution as '360p' | '720p' | '1080p' | '4k') || '720p',
          style: req.style,
          durationSec: req.durationSec || 6,
          referenceImageBase64: req.referenceImageBase64,
          referenceImageMimeType: req.referenceImageMimeType,
        },
        signal
      );
      return {
        buffer: vid.buffer,
        mimeType: vid.mimeType,
        fileExtension: vid.fileExtension,
        width: vid.width,
        height: vid.height,
        durationSec: vid.durationSec,
        modelUsed: vid.model,
        providerJobId: vid.providerJobId,
        usage: vid.usage,
        metadata: vid.metadata,
      };
    }

    if (this.name === 'mock') {
      return new MockMediaProvider().generate(req, signal);
    }

    if (this.name !== 'gemini') {
      throw new Error(`Provider "${this.name}" does not support ${req.mediaType}.`);
    }

    const ai = getAiClient();

    if (req.mediaType === 'audio_tts') {
      const model = 'gemini-3.8-flash-tts';
      const primaryVoice = req.voiceName || 'Kore';
      const isDualSpeaker = Boolean(req.secondSpeakerText && req.secondSpeakerText.trim());
      const parts: Array<Record<string, unknown>> = [
        {
          text: req.prompt,
          speechMetadata: {
            ...(isDualSpeaker ? { speaker: 'Speaker 1' } : {}),
            style: req.voiceStyle || 'Clear, warm commercial narrator',
          },
        },
      ];

      if (isDualSpeaker && req.secondSpeakerText) {
        parts.push({
          text: req.secondSpeakerText,
          speechMetadata: {
            speaker: 'Speaker 2',
            style: 'Conversational co-host',
          },
        });
      }

      const speechConfig = isDualSpeaker
        ? {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Speaker 1',
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: primaryVoice } },
                },
                {
                  speaker: 'Speaker 2',
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: req.secondSpeakerVoice || 'Puck' } },
                },
              ],
            },
          }
        : {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: primaryVoice },
            },
          };

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: parts as never }],
        config: {
          abortSignal: signal,
          responseModalities: ['AUDIO'],
          speechConfig: speechConfig as never,
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('Gemini TTS did not return an audio payload.');
      }

      return {
        buffer: Buffer.from(base64Audio, 'base64'),
        mimeType: 'audio/wav',
        fileExtension: 'wav',
        modelUsed: model,
        metadata: { model, voice: primaryVoice, dualSpeaker: isDualSpeaker },
      };
    }

    if (req.mediaType === 'audio_music') {
      const model =
        req.model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

      const contents =
        req.referenceImageBase64 && req.referenceImageMimeType
          ? {
              parts: [
                { text: req.prompt },
                {
                  inlineData: {
                    data: req.referenceImageBase64,
                    mimeType: req.referenceImageMimeType,
                  },
                },
              ],
            }
          : req.prompt;

      const response = await ai.models.generateContentStream({
        model,
        contents: contents as never,
      });

      const audioChunks: Buffer[] = [];
      let lyrics = '';
      let mimeType = 'audio/mpeg';

      for await (const chunk of response) {
        if (signal?.aborted) {
          throw new Error('Music generation aborted');
        }
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
          }
          if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioChunks.length === 0) {
        throw new Error('Lyria did not return any audio chunks.');
      }

      const ext = mimeType.includes('wav') ? 'wav' : 'mp3';
      return {
        buffer: Buffer.concat(audioChunks),
        mimeType,
        fileExtension: ext,
        durationSec: model === 'lyria-3-clip-preview' ? 30 : 60,
        modelUsed: model,
        metadata: { model, lyrics: lyrics.trim() },
      };
    }

    throw new Error(`Unsupported mediaType: ${req.mediaType}`);
  }
}

export function getMediaProvider(providerName: 'gemini' | 'openai' | 'mock'): BaseMediaProvider {
  return new UnifiedMediaProvider(providerName);
}
