/**
 * Server-side encryption for Plaid access tokens stored in the database.
 * Uses AES-256-GCM. Key is derived from JWT_SECRET so no extra env var is needed.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  // Derive a deterministic 32-byte key from the JWT secret with a fixed domain label.
  return createHash('sha256').update(`plaid-token-encryption:${secret}`).digest();
}

export function encryptPlaidToken(plaintext: string): {
  encryptedAccessToken: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
} {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedAccessToken: encrypted.toString('base64'),
    accessTokenIv: iv.toString('base64'),
    accessTokenAuthTag: authTag.toString('base64'),
  };
}

export function decryptPlaidToken(
  encryptedAccessToken: string,
  accessTokenIv: string,
  accessTokenAuthTag: string,
): string {
  const key = getKey();
  const iv = Buffer.from(accessTokenIv, 'base64');
  const authTag = Buffer.from(accessTokenAuthTag, 'base64');
  const encrypted = Buffer.from(encryptedAccessToken, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
