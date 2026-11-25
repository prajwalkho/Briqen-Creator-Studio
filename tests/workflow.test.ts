import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MockMediaProvider } from '../src/server/providers/mediaProvider.ts';
import {
  generateScriptWithAI,
  reviseScriptWithAI,
  extractScenesWithAI,
} from '../src/server/providers/scriptService.ts';
import {
  createSignedMediaUrl,
  deleteObject,
  resolveSafeStoragePath,
  saveObject,
  verifySignedMediaParams,
} from '../src/server/storage.ts';

test('Object storage writes, signs, verifies URLs, and blocks path traversal', async () => {
  const key = 'test/integration_sample.txt';
  const payload = Buffer.from('briqen-storage-check', 'utf8');
  const { sizeBytes } = await saveObject(key, payload);
  assert.equal(sizeBytes, payload.byteLength);

  const signed = createSignedMediaUrl(key, 120);
  const url = new URL(`http://localhost:3000${signed}`);
  assert.equal(
    verifySignedMediaParams(
      url.searchParams.get('key') || '',
      url.searchParams.get('exp') || '',
      url.searchParams.get('sig') || ''
    ),
    true
  );

  // Tampered signature must fail
  assert.equal(
    verifySignedMediaParams(
      url.searchParams.get('key') || '',
      url.searchParams.get('exp') || '',
      'deadbeef'
    ),
    false
  );

  // Path traversal must throw
  assert.throws(() => resolveSafeStoragePath('../../etc/passwd'));

  const resolved = resolveSafeStoragePath(key);
  assert.equal(fs.existsSync(resolved), true);
  await deleteObject(key);
});

test('Mock script generation, revision, and scene extraction workflow', async () => {
  const generated = await generateScriptWithAI({
    title: 'Acoustic Studio Launch',
    brandName: 'Briqen Sound',
    targetAudience: 'Audio engineers',
    platform: 'YouTube',
    targetDurationSec: 30,
    language: 'English',
    toneOfVoice: 'Confident',
    marketingObjective: 'Conversions',
    provider: 'mock',
  });
  assert.ok(generated.content.includes('Briqen Sound'));
  assert.equal(generated.aiModelUsed, 'mock-script-provider');

  const revised = await reviseScriptWithAI({
    currentContent: generated.content,
    action: 'shorten',
    platform: 'YouTube',
    language: 'English',
    provider: 'mock',
  });
  assert.ok(revised.content.includes('MOCK REVISION: SHORTEN'));

  const extracted = await extractScenesWithAI(revised.content, '16:9', 'YouTube', 'mock');
  assert.ok(extracted.scenes.length >= 2);
  assert.ok(extracted.scenes[0].imagePrompt.length > 0);
});

test('MockMediaProvider synthesizes real PNG, MP4, and WAV files via FFmpeg', async () => {
  const provider = new MockMediaProvider();

  const img = await provider.generate({
    mediaType: 'image',
    provider: 'mock',
    model: 'mock-image-v1',
    prompt: 'Studio product hero frame',
    aspectRatio: '16:9',
  });
  assert.equal(img.mimeType, 'image/png');
  assert.ok(img.buffer.byteLength > 1000);

  const vid = await provider.generate({
    mediaType: 'video',
    provider: 'mock',
    model: 'mock-video-v1',
    prompt: 'Smooth tracking shot',
    aspectRatio: '16:9',
    durationSec: 3,
  });
  assert.equal(vid.mimeType, 'video/mp4');
  assert.ok(vid.buffer.byteLength > 5000);

  const tts = await provider.generate({
    mediaType: 'audio_tts',
    provider: 'mock',
    model: 'mock-tts-v1',
    prompt: 'Welcome to Briqen Creator Studio.',
  });
  assert.equal(tts.mimeType, 'audio/wav');
  assert.ok(tts.buffer.byteLength > 1000);
});
