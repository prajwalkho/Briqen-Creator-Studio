import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type {
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageProvider,
  ImageProviderCapabilities,
} from '../../interfaces/imageProvider.ts';

const execFileAsync = promisify(execFile);

function dimsFor(aspectRatio: string, resolution = '1K') {
  const high = resolution === '4K' || resolution === '2K';
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
      return { width: high ? 1920 : 1280, height: high ? 1080 : 720 };
  }
}

export class MockImageProvider implements ImageProvider {
  readonly name = 'mock';
  readonly capabilities: ImageProviderCapabilities = {
    name: 'mock',
    isMock: true,
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportsImageEditing: true,
    supportsSearchGrounding: false,
    supportsResolutions: ['1K', '2K', '4K'],
    limitations: [
      'Synthesizes placeholder frames locally via FFmpeg — NOT genuine AI-generated photography.',
    ],
  };

  async generateImage(request: ImageGenerateRequest, signal?: AbortSignal): Promise<ImageGenerateResult> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-mock-img-'));
    try {
      const dims = dimsFor(request.aspectRatio, request.resolution);
      const safeTitle = (request.prompt || 'Briqen Scene').replace(/[^a-zA-Z0-9 ,.-]/g, ' ').slice(0, 44);
      const safeStyle = (request.style || 'Default').replace(/[^a-zA-Z0-9 ,.-]/g, ' ').slice(0, 32);
      const outPath = path.join(tmpDir, 'mock_frame.png');

      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=#141923:s=${dims.width}x${dims.height}:d=1`,
          '-vf',
          `drawbox=x=48:y=48:w=${dims.width - 96}:h=${dims.height - 96}:color=#F59E0B@0.45:t=3,drawtext=text='MOCK IMAGE (${request.aspectRatio}) · ${safeStyle.replace(/'/g, '')}':fontcolor=#F59E0B:fontsize=24:x=80:y=96,drawtext=text='${safeTitle.replace(/'/g, '')}':fontcolor=white:fontsize=30:x=80:y=152`,
          '-frames:v',
          '1',
          outPath,
        ],
        { signal }
      );

      const buffer = await fs.promises.readFile(outPath);
      const reqId = `mock-img-${crypto.randomUUID().slice(0, 8)}`;
      return {
        buffer,
        mimeType: 'image/png',
        fileExtension: 'png',
        width: dims.width,
        height: dims.height,
        model: 'mock-image-v1',
        providerRequestId: reqId,
        metadata: {
          mockProvider: true,
          style: request.style || 'default',
          aspectRatio: request.aspectRatio,
          note: 'Synthesized locally via MockImageProvider + FFmpeg (not genuine AI output).',
        },
        usage: {
          estimatedCostUsd: 0,
          provider: 'mock',
          isMock: true,
          providerRequestId: reqId,
        },
      };
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }
}
