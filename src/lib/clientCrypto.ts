"use client";

/**
** Client-side cryptography utilities for zero-knowledge end-to-end encryption
**
** This module provides browser-compatible functions for:
** 1. Deriving encryption keys from master password (NEVER sent to server)
** 2. Encrypting sensitive data before sending to the server
** 3. Decrypting data received from the server
** 4. Managing encryption keys in memory (NEVER in storage or on server)
**/

// Ensure crypto API is available (it should be in modern browsers and Next.js client environment)
const getCryptoSubtle = () => {
  // Check if we're in a secure context
  const isSecureContext = typeof window !== 'undefined' && (window as any).isSecureContext;

  // Check window.crypto as fallback
  if (typeof window !== 'undefined' && window.crypto) {
    if (window.crypto.subtle) {
      return window.crypto.subtle;
    }
  }

  if (typeof globalThis === 'undefined') {
    throw new Error('Global object not available');
  }

  if (!globalThis.crypto?.subtle) {
    const context = typeof window !== 'undefined' ? window.location.protocol : 'unknown';
    const secure = typeof window !== 'undefined' ? (window as any).isSecureContext : false;

    throw new Error(
      `Web Crypto API not available. This API requires a SECURE CONTEXT (HTTPS or localhost). ` +
      `Current protocol: ${context}, isSecureContext: ${secure}. ` +
      `If accessing via IP address or HTTP, the browser blocks crypto.subtle for security. ` +
      `Solution: Access via HTTPS or use localhost for development.`
    );
  }
  return globalThis.crypto.subtle;
};

// Constants for encryption
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // 256 bits
const IV_LENGTH = 12; // 12 bytes for AES-GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000;

// Define an in-memory store to hold encryption keys during runtime
// Zero-knowledge architecture: Keys exist only in memory, never sent to server
interface InMemoryKeyStore {
  encryptionKey: string | null;
  encryptionKeyTimestamp: string | null;
  userSalt: string | null; // Store salt instead of encryptedMasterKey
}

const inMemoryKeyStore: InMemoryKeyStore = {
  encryptionKey: null,
  encryptionKeyTimestamp: null,
  userSalt: null
};

/**
 * Store user's salt for key derivation in memory
 * @param salt The salt used for key derivation
 */
export function storeSalt(salt: string): void {
  if (!salt) {
    return;
  }

  inMemoryKeyStore.userSalt = salt;
}

/**
 * Derives an encryption key from a user's master password
 * Zero-knowledge approach: This happens ONLY on the client, the key is NEVER sent to the server
 * @param password The user's master password
 * @param salt Optional salt, will be randomly generated if not provided
 * @returns An object containing the derived key and salt used
 */
export async function deriveKeyFromPassword(password: string, salt?: Uint8Array): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const subtle = getCryptoSubtle();

  const encoder = new TextEncoder();
  const saltBuffer = salt || globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  // Import the password as a key
  const passwordKey = await subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive a key using PBKDF2 with strong security parameters
  const key = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ITERATIONS, // 100,000 iterations for security
      hash: 'SHA-256'
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  return { key, salt: saltBuffer };
}

/**
** Encrypts data using the provided key
**/
export async function encrypt(data: string, key: CryptoKey): Promise<{ encrypted: string; iv: Uint8Array; }> {
  const subtle = getCryptoSubtle();
  const encoder = new TextEncoder();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encryptedBuffer = await subtle.encrypt(
    {
      name: ALGORITHM,
      iv
    },
    key,
    encoder.encode(data)
  );

  // Convert to base64 for storage
  const encrypted = arrayBufferToBase64(encryptedBuffer);

  return { encrypted, iv };
}

/**
 * Decrypts data using the provided key
 */
export async function decrypt(encryptedData: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
  // Validate encrypted data before attempting decryption
  if (!encryptedData || encryptedData.length < 10) {
    throw new Error('Invalid encrypted data: data is empty or too short');
  }

  try {
    const subtle = getCryptoSubtle();
    const encryptedBuffer = base64ToArrayBuffer(encryptedData);

    // Check if buffer is valid and has minimum size
    if (encryptedBuffer.byteLength < 16) {
      throw new Error('Invalid encrypted data: buffer too small');
    }

    const decryptedBuffer = await subtle.decrypt(
      {
        name: ALGORITHM,
        iv
      },
      key,
      encryptedBuffer
    );

    const decoder = new TextDecoder();
    const result = decoder.decode(decryptedBuffer);

    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Encrypts an object with sensitive data
 */
export async function encryptObject<T extends Record<string, any>>(
  obj: T,
  key: CryptoKey,
  fieldsToEncrypt: readonly (keyof T)[]
): Promise<{ encryptedObj: T; encryptionData: Record<string, { iv: string; salt: string }> }> {
  const encryptedObj = { ...obj };
  const encryptionData: Record<string, { iv: string; salt: string }> = {};

  for (const field of fieldsToEncrypt) {
    if (typeof obj[field] === 'string') {
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      const { key: derivedKey } = await deriveKeyFromPassword(await exportCryptoKey(key), salt);
      const { encrypted, iv } = await encrypt(obj[field] as string, derivedKey);

      encryptedObj[field] = encrypted as any;
      encryptionData[field as string] = {
        iv: arrayBufferToBase64(iv.buffer),
        salt: arrayBufferToBase64(salt.buffer)
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
  key: CryptoKey,
  fieldsToDecrypt: readonly (keyof T)[],
  encryptionData: Record<string, { iv: string; salt: string }>
): Promise<T> {
  const decryptedObj = { ...obj };

  // Validate inputs
  if (!key) {
    return obj; // Return original if no key
  }

  if (!encryptionData) {
    return obj; // Return original if no encryption data
  }

  // Process each field to decrypt
  for (const field of fieldsToDecrypt) {
    const fieldName = field as string;

    // Skip if the field doesn't exist in the object
    if (!(fieldName in obj)) {
      continue;
    }

    // Skip if the field doesn't have encryption data
    if (!encryptionData[fieldName]) {
      continue;
    }

    try {
      // Get encryption metadata for this field
      const { iv, salt } = encryptionData[fieldName];

      if (!iv || !salt) {
        continue;
      }

      // Convert IV and salt from base64 to Uint8Array
      const ivArray = new Uint8Array(base64ToArrayBuffer(iv));
      const saltArray = new Uint8Array(base64ToArrayBuffer(salt));

      // Derive a key for this specific field
      const { key: derivedKey } = await deriveKeyFromPassword(await exportCryptoKey(key), saltArray);

      let decryptedValue: string;
      let success = false;

      try {
        // First attempt - standard decryption
        decryptedValue = await decrypt(obj[fieldName] as string, derivedKey, ivArray);
        success = true;
      } catch (decryptError) {
        // Second attempt - try with a slight delay (sometimes helps with timing issues)
        try {
          await new Promise(resolve => setTimeout(resolve, 100));
          decryptedValue = await decrypt(obj[fieldName] as string, derivedKey, ivArray);
          success = true;
        } catch (retryError) {
          // If both attempts fail, keep the original value (likely unencrypted legacy data)
          decryptedValue = obj[fieldName] as string;
          success = false;
        }
      }

      // Update the object with the decrypted value
      if (success) {
        // Use type assertion to safely update the object
        (decryptedObj as any)[fieldName] = decryptedValue;
      } else {
        // If decryption failed, check if the decrypted value is empty or invalid
        if (decryptedValue && decryptedValue.length > 0) {
          (decryptedObj as any)[fieldName] = decryptedValue;
        }
      }
    } catch (error) {
      // Keep the original value on error
    }
  }

  return decryptedObj;
}

/**
 * Generates a secure encryption key for the user
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  const subtle = getCryptoSubtle();
  return subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a CryptoKey to a string format
 */
export async function exportCryptoKey(key: CryptoKey): Promise<string> {
  const subtle = getCryptoSubtle();
  const exported = await subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Imports a string as a CryptoKey
 */
export async function importCryptoKey(keyData: string): Promise<CryptoKey> {
  try {
    // Try to decode as hex first
    let keyBuffer: ArrayBuffer;
    if (/^[0-9a-fA-F]+$/.test(keyData)) {
      // Convert hex to array buffer
      const keyArray = new Uint8Array(keyData.length / 2);
      for (let i = 0; i < keyData.length; i += 2) {
        keyArray[i/2] = parseInt(keyData.substr(i, 2), 16);
      }
      keyBuffer = keyArray.buffer;
    } else {
      // Try base64 decode
      keyBuffer = base64ToArrayBuffer(keyData);
    }

    // Validate key length
    if (keyBuffer.byteLength !== 32) { // 256 bits = 32 bytes
      throw new Error(`Invalid key length: ${keyBuffer.byteLength} bytes`);
    }

    const subtle = getCryptoSubtle();
    return subtle.importKey(
      'raw',
      keyBuffer,
      {
        name: ALGORITHM,
        length: KEY_LENGTH
      },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    throw error;
  }

}
/**
 * Encrypts the user's encryption key with their master password
 * for secure storage
 */
export async function encryptEncryptionKey(encryptionKey: CryptoKey, masterPassword: string): Promise<string> {
  const exportedKey = await exportCryptoKey(encryptionKey);
  const { key, salt } = await deriveKeyFromPassword(masterPassword);
  const { encrypted, iv } = await encrypt(exportedKey, key);

  // Format: encrypted:iv:salt
  // Ensure we're passing proper ArrayBuffer objects to arrayBufferToBase64
  const ivArrayBuffer = iv.buffer;
  const saltArrayBuffer = salt.buffer;
  return `${encrypted}:${arrayBufferToBase64(ivArrayBuffer)}:${arrayBufferToBase64(saltArrayBuffer)}`;
}

/**
 * Decrypts the user's encryption key using their master password
 */
export async function decryptEncryptionKey(encryptedKey: string, masterPassword: string): Promise<CryptoKey> {
  // Format: encryptedKey:iv:salt:authTag
  const [encrypted, ivBase64, saltBase64, authTagBase64] = encryptedKey.split(':');
  const ivBuffer = base64ToArrayBuffer(ivBase64);
  const saltBuffer = base64ToArrayBuffer(saltBase64);
  const iv = new Uint8Array(ivBuffer);
  const salt = new Uint8Array(saltBuffer);

  try {
    // For server-generated keys with authTag
    if (authTagBase64) {
      // Derive key from master password
      const { key: derivedKey } = await deriveKeyFromPassword(
        masterPassword,
        salt
      );

      // Extract auth tag
      const authTagBuffer = base64ToArrayBuffer(authTagBase64);
      const authTag = new Uint8Array(authTagBuffer);

      // Decrypt the encryption key using AES-GCM
      const encryptedBuffer = base64ToArrayBuffer(encrypted);

      // Create a combined buffer with encrypted data and auth tag
      const encryptedWithAuthTag = new Uint8Array(encryptedBuffer.byteLength + authTag.byteLength);
      encryptedWithAuthTag.set(new Uint8Array(encryptedBuffer), 0);
      encryptedWithAuthTag.set(authTag, encryptedBuffer.byteLength);

      // Decrypt using the derived key
      const decryptedKeyData = await decrypt(
        arrayBufferToBase64(encryptedWithAuthTag.buffer),
        derivedKey,
        iv
      );

      return importCryptoKey(decryptedKeyData);
    } else {
      // Legacy format for client-generated keys
      const { key: derivedKey } = await deriveKeyFromPassword(
        masterPassword,
        salt
      );
      const decryptedKeyData = await decrypt(
        encrypted,
        derivedKey,
        iv
      );

      return importCryptoKey(decryptedKeyData);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to decrypt encryption key: ${errorMessage}`);
  }
}

/**
 * Stores the encryption key securely in memory (no localStorage/sessionStorage)
 */
export async function storeEncryptionKey(key: CryptoKey): Promise<void> {
  try {
    // Export the key to a string format
    const keyString = await exportCryptoKey(key);

    // Store in memory only
    inMemoryKeyStore.encryptionKey = keyString;

    // Use the current timestamp as a form of versioning
    const timestamp = new Date().toISOString();
    inMemoryKeyStore.encryptionKeyTimestamp = timestamp;

    return;
  } catch (error) {
    throw error;
  }
}

/**
 * Direct utility function to store raw encryption key string in memory
 * This is a simpler approach that doesn't require async operations
 */
export function storeRawEncryptionKey(rawKey: string): boolean {
  try {
    // Store in memory only
    inMemoryKeyStore.encryptionKey = rawKey;

    // Store timestamp
    const timestamp = Date.now().toString();
    inMemoryKeyStore.encryptionKeyTimestamp = timestamp;

    // Verify storage worked
    const verifySuccess = inMemoryKeyStore.encryptionKey === rawKey;

    return verifySuccess;
  } catch (error) {
    return false;
  }
}

/**
 * Retrieves the encryption key from memory
 */
export async function retrieveEncryptionKey(): Promise<CryptoKey | null> {
  try {
    // Check if we have a key in memory
    const storedKey = inMemoryKeyStore.encryptionKey;

    if (!storedKey) {
      return null;
    }

    // If we found a key, try to import it
    try {
      const key = await importCryptoKey(storedKey);
      return key;
    } catch (error) {
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Ensures that an encryption key is available in memory using zero-knowledge approach
 * The key is derived from the master password and salt - NEVER retrieved from server
 * @param vaultPassword The master password to derive the key from
 */
export async function ensureEncryptionKeyAvailable(vaultPassword?: string): Promise<boolean> {
  try {
    // First, check if we already have a valid encryption key in memory
    if (inMemoryKeyStore.encryptionKey) {
      return true;
    }

    // No key in memory, need vault password to proceed
    if (!vaultPassword) {
      return false;
    }

    // Get the user salt from memory
    const userSalt = inMemoryKeyStore.userSalt;

    // If no salt available, we can't proceed
    if (!userSalt) {
      return false;
    }

    try {
      // Convert the base64 salt to Uint8Array
      const saltBuffer = base64ToArrayBuffer(userSalt);

      // Derive the master key from the password and salt
      const { key: masterKey } = await deriveKeyFromPassword(vaultPassword, new Uint8Array(saltBuffer));

      // Store the derived key in memory
      const exportedKey = await exportCryptoKey(masterKey);
      inMemoryKeyStore.encryptionKey = exportedKey;

      // Set timestamp
      const timestamp = Date.now().toString();
      inMemoryKeyStore.encryptionKeyTimestamp = timestamp;

      return true;
    } catch (error) {
      return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Clears the encryption key from memory
 */
export function clearEncryptionKey(): void {
  // Clear the encryption key from memory
  inMemoryKeyStore.encryptionKey = null;
  inMemoryKeyStore.encryptionKeyTimestamp = null;
}

/**
 * Clears the vault key from memory
 */
export function clearVaultKey(): void {
  inMemoryKeyStore.encryptionKey = null;
}

/**
 * Debug function to check the state of in-memory key storage
 * and log detailed information about the encryption key
 */
export function debugStorageState(): Record<string, any> {
  if (process.env.NODE_ENV === 'production') {
    return {};
  }
  try {
    const result: Record<string, any> = {};

    // Check in-memory store
    result['memory.encryptionKey'] = {
      exists: !!inMemoryKeyStore.encryptionKey,
      length: inMemoryKeyStore.encryptionKey?.length || 0,
      isEmpty: inMemoryKeyStore.encryptionKey === '',
    };

    result['memory.userSalt'] = {
      exists: !!inMemoryKeyStore.userSalt,
      length: inMemoryKeyStore.userSalt?.length || 0,
      isEmpty: inMemoryKeyStore.userSalt === '',
    };

    // Check timestamp
    result['memory.timestamp'] = inMemoryKeyStore.encryptionKeyTimestamp;

    // Check if we have any valid encryption key
    const hasEncryptionKey = !!inMemoryKeyStore.encryptionKey &&
                             inMemoryKeyStore.encryptionKey.length > 10;

    result['hasEncryptionKey'] = hasEncryptionKey;

    return result;
  } catch (error) {
    return {};
  }
}


/**
 * Converts an ArrayBuffer or ArrayBufferLike to base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    // Ensure the string is properly padded for base64
    let paddedBase64 = base64;
    while (paddedBase64.length % 4 !== 0) {
      paddedBase64 += '=';
    }

    // Replace any URL-safe characters with standard base64 characters
    paddedBase64 = paddedBase64.replace(/-/g, '+').replace(/_/g, '/');

    // Try to decode
    const binaryString = atob(paddedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    // Return an empty buffer rather than throwing
    return new ArrayBuffer(0);
  }
}

/**
 * Get the current encryption key from memory
 * @returns The CryptoKey if available, null otherwise
 */
export async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (!inMemoryKeyStore.encryptionKey) {
    return null;
  }

  try {
    // Import the stored key back to CryptoKey format
    const keyData = base64ToArrayBuffer(inMemoryKeyStore.encryptionKey);
    const subtle = getCryptoSubtle();
    const key = await subtle.importKey(
      'raw',
      keyData,
      { name: ALGORITHM, length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    return key;
  } catch (error) {
    return null;
  }
}

/**
 * Creates a VaultCheck by encrypting the user's email with the vault password
 * This serves as a password verification mechanism without storing the password hash
 * @param email User's email to encrypt
 * @param vaultPassword The vault password to use for encryption
 * @returns Object containing encrypted email and IV (both base64 encoded)
 */
export async function createVaultCheck(email: string, vaultPassword: string): Promise<{ encryptedEmail: string; iv: string }> {
  try {
    // Derive key from vault password using the persisted vault salt when available.
    // This ensures deterministic key derivation for later verification.
    let vaultKey: CryptoKey;
    const userSalt = inMemoryKeyStore.userSalt;
    if (userSalt) {
      const saltBuffer = base64ToArrayBuffer(userSalt);
      const { key } = await deriveKeyFromPassword(vaultPassword, new Uint8Array(saltBuffer));
      vaultKey = key;
    } else {
      // Fallback for older flows: if no salt is available in memory, use ad-hoc derivation.
      const { key } = await deriveKeyFromPassword(vaultPassword);
      vaultKey = key;
    }

    // Encrypt the email
    const { encrypted, iv } = await encrypt(email, vaultKey);

    return {
      encryptedEmail: encrypted,
      iv: arrayBufferToBase64(iv.buffer)
    };
  } catch (error) {
    throw new Error('Failed to create vault check');
  }
}

/**
 * Verifies a vault password by decrypting the VaultCheck and comparing with stored email
 * @param encryptedEmail The encrypted email (VaultCheck) from database
 * @param ivBase64 The IV used for encryption (base64 encoded)
 * @param vaultPassword The password to verify
 * @param storedEmail The email stored in the database to compare against
 * @returns true if password is correct (decrypted email matches stored email), false otherwise
 */
export async function verifyVaultPassword(
  encryptedEmail: string,
  ivBase64: string,
  vaultPassword: string,
  storedEmail: string
): Promise<boolean> {
  try {
    // Derive key from vault password using persisted vault salt when available.
    // This must match the salt used when creating VaultCheck.
    let vaultKey: CryptoKey;
    const userSalt = inMemoryKeyStore.userSalt;
    if (userSalt) {
      const saltBuffer = base64ToArrayBuffer(userSalt);
      const { key } = await deriveKeyFromPassword(vaultPassword, new Uint8Array(saltBuffer));
      vaultKey = key;
    } else {
      const { key } = await deriveKeyFromPassword(vaultPassword);
      vaultKey = key;
    }

    // Convert IV from base64
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));

    // Attempt to decrypt
    const decryptedEmail = await decrypt(encryptedEmail, vaultKey, iv);

    // Compare with stored email
    const isValid = decryptedEmail === storedEmail;

    return isValid;
  } catch (error) {
    // Decryption failure means wrong password
    return false;
  }
}
