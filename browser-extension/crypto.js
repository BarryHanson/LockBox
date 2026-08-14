/**
 * ByteLock Browser Extension - Crypto Module
 * Client-side encryption matching the main app's clientCrypto.ts
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const ITERATIONS = 100000;

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function deriveKeyFromPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const useSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: useSalt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  return { key, salt: useSalt };
}

export async function encrypt(data, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(data)
  );
  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv,
  };
}

export async function decrypt(encryptedData, key, iv) {
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    base64ToArrayBuffer(encryptedData)
  );
  return new TextDecoder().decode(decrypted);
}

export async function exportCryptoKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(raw);
}

export async function importCryptoKey(base64Key) {
  const raw = base64ToArrayBuffer(base64Key);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function decryptField(encryptedValue, key, encryptionMeta) {
  if (!encryptionMeta || !encryptionMeta.iv) return encryptedValue;
  try {
    const iv = new Uint8Array(base64ToArrayBuffer(encryptionMeta.iv));

    // The main app encrypts each field with a per-field derived key (master key + per-field salt).
    // We must re-derive that key before decrypting, otherwise the key won't match.
    let decryptKey = key;
    if (encryptionMeta.salt) {
      const salt = new Uint8Array(base64ToArrayBuffer(encryptionMeta.salt));
      const keyStr = await exportCryptoKey(key);
      const { key: derivedKey } = await deriveKeyFromPassword(keyStr, salt);
      decryptKey = derivedKey;
    }

    return await decrypt(encryptedValue, decryptKey, iv);
  } catch {
    return encryptedValue;
  }
}

export async function encryptField(value, key) {
  // Generate a per-field salt and derive a unique key, matching main app's encryptObject
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyStr = await exportCryptoKey(key);
  const { key: derivedKey } = await deriveKeyFromPassword(keyStr, salt);
  const { encrypted, iv } = await encrypt(value, derivedKey);
  return {
    encrypted,
    meta: {
      iv: arrayBufferToBase64(iv.buffer),
      salt: arrayBufferToBase64(salt.buffer),
    },
  };
}
