import { put, del } from '@vercel/blob';
import crypto from 'crypto';

const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

export const isBlobConfigured = Boolean(blobToken && blobToken.length > 10);

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// In-memory binary image cache for dev / test mode so actual image bytes are always returned
const devImageStore = new Map<string, { buffer: Buffer; contentType: string }>();

/**
 * Validates file buffer against actual magic byte signatures to prevent spoofed mime types.
 */
export function validateImageMagicBytes(buffer: Buffer): { isValid: boolean; detectedMime?: string; error?: string } {
  if (!buffer || buffer.length < 12) {
    return { isValid: false, error: 'File is too small to be a valid image.' };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { isValid: false, error: `File size exceeds the 10 MB maximum limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).` };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, detectedMime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, detectedMime: 'image/png' };
  }

  // WEBP: "RIFF" .... "WEBP"
  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { isValid: true, detectedMime: 'image/webp' };
  }

  return {
    isValid: false,
    error: 'Invalid file signature. Only authentic JPEG, PNG, or WebP images are permitted.',
  };
}

/**
 * Retrieves the cryptographic secret for signing upload authorization tokens.
 * Rejects missing secrets without fallback.
 */
function getUploadSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('Authentication signing key (AUTH_SECRET) is not configured in environment. Photo uploads are disabled.');
  }
  return secret.trim();
}

/**
 * Generates a short-lived authorization token scoped to a submission attempt (valid for 10 minutes).
 * Uses canonical JSON encoding for HMAC signing.
 */
export function generateUploadToken(repId?: string, attemptId?: string): { token: string; expiresAt: number; attemptId: string } {
  const secret = getUploadSecret();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const currentAttemptId = attemptId || `attm_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  
  const payloadObj = {
    repId: repId || 'anon',
    attemptId: currentAttemptId,
    expiresAt,
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const b64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  
  return {
    token: `${b64}.${sig}`,
    expiresAt,
    attemptId: currentAttemptId,
  };
}

/**
 * Validates a short-lived upload authorization token.
 * Uses identical canonical representation for verification as signing.
 */
export function verifyUploadToken(token: string): { isValid: boolean; attemptId?: string; repId?: string; error?: string } {
  if (!token || typeof token !== 'string') {
    return { isValid: false, error: 'Upload token is missing.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Malformed upload token.' };
  }

  const [b64, sig] = parts;
  let secret: string;
  try {
    secret = getUploadSecret();
  } catch (err: any) {
    return { isValid: false, error: err.message };
  }

  const expectedSig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { isValid: false, error: 'Upload token signature is invalid or tampered.' };
  }

  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      return { isValid: false, error: 'Upload token has expired.' };
    }
    return {
      isValid: true,
      attemptId: payload.attemptId,
      repId: payload.repId,
    };
  } catch {
    return { isValid: false, error: 'Invalid upload token payload.' };
  }
}

/**
 * Upload a genuinely private photo.
 * When Vercel Blob is configured, uses private Vercel Blob storage.
 * If storage is unavailable in production, throws an explicit error rather than simulating success.
 */
export async function uploadPrivatePhoto(
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<{
  storageKey: string;
  url: string;
}> {
  // Validate magic bytes and size
  const validation = validateImageMagicBytes(buffer);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (!isBlobConfigured) {
    if (isProd) {
      throw new Error('Vercel Blob storage is not configured (missing BLOB_READ_WRITE_TOKEN). Upload failed.');
    }
    // Development / preview fallback: retain actual binary image in dev store
    const localKey = `local_blob_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    devImageStore.set(localKey, { buffer, contentType: validation.detectedMime || contentType });
    return {
      storageKey: localKey,
      url: `/api/admin/attachments/view/${localKey}`,
    };
  }

  // Production private Vercel Blob storage
  const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `spiff-photos/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${cleanName}`;

  try {
    const blob = await put(path, buffer, {
      access: 'private', // Strictly private Vercel Blob access policy
      contentType: validation.detectedMime || contentType,
      token: blobToken,
      addRandomSuffix: true,
    });

    return {
      storageKey: blob.url || blob.pathname,
      url: blob.url,
    };
  } catch (err: any) {
    console.error('[Blob] Upload error:', err);
    throw new Error(`Failed to upload photo to storage: ${err.message}`);
  }
}

/**
 * Retrieves the actual uploaded image buffer for administrator viewing and verification.
 * Returns the authentic uploaded image bytes, never an SVG placeholder.
 */
export async function retrievePhotoImage(storageKey: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  // 1. Check local dev buffer store
  if (devImageStore.has(storageKey)) {
    return devImageStore.get(storageKey)!;
  }

  // 2. Fetch from Vercel Blob if URL
  if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
    try {
      const headers: Record<string, string> = {};
      if (blobToken) {
        headers['Authorization'] = `Bearer ${blobToken}`;
      }
      const res = await fetch(storageKey, { headers });
      if (!res.ok) {
        console.error(`[Blob] Failed to fetch photo from storageKey (HTTP ${res.status}): ${storageKey}`);
        return null;
      }
      const arrayBuffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
      };
    } catch (err) {
      console.error('[Blob] Error retrieving image from URL:', err);
      return null;
    }
  }

  return null;
}

/**
 * Delete a photo from Vercel Blob or local storage (used during cleanup of abandoned uploads).
 */
export async function deleteBlobPhoto(storageKey: string): Promise<boolean> {
  if (devImageStore.has(storageKey)) {
    devImageStore.delete(storageKey);
    return true;
  }

  if (!isBlobConfigured) return true;

  try {
    await del(storageKey, { token: blobToken });
    return true;
  } catch (err) {
    console.error('[Blob] Failed to delete blob:', err);
    return false;
  }
}
