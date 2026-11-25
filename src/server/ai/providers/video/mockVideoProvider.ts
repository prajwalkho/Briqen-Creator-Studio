import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type {
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoProvider,
  VideoProviderCapabilities,
} from '../../interfaces/videoProvider.ts';

const execFileAsync = promisify(execFile);

function dimsFor(aspectRatio: '16:9' | '9:16', resolution = '720p') {
  const is1080 = resolution === '1080p' || resolution === '4k';
  if (aspectRatio === '9:16') {
    return is1080 ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
  }
  return is1080 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
}

export class MockVideoProvider implements VideoProvider {
  readonly name = 'mock';
  readonly capabilities: VideoProviderCapabilities = {
    name: 'mock',
    isMock: true,
    supportedAspectRatios: ['16:9', '9:16'],
    supportsImageToVideo: true,
    minDurationSec: 3,
    maxDurationSec: 15,
    supportedResolutions: ['360p', '720p', '1080p'],
    limitations: [
      'Synthesizes placeholder MP4 clips locally via FFmpeg — NOT genuine AI video motion.',
    ],
  };

  async generateVideo(request: VideoGenerateRequest, signal?: AbortSignal): Promise<VideoGenerateResult> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-mock-vid-'));
    try {
      const dims = dimsFor(request.aspectRatio, request.resolution);
      const dur = Math.min(15, Math.max(3, request.durationSec || 5));
      const safeTitle = (request.prompt || 'Briqen Video Scene')
        .replace(/[^a-zA-Z0-9 ,.-]/g, ' ')
        .slice(0, 44);
      const safeStyle = (request.style || 'Default').replace(/[^a-zA-Z0-9 ,.-]/g, ' ').slice(0, 30);
      const outPath = path.join(tmpDir, 'mock_clip.mp4');
      const modeLabel = request.referenceImageBase64 ? 'IMAGE-TO-VIDEO' : 'TEXT-TO-VIDEO';

      if (request.referenceImageBase64) {
        const ext = request.referenceImageMimeType?.includes('jpeg') ? 'jpg' : 'png';
        const refPath = path.join(tmpDir, `ref_input.${ext}`);
        await fs.promises.writeFile(refPath, Buffer.from(request.referenceImageBase64, 'base64'));

        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-loop',
            '1',
            '-t',
            String(dur),
            '-i',
            refPath,
            '-f',
            'lavfi',
            '-i',
            `anullsrc=r=44100:cl=stereo:d=${dur}`,
            '-vf',
            `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2:color=#101520,setsar=1,drawbox=x=32:y=32:w=${dims.width - 64}:h=${dims.height - 64}:color=#F59E0B@0.5:t=3,drawtext=text='MOCK ${modeLabel} (${request.aspectRatio})':fontcolor=#F59E0B:fontsize=24:x=64:y=68,drawtext=text='${safeTitle.replace(/'/g, '')}':fontcolor=white:fontsize=28:x=64:y=114`,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-shortest',
            outPath,
          ],
          { signal }
        );
      } else {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `color=c=#101520:s=${dims.width}x${dims.height}:r=24:d=${dur}`,
            '-f',
            'lavfi',
            '-i',
            `anullsrc=r=44100:cl=stereo:d=${dur}`,
            '-vf',
            `drawbox=x=40:y=40:w=${dims.width - 80}:h=${dims.height - 80}:color=#F59E0B@0.45:t=3,drawtext=text='MOCK ${modeLabel} (${request.aspectRatio}) · ${safeStyle.replace(/'/g, '')}':fontcolor=#F59E0B:fontsize=24:x=76:y=90,drawtext=text='${safeTitle.replace(/'/g, '')}':fontcolor=white:fontsize=30:x=76:y=148`,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-shortest',
            outPath,
          ],
          { signal }
        );
      }

      const buffer = await fs.promises.readFile(outPath);
      const jobId = `mock-vid-${crypto.randomUUID().slice(0, 8)}`;
      return {
        buffer,
        mimeType: 'video/mp4',
        fileExtension: 'mp4',
        width: dims.width,
        height: dims.height,
        durationSec: dur,
        model: 'mock-video-v1',
        providerJobId: jobId,
        metadata: {
          mockProvider: true,
          mode: request.referenceImageBase64 ? 'image_to_video' : 'text_to_video',
          aspectRatio: request.aspectRatio,
          resolution: request.resolution || '720p',
          note: 'Synthesized locally via MockVideoProvider + FFmpeg (not genuine AI output).',
        },
        usage: {
          estimatedCostUsd: 0,
          provider: 'mock',
          isMock: true,
          providerRequestId: jobId,
        },
      };
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }
}
