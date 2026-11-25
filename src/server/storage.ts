import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.OBJECT_STORAGE_DIR || './storage/objects');
const SIGNING_SECRET = process.env.MEDIA_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

export function getStorageRoot(): string {
  return STORAGE_ROOT;
}

export function resolveSafeStoragePath(storageKey: string): string {
  const cleaned = storageKey.replace(/^\/+/, '');
  const resolved = path.resolve(STORAGE_ROOT, cleaned);
  if (!resolved.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error('Invalid storage key path.');
  }
  return resolved;
}

export async function saveObject(storageKey: string, buffer: Buffer): Promise<{ sizeBytes: number }> {
  const targetPath = resolveSafeStoragePath(storageKey);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, buffer);
  return { sizeBytes: buffer.byteLength };
}

export async function readObjectBuffer(storageKey: string): Promise<Buffer> {
  const targetPath = resolveSafeStoragePath(storageKey);
  return fs.promises.readFile(targetPath);
}

export async function deleteObject(storageKey: string): Promise<void> {
  try {
    const targetPath = resolveSafeStoragePath(storageKey);
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
    }
  } catch (err) {
    console.warn('Object deletion warning:', err);
  }
}

export function createSignedMediaUrl(storageKey: string, ttlSeconds = 3600 * 12): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${storageKey}:${exp}`;
  const sig = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  const params = new URLSearchParams({
    key: storageKey,
    exp: String(exp),
    sig,
  });
  return `/api/v1/media/signed?${params.toString()}`;
}

export function verifySignedMediaParams(key: string, expStr: string, sig: string): boolean {
  const exp = Number(expStr);
  if (!key || !Number.isFinite(exp) || !sig) return false;
  if (Math.floor(Date.now() / 1000) > exp) return false;

  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${key}:${exp}`)
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
