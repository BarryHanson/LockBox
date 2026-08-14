/**
 * Cryptography utilities for end-to-end encryption
 * 
 * This module provides functions for:
 * 1. Generating encryption keys from user passwords
 * 2. Encrypting and decrypting sensitive data
 * 3. Securely storing encryption keys
 */

import { pbkdf2, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

// Constants for encryption
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 12 bytes per NIST SP 800-38D recommendation for AES-GCM
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ITERATIONS = 100000;

/**
 * Derives an encryption key from a user's master password
 */
export async function deriveKeyFromPassword(password: string, salt?: Buffer): Promise<{ key: Buffer; salt: Buffer }> {
  const saltBuffer = salt || randomBytes(SALT_LENGTH);
  const key = await pbkdf2Async(password, saltBuffer, ITERATIONS, KEY_LENGTH, 'sha256');
  return { key, salt: saltBuffer };
}

/**
 * Encrypts data using the provided key
 */
export function encrypt(data: string, key: Buffer): { encrypted: string; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv,
    authTag
  };
}

/**
 * Decrypts data using the provided key
 */
export function decrypt(encryptedData: string, key: Buffer, iv: Buffer, authTag: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Formats encrypted data for storage
 */
export function formatEncryptedData(encrypted: string, iv: Buffer, authTag: Buffer, salt: Buffer): string {
  const ivHex = iv.toString('hex');
  const authTagHex = authTag.toString('hex');
  const saltHex = salt.toString('hex');
  
  return `${encrypted}:${ivHex}:${authTagHex}:${saltHex}`;
}

/**
 * Parses encrypted data from storage format
 */
export function parseEncryptedData(data: string): { 
  encrypted: string; 
  iv: Buffer; 
  authTag: Buffer;
  salt: Buffer;
} {
  const [encrypted, ivHex, authTagHex, saltHex] = data.split(':');
  
  return {
    encrypted,
    iv: Buffer.from(ivHex, 'hex'),
    authTag: Buffer.from(authTagHex, 'hex'),
    salt: Buffer.from(saltHex, 'hex')
  };
}

/**
 * Encrypts an object with sensitive data
 */
export async function encryptObject<T extends Record<string, any>>(
  obj: T,
  key: Buffer,
  fieldsToEncrypt: (keyof T)[]
): Promise<{ encryptedObj: T; encryptionData: Record<string, { iv: string; authTag: string; salt: string }> }> {
  const encryptedObj = { ...obj };
  const encryptionData: Record<string, { iv: string; authTag: string; salt: string }> = {};

  for (const field of fieldsToEncrypt) {
    if (typeof obj[field] === 'string') {
      const salt = randomBytes(SALT_LENGTH);
      const { key: derivedKey } = await deriveKeyFromPassword(key.toString('hex'), salt);
      const { encrypted, iv, authTag } = encrypt(obj[field] as string, derivedKey);

      encryptedObj[field] = encrypted as any;
      encryptionData[field as string] = {
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        salt: salt.toString('hex')
      };
    }
  }

  return { encryptedObj, encryptionData };
}

/**
 * Decrypts an object with encrypted data
 */
export async function decryptObject<T extends Record<string, any>>(
  obj: T,
  key: Buffer,
  fieldsToDecrypt: (keyof T)[],
  encryptionData: Record<string, { iv: string; authTag: string; salt: string }>
): Promise<T> {
  const decryptedObj = { ...obj };

  for (const field of fieldsToDecrypt) {
    if (typeof obj[field] === 'string' && encryptionData[field as string]) {
      const { iv, authTag, salt } = encryptionData[field as string];
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');
      const saltBuffer = Buffer.from(salt, 'hex');

      const { key: derivedKey } = await deriveKeyFromPassword(key.toString('hex'), saltBuffer);
      const decrypted = decrypt(obj[field] as string, derivedKey, ivBuffer, authTagBuffer);

      decryptedObj[field] = decrypted as any;
    }
  }

  return decryptedObj;
}

/**
 * Generates a secure encryption key for the user
 */
export function generateEncryptionKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * Encrypts the user's encryption key with their master password
 * for secure storage
 */
export async function encryptEncryptionKey(encryptionKey: Buffer, masterPassword: string): Promise<string> {
  const { key, salt } = await deriveKeyFromPassword(masterPassword);
  const { encrypted, iv, authTag } = encrypt(encryptionKey.toString('hex'), key);

  return formatEncryptedData(encrypted, iv, authTag, salt);
}

/**
 * Decrypts the user's encryption key using their master password
 */
export async function decryptEncryptionKey(encryptedKey: string, masterPassword: string): Promise<Buffer> {
  const { encrypted, iv, authTag, salt } = parseEncryptedData(encryptedKey);
  const { key } = await deriveKeyFromPassword(masterPassword, salt);

  const decryptedKeyHex = decrypt(encrypted, key, iv, authTag);
  return Buffer.from(decryptedKeyHex, 'hex');
}
