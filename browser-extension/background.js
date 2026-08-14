/**
 * ByteLock Browser Extension - Background Service Worker
 * Manages auth state, vault key, and coordinates between popup/content scripts.
 */

import {
  deriveKeyFromPassword,
  exportCryptoKey,
  importCryptoKey,
  base64ToArrayBuffer,
  decryptField,
  encryptField,
} from './crypto.js';

// ── Constants ──────────────────────────────────────────────────────────────
const SERVER_URL = 'https://bytelock.tech';
const CACHE_TTL = 60_000; // 1 minute

// ── Debug logging ──────────────────────────────────────────────────────────
function debug(...args) {
  console.log('[ByteLock]', ...args);
}

// ── State ──────────────────────────────────────────────────────────────────
let authToken = null;
let serverUrl = SERVER_URL;
let encryptionKeyBase64 = null; // exported CryptoKey stored as base64
let cachedPasswords = null;
let cachedPasswordsTimestamp = 0;
let pendingAuth = null; // { email, password } stored during 2FA flow
let pendingAuthTimer = null; // auto-clears pendingAuth after 10 minutes

function setPendingAuth(value) {
  if (pendingAuthTimer) clearTimeout(pendingAuthTimer);
  pendingAuth = value;
  if (value) {
    pendingAuthTimer = setTimeout(() => {
      pendingAuth = null;
      pendingAuthTimer = null;
      debug('pendingAuth cleared after timeout');
    }, 10 * 60 * 1000);
  }
}

// ── Storage helpers ────────────────────────────────────────────────────────
async function loadState() {
  const data = await chrome.storage.local.get(['authToken', 'encryptionKey']);
  authToken = data.authToken || null;
  serverUrl = SERVER_URL;
  encryptionKeyBase64 = data.encryptionKey || null;
  debug('State loaded', { hasToken: !!authToken, hasKey: !!encryptionKeyBase64, serverUrl });
}

async function saveState() {
  await chrome.storage.local.set({
    authToken: authToken,
    encryptionKey: encryptionKeyBase64,
  });
  debug('State saved', { hasToken: !!authToken, hasKey: !!encryptionKeyBase64 });
}

async function clearState() {
  authToken = null;
  serverUrl = SERVER_URL;
  encryptionKeyBase64 = null;
  cachedPasswords = null;
  cachedPasswordsTimestamp = 0;
  await chrome.storage.local.remove(['authToken', 'encryptionKey']);
  debug('State cleared');
}

// ── API helpers ────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  if (!serverUrl || !authToken) throw new Error('Not authenticated');

  const url = `${serverUrl}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'X-Client-Type': 'extension',
    ...(options.headers || {}),
  };

  debug(`API ${options.method || 'GET'} ${path}`);
  const res = await fetch(url, { ...options, headers });
  debug(`API ${path} → ${res.status}`);
  if (res.status === 401) {
    debug('Token expired, clearing state');
    await clearState();
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}

// ── Auth ───────────────────────────────────────────────────────────────────
async function login(email, password) {
  debug('Login attempt for', email);
  const url = `${SERVER_URL}/api/auth/login`;
  debug('POST', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Type': 'extension',
    },
    body: JSON.stringify({ email, password, clientType: 'extension' }),
  });

  const data = await res.json();
  debug('Login response', res.status, data);
  if (!res.ok) throw new Error(data.error || 'Login failed');

  // Check for 2FA requirement
  if (data.requiresTwoFactor) {
    debug('2FA required, method:', data.method);
    setPendingAuth({ email, password });
    serverUrl = SERVER_URL;
    await saveState();
    return { requires2FA: true, method: data.method };
  }

  authToken = data.token;
  setPendingAuth(null);
  serverUrl = SERVER_URL;
  await saveState();
  debug('Login successful');
  return { success: true };
}

async function verify2FA(code) {
  if (!pendingAuth) throw new Error('No pending login. Please log in again.');
  debug('2FA verify, re-submitting login with code');

  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Type': 'extension',
    },
    body: JSON.stringify({
      email: pendingAuth.email,
      password: pendingAuth.password,
      totpCode: code,
      clientType: 'extension',
    }),
  });

  const data = await res.json();
  debug('2FA response', res.status, data);
  if (!res.ok) throw new Error(data.error || '2FA verification failed');

  authToken = data.token;
  setPendingAuth(null);
  serverUrl = SERVER_URL;
  await saveState();
  debug('2FA verified successfully');
  return { success: true };
}

// ── Vault ──────────────────────────────────────────────────────────────────
async function unlockVault(vaultPassword) {
  debug('Unlocking vault...');

  // Step 1: Verify vault password with server
  debug('Step 1: POST /api/vault/unlock');
  let unlockRes;
  try {
    unlockRes = await apiFetch('/api/vault/unlock', {
      method: 'POST',
      body: JSON.stringify({ vaultPassword }),
    });
  } catch (err) {
    debug('Vault unlock fetch error:', err.message);
    throw err;
  }
  debug('Vault unlock status:', unlockRes.status);

  if (!unlockRes.ok) {
    let errData;
    try { errData = await unlockRes.json(); } catch { errData = {}; }
    debug('Vault unlock failed:', unlockRes.status, errData);
    throw new Error(errData.error || `Vault unlock failed (HTTP ${unlockRes.status})`);
  }
  debug('Vault password verified');

  // Step 2: Get stored salt for key derivation
  debug('Step 2: GET /api/vault/retrieve');
  let retrieveRes;
  try {
    retrieveRes = await apiFetch('/api/vault/retrieve');
  } catch (err) {
    debug('Vault retrieve fetch error:', err.message);
    throw err;
  }
  debug('Vault retrieve status:', retrieveRes.status);

  if (!retrieveRes.ok) {
    let errData;
    try { errData = await retrieveRes.json(); } catch { errData = {}; }
    debug('Vault retrieve failed:', retrieveRes.status, errData);
    throw new Error(errData.error || `Failed to retrieve vault settings (HTTP ${retrieveRes.status})`);
  }

  const vaultData = await retrieveRes.json();
  debug('Vault data received, keySalt present:', !!vaultData.keySalt);

  if (!vaultData.keySalt) {
    throw new Error('Vault not set up. Please configure your vault on the website first.');
  }

  const salt = new Uint8Array(base64ToArrayBuffer(vaultData.keySalt));

  // Step 3: Derive encryption key client-side (zero-knowledge)
  debug('Step 3: Deriving encryption key from password + salt...');
  const { key } = await deriveKeyFromPassword(vaultPassword, salt);
  encryptionKeyBase64 = await exportCryptoKey(key);
  await saveState();
  debug('Encryption key derived and saved');

  // Step 4: Pre-fetch passwords
  debug('Step 4: Pre-fetching passwords...');
  await fetchPasswords(true);

  debug('Vault unlocked, passwords loaded:', cachedPasswords?.length || 0);
  return { success: true };
}

async function lockVault() {
  encryptionKeyBase64 = null;
  cachedPasswords = null;
  cachedPasswordsTimestamp = 0;
  await chrome.storage.local.remove(['encryptionKey']);
}

// ── Passwords ──────────────────────────────────────────────────────────────
async function fetchPasswords(force = false) {
  if (!force && cachedPasswords && Date.now() - cachedPasswordsTimestamp < CACHE_TTL) {
    debug('Using cached passwords', cachedPasswords.length);
    return cachedPasswords;
  }

  debug('Fetching passwords from server...');
  const res = await apiFetch('/api/passwords');
  debug('Passwords fetch status:', res.status);
  if (!res.ok) {
    let errData;
    try { errData = await res.json(); } catch { errData = {}; }
    debug('Passwords fetch failed:', res.status, errData);
    throw new Error(errData.error || `Failed to fetch passwords (HTTP ${res.status})`);
  }

  const rawPasswords = await res.json();

  if (!encryptionKeyBase64) {
    // Can't decrypt — return raw (titles/URLs are plaintext)
    cachedPasswords = rawPasswords;
    cachedPasswordsTimestamp = Date.now();
    return cachedPasswords;
  }

  const key = await importCryptoKey(encryptionKeyBase64);

  // Decrypt sensitive fields
  const decrypted = await Promise.all(
    rawPasswords.map(async (pw) => {
      const meta = pw.encryptionData || {};
      return {
        id: pw.id,
        title: pw.title,
        url: pw.url || '',
        username: await decryptField(pw.username, key, meta.username),
        password: await decryptField(pw.password, key, meta.password),
        notes: pw.notes ? await decryptField(pw.notes, key, meta.notes) : '',
      };
    })
  );

  cachedPasswords = decrypted;
  cachedPasswordsTimestamp = Date.now();
  debug('Decoded', decrypted.length, 'passwords');
  return cachedPasswords;
}

function getMatchingPasswords(url) {
  if (!cachedPasswords || !url) return [];

  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return [];
  }

  // Strip leading "www."
  const normalizedHost = hostname.replace(/^www\./, '');

  return cachedPasswords.filter((pw) => {
    if (!pw.url) return false;
    try {
      const pwHost = new URL(pw.url).hostname.toLowerCase().replace(/^www\./, '');
      // Match if the domains share the same root (e.g. accounts.google.com matches google.com)
      return normalizedHost === pwHost || normalizedHost.endsWith('.' + pwHost) || pwHost.endsWith('.' + normalizedHost);
    } catch {
      // Fallback: simple string match on title or url
      return pw.url.toLowerCase().includes(normalizedHost) || pw.title.toLowerCase().includes(normalizedHost);
    }
  });
}

async function savePassword(title, username, password, url) {
  debug('Saving password for', title, url);
  if (!encryptionKeyBase64) throw new Error('Vault is locked');

  const key = await importCryptoKey(encryptionKeyBase64);

  // Encrypt sensitive fields using per-field salt (matches main app's encryptObject)
  const encUsername = await encryptField(username, key);
  const encPassword = await encryptField(password, key);

  const encryptionData = {
    username: encUsername.meta,
    password: encPassword.meta,
  };

  // Calculate basic strength
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/\d/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;
  const strengthPct = Math.round((strength / 6) * 100);

  const res = await apiFetch('/api/passwords', {
    method: 'POST',
    body: JSON.stringify({
      title,
      username: encUsername.encrypted,
      password: encPassword.encrypted,
      url,
      notes: '',
      strength: strengthPct,
      encryptionData,
    }),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to save password');
  }

  // Refresh cache
  await fetchPasswords(true);
  return { success: true };
}

// ── Message handler ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg, sender) {
  await loadState();

  switch (msg.type) {
    case 'GET_STATUS':
      return {
        isLoggedIn: !!authToken,
        isVaultUnlocked: !!encryptionKeyBase64,
        serverUrl: serverUrl,
        hasHostPermissions: await hasHostPermissions(),
      };

    case 'CHECK_HOST_PERMISSIONS':
      return { hasPermissions: await hasHostPermissions() };

    case 'LOGIN':
      return await login(msg.email, msg.password);

    case 'VERIFY_2FA':
      return await verify2FA(msg.code);

    case 'UNLOCK_VAULT':
      return await unlockVault(msg.vaultPassword);

    case 'LOCK_VAULT':
      await lockVault();
      return { success: true };

    case 'LOGOUT':
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch { /* ignore */ }
      await clearState();
      return { success: true };

    case 'GET_PASSWORDS_FOR_URL': {
      if (!encryptionKeyBase64) return { passwords: [], vaultLocked: true };
      if (!cachedPasswords) await fetchPasswords();
      const matches = getMatchingPasswords(msg.url);
      return { passwords: matches };
    }

    case 'SAVE_PASSWORD':
      return await savePassword(msg.title, msg.username, msg.password, msg.url);

    case 'REFRESH_PASSWORDS':
      await fetchPasswords(true);
      return { success: true, passwords: cachedPasswords || [] };

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Tab navigation listener ────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  // Only inject if we are authenticated + vault unlocked
  await loadState();
  if (!authToken || !encryptionKeyBase64) return;

  // Notify content script that the page is ready
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PAGE_LOADED', url: tab.url });
  } catch {
    // Content script may not be loaded yet on some pages (chrome://, etc.)
  }
});

// ── Install handler ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  debug('Extension installed/updated');
  await initContentScripts();
});

// ── Host permissions & dynamic content script registration ─────────────────
async function hasHostPermissions() {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] }, resolve);
  });
}

async function registerContentScripts() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ['bytelock-content'] });
    if (existing.length > 0) {
      debug('Content scripts already registered');
      return;
    }
    await chrome.scripting.registerContentScripts([{
      id: 'bytelock-content',
      matches: ['https://*/*', 'http://*/*'],
      js: ['content.js'],
      css: ['content.css'],
      runAt: 'document_idle',
      allFrames: false,
    }]);
    debug('Content scripts registered dynamically');
  } catch (err) {
    debug('Failed to register content scripts:', err.message);
  }
}

async function unregisterContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['bytelock-content'] });
    debug('Content scripts unregistered');
  } catch {
    // Not registered — that's fine
  }
}

async function initContentScripts() {
  if (await hasHostPermissions()) {
    await registerContentScripts();
  }
}

// Re-register when optional permissions are granted
chrome.permissions.onAdded.addListener(async (permissions) => {
  if (permissions.origins?.length) {
    await registerContentScripts();
  }
});

// Unregister when permissions are removed
chrome.permissions.onRemoved.addListener(async (permissions) => {
  if (permissions.origins?.length) {
    await unregisterContentScripts();
  }
});

// Re-register on service worker startup (permissions may already be granted)
initContentScripts();
