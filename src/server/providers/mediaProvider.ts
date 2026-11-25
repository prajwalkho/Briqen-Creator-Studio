import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getAiClient } from './aiClient.ts';

const execFileAsync = promisify(execFile);

export interface MediaGenerationRequest {
  mediaType: 'image' | 'video' | 'audio_tts' | 'audio_music';
  provider: 'gemini' | 'mock';
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
  metadata?: Record<string, unknown>;
}

export interface BaseMediaProvider {
  name: string;
  generate(req: MediaGenerationRequest): Promise<MediaGenerationOutput>;
}

function dimensionsForAspect(aspectRatio = '16:9', resolution = '1K'): { width: number; height: number } {
  const base = resolution === '4K' ? 1920 : resolution === '2K' ? 1440 : 1280;
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1024, height: 1024 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    case '16:9':
    default:
      return { width: base === 1280 ? 1280 : 1920, height: base === 1280 ? 720 : 1080 };
  }
}

export class MockMediaProvider implements BaseMediaProvider {
  name = 'mock';

  async generate(req: MediaGenerationRequest): Promise<MediaGenerationOutput> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-mock-'));
    try {
      const dims = dimensionsForAspect(req.aspectRatio || '16:9', req.resolution);
      const safeTitle = (req.prompt || 'Briqen Scene').replace(/[^a-zA-Z0-9 ,.-]/g, ' ').slice(0, 46);

      if (req.mediaType === 'image') {
        const outPath = path.join(tmpDir, 'mock_frame.png');
        const filter = [
          `color=c=#141923:s=${dims.width}x${dims.height}`,
          `drawbox=x=48:y=48:w=${dims.width - 96}:h=${dims.height - 96}:color=#F59E0B@0.35:t=3`,
          `drawtext=text='BRIQEN MOCK STUDIO FRAME':fontcolor=#F59E0B:fontsize=26:x=80:y=96`,
          `drawtext=text='${safeTitle.replace(/'/g, '')}':fontcolor=white:fontsize=34:x=80:y=160`,
        ].join(',');
        await execFileAsync('ffmpeg', [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=#141923:s=${dims.width}x${dims.height}:d=1`,
          '-vf',
          `drawbox=x=48:y=48:w=${dims.width - 96}:h=${dims.height - 96}:color=#F59E0B@0.45:t=3,drawtext=text='MOCK IMAGE (${req.aspectRatio || '16:9'})':fontcolor=#F59E0B:fontsize=24:x=80:y=96,drawtext=text='${safeTitle.replace(/'/g, '')}':fontcolor=white:fontsize=32:x=80:y=150`,
          '-frames:v',
          '1',
          outPath,
        ]);
        const buffer = await fs.promises.readFile(outPath);
        return {
          buffer,
          mimeType: 'image/png',
          fileExtension: 'png',
          width: dims.width,
          height: dims.height,
          metadata: { mockProvider: true, note: 'Synthesized locally via MockMediaProvider + FFmpeg' },
        };
      }

      if (req.mediaType === 'video') {
        const dur = Math.min(15, Math.max(3, req.durationSec || 5));
        const outPath = path.join(tmpDir, 'mock_clip.mp4');
        await execFileAsync('ffmpeg', [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=#101520:s=${dims.width}x${dims.height}:r=30:d=${dur}`,
          '-f',
          'lavfi',
          '-i',
          `anullsrc=r=44100:cl=stereo:d=${dur}`,
          '-vf',
          `drawbox=x=40:y=40:w=${dims.width - 80}:h=${dims.height - 80}:color=#F59E0B@0.4:t=3,drawtext=text='MOCK VIDEO CLIP':fontcolor=#F59E0B:fontsize=26:x=80:y=90,drawtext=text='${safeTitle.replace(/'/g, '')}':fontcolor=white:fontsize=32:x=80:y=150`,
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          outPath,
        ]);
        const buffer = await fs.promises.readFile(outPath);
        return {
          buffer,
          mimeType: 'video/mp4',
          fileExtension: 'mp4',
          width: dims.width,
          height: dims.height,
          durationSec: dur,
          metadata: { mockProvider: true, note: 'Synthesized locally via MockMediaProvider + FFmpeg' },
        };
      }

      if (req.mediaType === 'audio_tts' || req.mediaType === 'audio_music') {
        const dur = req.mediaType === 'audio_tts' ? 4 : 8;
        const ext = req.mediaType === 'audio_tts' ? 'wav' : 'mp3';
        const mime = req.mediaType === 'audio_tts' ? 'audio/wav' : 'audio/mpeg';
        const freq = req.mediaType === 'audio_tts' ? 220 : 330;
        const outPath = path.join(tmpDir, `mock_audio.${ext}`);
        await execFileAsync('ffmpeg', [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=${freq}:sample_rate=24000:duration=${dur}`,
          '-af',
          'volume=0.06',
          outPath,
        ]);
        const buffer = await fs.promises.readFile(outPath);
        return {
          buffer,
          mimeType: mime,
          fileExtension: ext,
          durationSec: dur,
          metadata: { mockProvider: true, note: 'Synthesized locally via MockMediaProvider + FFmpeg' },
        };
      }

      throw new Error(`Unsupported mock media type: ${req.mediaType}`);
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }
}

export class GeminiMediaProvider implements BaseMediaProvider {
  name = 'gemini';

  async generate(req: MediaGenerationRequest): Promise<MediaGenerationOutput> {
    const ai = getAiClient();

    if (req.mediaType === 'image') {
      const model =
        req.model === 'gemini-3.1-flash-lite-image'
          ? 'gemini-3.1-flash-lite-image'
          : 'gemini-nano-banana-2.1';
      const styledPrompt = req.style ? `${req.prompt}\nVisual style: ${req.style}` : req.prompt;
      const parts: Array<Record<string, unknown>> = [];

      if (req.referenceImageBase64 && req.referenceImageMimeType) {
        parts.push({
          inlineData: {
            data: req.referenceImageBase64,
            mimeType: req.referenceImageMimeType,
          },
        });
      }
      parts.push({ text: styledPrompt });

      const config: Record<string, unknown> = {
        imageConfig: {
          aspectRatio: req.aspectRatio || '16:9',
          ...(model === 'gemini-nano-banana-2.1' && req.resolution
            ? { imageSize: req.resolution }
            : {}),
        },
      };

      if (model === 'gemini-nano-banana-2.1' && req.useSearchGrounding) {
        config.tools = [
          {
            googleSearch: {
              searchTypes: {
                webSearch: {},
                imageSearch: {},
              },
            },
          },
        ];
      }

      const response = await ai.models.generateContent({
        model,
        contents: { parts: parts as never },
        config: config as never,
      });

      const respParts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of respParts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
          const dims = dimensionsForAspect(req.aspectRatio || '16:9', req.resolution);
          return {
            buffer: Buffer.from(part.inlineData.data, 'base64'),
            mimeType,
            fileExtension: ext,
            width: dims.width,
            height: dims.height,
            metadata: { model },
          };
        }
      }
      throw new Error('Gemini did not return an image payload.');
    }

    if (req.mediaType === 'video') {
      const model = 'gemini-omni-1.2-flash';
      const aspectRatio = req.aspectRatio === '9:16' ? '9:16' : '16:9';
      const durNum = Math.min(15, Math.max(3, req.durationSec || 6));
      const duration = `${durNum}s`;
      const resolution =
        req.resolution === '1080p' || req.resolution === '360p' || req.resolution === '4k'
          ? req.resolution
          : '720p';

      const promptText = req.style ? `${req.prompt}. Style: ${req.style}` : req.prompt;
      const inputPayload =
        req.referenceImageBase64 && req.referenceImageMimeType
          ? [
              {
                type: 'image' as const,
                mime_type: req.referenceImageMimeType,
                data: req.referenceImageBase64,
              },
              {
                type: 'text' as const,
                text: promptText,
              },
            ]
          : promptText;

      const interaction = await ai.interactions.create(
        {
          model,
          input: inputPayload as never,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
            duration,
            resolution,
          } as never,
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (!videoPart?.data) {
        throw new Error('Gemini Omni did not return a video payload.');
      }

      const dims = dimensionsForAspect(aspectRatio, resolution);
      return {
        buffer: Buffer.from(videoPart.data, 'base64'),
        mimeType: videoPart.mime_type || 'video/mp4',
        fileExtension: 'mp4',
        width: dims.width,
        height: dims.height,
        durationSec: durNum,
        metadata: { model, interactionId: interaction.id, aspectRatio, resolution },
      };
    }

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
        metadata: { model, lyrics: lyrics.trim() },
      };
    }

    throw new Error(`Unsupported mediaType: ${req.mediaType}`);
  }
}

export function getMediaProvider(providerName: 'gemini' | 'mock'): BaseMediaProvider {
  return providerName === 'mock' ? new MockMediaProvider() : new GeminiMediaProvider();
}
