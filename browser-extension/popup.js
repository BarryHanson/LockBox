/**
 * ByteLock Browser Extension - Popup Script
 * Handles login, vault unlock, password listing, and autofill from popup.
 */

const SERVER_URL = 'https://bytelock.tech';

function debug(...args) {
  console.log('[ByteLock Popup]', ...args);
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const screens = {
  loading:     document.getElementById('loading-screen'),
  login:       document.getElementById('login-screen'),
  twofa:       document.getElementById('twofa-screen'),
  vault:       document.getElementById('vault-screen'),
  permissions: document.getElementById('permissions-screen'),
  main:        document.getElementById('main-screen'),
  'new-pw':    document.getElementById('new-pw-screen'),
};

const loginForm = document.getElementById('login-form');
const twofaForm = document.getElementById('twofa-form');
const vaultForm = document.getElementById('vault-form');
const searchInput = document.getElementById('search-input');
const passwordList = document.getElementById('password-list');
const noMatches = document.getElementById('no-matches');
const siteTitle = document.getElementById('site-title');
const matchCount = document.getElementById('match-count');

let twoFAState = {}; // { method }
let allPasswords = [];
let currentTabUrl = '';

// ── Screen management ──────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.hidden = false;
  }
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.hidden = true;
}

function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  if (text) text.hidden = loading;
  if (spinner) spinner.hidden = !loading;
  btn.disabled = loading;
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {  debug('Initializing popup...');  showScreen('loading');

  // Get current tab URL
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab?.url || '';
  } catch {
    currentTabUrl = '';
  }

  // Check auth + vault status
  const status = await sendMessage({ type: 'GET_STATUS' });
  debug('Status:', status);

  if (!status || !status.isLoggedIn) {
    debug('Not logged in, showing login screen');
    showScreen('login');
    return;
  }

  if (!status.isVaultUnlocked) {
    debug('Vault locked, showing vault screen');
    showScreen('vault');
    return;
  }

  if (!status.hasHostPermissions) {
    debug('Host permissions not granted, showing permissions screen');
    showScreen('permissions');
    return;
  }

  debug('Vault unlocked, showing main screen');
  await showMainScreen();
}

// ── Main screen ────────────────────────────────────────────────────────────
async function showMainScreen() {
  showScreen('main');

  // Set site title
  let hostname = '';
  try {
    hostname = new URL(currentTabUrl).hostname;
  } catch {
    hostname = 'Unknown site';
  }
  siteTitle.textContent = hostname || 'Current Site';

  // Fetch matching passwords
  const result = await sendMessage({
    type: 'GET_PASSWORDS_FOR_URL',
    url: currentTabUrl,
  });

  const matches = result?.passwords || [];
  matchCount.textContent = matches.length;

  renderPasswordList(passwordList, matches, true);
  if (matches.length === 0) {
    noMatches.hidden = false;
  } else {
    noMatches.hidden = true;
  }

  // Reset to "This Site" tab
  document.getElementById('tab-site').classList.add('active');
  document.getElementById('tab-all').classList.remove('active');
  document.getElementById('view-site').hidden = false;
  document.getElementById('view-all').hidden = true;
  allPasswords = [];
}

function renderPasswordList(container, passwords, showAutofill) {
  // Keep the empty state element if present
  const emptyState = container.querySelector('.empty-state');
  container.innerHTML = '';
  if (emptyState && passwords.length === 0) {
    container.appendChild(emptyState);
    return;
  }

  const lockSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

  passwords.forEach((pw) => {
    const card = document.createElement('div');
    card.className = 'pw-card';

    // Build avatar with proper event listener (no inline handlers)
    const avatar = document.createElement('div');
    avatar.className = 'pw-card-avatar';
    let domain = '';
    try { domain = pw.url ? new URL(pw.url).hostname : ''; } catch { domain = ''; }
    if (domain) {
      const img = document.createElement('img');
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
      img.width = 20;
      img.height = 20;
      img.alt = '';
      const fallback = document.createElement('span');
      fallback.innerHTML = lockSvg;
      fallback.hidden = true;
      img.addEventListener('error', () => { img.hidden = true; fallback.hidden = false; });
      avatar.appendChild(img);
      avatar.appendChild(fallback);
    } else {
      avatar.innerHTML = lockSvg;
    }

    card.appendChild(avatar);
    const rest = document.createElement('div');
    rest.style.display = 'contents';
    rest.innerHTML = `
      <div class="pw-card-info">
        <div class="pw-card-title">${escapeHtml(pw.title || 'Untitled')}</div>
        <div class="pw-card-user">${escapeHtml(pw.username || '')}</div>
      </div>
      <div class="pw-card-actions">
        ${showAutofill ? `
          <button class="icon-btn autofill-btn" title="Autofill on page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        ` : ''}
        <button class="icon-btn copy-user-btn" title="Copy username">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
          </svg>
        </button>
        <button class="icon-btn copy-pw-btn" title="Copy password">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </button>
      </div>
    `;
    card.appendChild(rest);

    // Autofill: send to content script
    const autofillBtn = card.querySelector('.autofill-btn');
    if (autofillBtn) {
      autofillBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'AUTOFILL',
            username: pw.username,
            password: pw.password,
          });
          window.close();
        }
      });
    }

    // Copy username
    card.querySelector('.copy-user-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(pw.username || '');
      showToast('Username copied');
    });

    // Copy password
    card.querySelector('.copy-pw-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(pw.password || '');
      showToast('Password copied');
    });

    container.appendChild(card);
  });
}

// ── Login form ─────────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('login-error');
  setButtonLoading('login-btn', true);

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    debug('Logging in as', email);

    const result = await sendMessage({
      type: 'LOGIN',
      email,
      password,
    });

    debug('Login result:', result);
    if (result?.error) throw new Error(result.error);

    if (result?.requires2FA) {
      twoFAState = {
        method: result.method,
      };
      showScreen('twofa');
      return;
    }

    // Login successful, go to vault unlock
    showScreen('vault');
  } catch (err) {
    showError('login-error', err.message);
  } finally {
    setButtonLoading('login-btn', false);
  }
});

// ── 2FA form ───────────────────────────────────────────────────────────────
twofaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('twofa-error');
  setButtonLoading('twofa-btn', true);

  const code = document.getElementById('twofa-code').value;

  try {
    const result = await sendMessage({
      type: 'VERIFY_2FA',
      code,
    });

    if (result?.error) throw new Error(result.error);

    showScreen('vault');
  } catch (err) {
    showError('twofa-error', err.message);
  } finally {
    setButtonLoading('twofa-btn', false);
  }
});

// ── Vault form ─────────────────────────────────────────────────────────────
vaultForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('vault-error');
  setButtonLoading('vault-btn', true);

  const vaultPassword = document.getElementById('vault-password').value;

  try {
    const result = await sendMessage({
      type: 'UNLOCK_VAULT',
      vaultPassword,
    });

    if (result?.error) throw new Error(result.error);

    // Check if host permissions have been granted yet
    const permStatus = await sendMessage({ type: 'CHECK_HOST_PERMISSIONS' });
    if (!permStatus?.hasPermissions) {
      showScreen('permissions');
      return;
    }

    await showMainScreen();
  } catch (err) {
    showError('vault-error', err.message);
  } finally {
    setButtonLoading('vault-btn', false);
  }
});

// ── Grant host permissions ─────────────────────────────────────────────────
document.getElementById('grant-permissions-btn').addEventListener('click', () => {
  hideError('permissions-error');
  setButtonLoading('grant-permissions-btn', true);

  chrome.permissions.request(
    { origins: ['https://*/*', 'http://*/*'] },
    async (granted) => {
      setButtonLoading('grant-permissions-btn', false);
      if (granted) {
        await showMainScreen();
      } else {
        showError('permissions-error', 'Access not granted. Autofill will not work without this permission.');
      }
    }
  );
});

// ── Lock / Logout ──────────────────────────────────────────────────────────
document.getElementById('lock-btn').addEventListener('click', async () => {
  await sendMessage({ type: 'LOCK_VAULT' });
  showScreen('vault');
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await sendMessage({ type: 'LOGOUT' });
  showScreen('login');
});

// ── Add password button ─────────────────────────────────────────────────────
document.getElementById('add-pw-btn').addEventListener('click', () => {
  showScreen('new-pw');
});

// ── New password back button ────────────────────────────────────────────────
document.getElementById('new-pw-back').addEventListener('click', () => {
  showScreen('main');
});

// ── Show/hide password toggle ───────────────────────────────────────────────
document.getElementById('np-pw-toggle').addEventListener('click', () => {
  const input = document.getElementById('np-password');
  const eyeShow = document.querySelector('#np-pw-toggle .eye-show');
  const eyeHide = document.querySelector('#np-pw-toggle .eye-hide');
  if (input.type === 'password') {
    input.type = 'text';
    eyeShow.hidden = true;
    eyeHide.hidden = false;
  } else {
    input.type = 'password';
    eyeShow.hidden = false;
    eyeHide.hidden = true;
  }
});

// ── New password form ───────────────────────────────────────────────────────
document.getElementById('new-pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('new-pw-error');
  setButtonLoading('new-pw-btn', true);

  const title    = document.getElementById('np-title').value;
  const url      = document.getElementById('np-url').value;
  const username = document.getElementById('np-username').value;
  const password = document.getElementById('np-password').value;

  try {
    const result = await sendMessage({
      type: 'SAVE_PASSWORD',
      title,
      url,
      username,
      password,
    });
    if (result?.error) throw new Error(result.error);

    // Reset form and go back
    e.target.reset();
    document.getElementById('np-password').type = 'password';
    document.querySelector('#np-pw-toggle .eye-show').hidden = false;
    document.querySelector('#np-pw-toggle .eye-hide').hidden = true;
    showScreen('main');
    await showMainScreen();
  } catch (err) {
    showError('new-pw-error', err.message);
  } finally {
    setButtonLoading('new-pw-btn', false);
  }
});

// ── View tabs ───────────────────────────────────────────────────────────────
const tabSite = document.getElementById('tab-site');
const tabAll  = document.getElementById('tab-all');
const viewSite = document.getElementById('view-site');
const viewAll  = document.getElementById('view-all');
const allPasswordsList = document.getElementById('all-passwords-list');

tabSite.addEventListener('click', () => {
  tabSite.classList.add('active');
  tabAll.classList.remove('active');
  viewSite.hidden = false;
  viewAll.hidden = true;
});

tabAll.addEventListener('click', async () => {
  tabAll.classList.add('active');
  tabSite.classList.remove('active');
  viewSite.hidden = true;
  viewAll.hidden = false;

  if (allPasswords.length === 0) {
    const result = await sendMessage({ type: 'REFRESH_PASSWORDS' });
    allPasswords = result?.passwords || [];
  }
  renderPasswordList(allPasswordsList, allPasswords, false);
});

// ── Search ─────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allPasswords.filter(
    (pw) =>
      (pw.title || '').toLowerCase().includes(query) ||
      (pw.username || '').toLowerCase().includes(query) ||
      (pw.url || '').toLowerCase().includes(query)
  );
  renderPasswordList(allPasswordsList, filtered, false);
});

// ── Content script autofill listener ───────────────────────────────────────
// Handle autofill message in content script
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AUTOFILL') {
      // This is handled by content.js, not popup
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function showToast(text) {
  const existing = document.querySelector('.copied-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'copied-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
