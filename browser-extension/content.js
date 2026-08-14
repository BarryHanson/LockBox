/**
 * ByteLock Browser Extension - Content Script
 * Detects login forms, shows autofill dropdown, and captures new credentials.
 */

(() => {
  // Prevent double-injection
  if (window.__bytelockInjected) return;
  window.__bytelockInjected = true;

  // ── Constants ──────────────────────────────────────────────────────────
  const DROPDOWN_ID = 'bytelock-autofill-dropdown';
  const BANNER_ID = 'bytelock-save-banner';
  const ICON_ID_PREFIX = 'bytelock-field-icon-';
  let activeField = null;
  let matchedPasswords = [];
  let pendingCredentials = null; // { username, password, url, title }
  let dismissedForSession = new Set(); // URLs we've dismissed save prompt for

  // ── Utility: find login form fields ────────────────────────────────────
  function findLoginFields() {
    const allInputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input:not([type])'
    );

    let usernameFields = [];
    let passwordFields = [];

    allInputs.forEach((input) => {
      if (input.offsetParent === null || input.disabled || input.readOnly) return; // hidden/disabled
      if (input.closest('[aria-hidden="true"]')) return;

      const type = (input.type || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const autocomplete = (input.autocomplete || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();

      if (type === 'password') {
        passwordFields.push(input);
        return;
      }

      // Username/email heuristics
      const usernameHints = ['user', 'email', 'login', 'account', 'name', 'identifier', 'phone'];
      const combined = `${name} ${id} ${autocomplete} ${placeholder} ${ariaLabel}`;

      if (
        type === 'email' ||
        autocomplete === 'username' ||
        autocomplete === 'email' ||
        usernameHints.some((hint) => combined.includes(hint))
      ) {
        usernameFields.push(input);
      }
    });

    return { usernameFields, passwordFields };
  }

  // ── Autofill dropdown ──────────────────────────────────────────────────
  function removeDropdown() {
    const existing = document.getElementById(DROPDOWN_ID);
    if (existing) existing.remove();
  }

  function createDropdown(anchorEl, passwords) {
    removeDropdown();
    if (!passwords || passwords.length === 0) return;

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.id = DROPDOWN_ID;
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'ByteLock autofill suggestions');

    // Header
    const header = document.createElement('div');
    header.className = 'bytelock-dropdown-header';
    header.innerHTML = `
      <img src="${chrome.runtime.getURL('icons/icon-32.png')}" width="16" height="16" alt="ByteLock">
      <span>ByteLock</span>
    `;
    dropdown.appendChild(header);

    // Items
    passwords.forEach((pw) => {
      const item = document.createElement('div');
      item.className = 'bytelock-dropdown-item';
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '0');

      const displayName = pw.title || new URL(pw.url || 'https://unknown').hostname;
      const maskedPw = pw.password ? '••••••••' : '';

      item.innerHTML = `
        <div class="bytelock-dropdown-item-title">${escapeHtml(displayName)}</div>
        <div class="bytelock-dropdown-item-user">${escapeHtml(pw.username || '')}</div>
      `;

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        autofillCredentials(pw);
        removeDropdown();
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          autofillCredentials(pw);
          removeDropdown();
        }
      });

      dropdown.appendChild(item);
    });

    // Position
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${Math.max(rect.width, 280)}px`;
    dropdown.style.zIndex = '2147483647';

    document.body.appendChild(dropdown);

    // Close dropdown on outside click
    const onClickOutside = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorEl) {
        removeDropdown();
        document.removeEventListener('mousedown', onClickOutside);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
  }

  function autofillCredentials(pw) {
    if (window.location.protocol === 'http:') {
      const proceed = window.confirm(
        'ByteLock Warning: This page is not using HTTPS. ' +
        'Autofilling credentials on an insecure page exposes them to network eavesdropping. ' +
        'Proceed anyway?'
      );
      if (!proceed) return;
    }

    const { usernameFields, passwordFields } = findLoginFields();

    // Fill username
    if (usernameFields.length > 0 && pw.username) {
      setNativeValue(usernameFields[0], pw.username);
    }

    // Fill password
    if (passwordFields.length > 0 && pw.password) {
      setNativeValue(passwordFields[0], pw.password);
    }
  }

  /**
   * Set input value using native setter to trigger React/frameworks' change detection
   */
  function setNativeValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Field icons ────────────────────────────────────────────────────────
  function addFieldIcon(input, index) {
    const iconId = ICON_ID_PREFIX + index;
    if (document.getElementById(iconId)) return;

    const icon = document.createElement('div');
    icon.id = iconId;
    icon.className = 'bytelock-field-icon';
    icon.title = 'Autofill with ByteLock';
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-label', 'Open ByteLock autofill');
    icon.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon-32.png')}" width="16" height="16" alt="ByteLock">`;

    // Position inside the field
    const rect = input.getBoundingClientRect();
    icon.style.position = 'fixed';
    icon.style.zIndex = '2147483646';
    updateIconPosition(icon, input);

    icon.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeField = input;
      input.focus();
      if (matchedPasswords.length > 0) {
        createDropdown(input, matchedPasswords);
      }
    });

    document.body.appendChild(icon);

    // Update position on scroll/resize
    const updatePos = () => updateIconPosition(icon, input);
    window.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos, { passive: true });

    // Cleanup when input is removed
    const observer = new MutationObserver(() => {
      if (!document.body.contains(input)) {
        icon.remove();
        observer.disconnect();
        window.removeEventListener('scroll', updatePos);
        window.removeEventListener('resize', updatePos);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function updateIconPosition(icon, input) {
    const rect = input.getBoundingClientRect();
    icon.style.top = `${rect.top + (rect.height - 20) / 2}px`;
    icon.style.left = `${rect.right - 26}px`;
  }

  function removeAllIcons() {
    document.querySelectorAll(`[id^="${ICON_ID_PREFIX}"]`).forEach((el) => el.remove());
  }

  // ── Save password banner ───────────────────────────────────────────────
  function showSaveBanner(credentials) {
    removeSaveBanner();

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Save password prompt');

    banner.innerHTML = `
      <div class="bytelock-banner-content">
        <div class="bytelock-banner-icon">
          <img src="${chrome.runtime.getURL('icons/icon-32.png')}" width="20" height="20" alt="ByteLock">
        </div>
        <div class="bytelock-banner-text">
          <strong>Save password to ByteLock?</strong>
          <span>${escapeHtml(credentials.username)} on ${escapeHtml(credentials.title)}</span>
        </div>
        <div class="bytelock-banner-actions">
          <button class="bytelock-btn bytelock-btn-primary" id="bytelock-save-btn">Save</button>
          <button class="bytelock-btn bytelock-btn-ghost" id="bytelock-dismiss-btn">Not now</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('bytelock-save-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'SAVE_PASSWORD',
        title: credentials.title,
        username: credentials.username,
        password: credentials.password,
        url: credentials.url,
      }, (response) => {
        if (response?.error) {
          console.error('ByteLock: Failed to save password:', response.error);
        }
        removeSaveBanner();
      });
    });

    document.getElementById('bytelock-dismiss-btn').addEventListener('click', () => {
      dismissedForSession.add(credentials.url);
      removeSaveBanner();
    });

    // Auto-dismiss after 15 seconds
    setTimeout(() => removeSaveBanner(), 15000);
  }

  function removeSaveBanner() {
    const existing = document.getElementById(BANNER_ID);
    if (existing) existing.remove();
  }

  // ── Form submission detection (save new passwords) ─────────────────────
  function watchForSubmissions() {
    // Listen for form submissions
    document.addEventListener('submit', handleFormSubmit, true);

    // Also watch for click on common submit button patterns
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button[type="submit"], input[type="submit"], button');
      if (!target) return;

      // Check if this button is inside or near a form with a password field
      const form = target.closest('form');
      if (form && form.querySelector('input[type="password"]')) {
        // Small delay to let frameworks process
        setTimeout(() => captureCredentials(form), 100);
      }
    }, true);

    // Watch for Enter key on password fields
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.type === 'password') {
        const form = e.target.closest('form');
        if (form) {
          setTimeout(() => captureCredentials(form), 100);
        }
      }
    }, true);
  }

  function handleFormSubmit(e) {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    captureCredentials(form);
  }

  function captureCredentials(form) {
    const passwordInput = form.querySelector('input[type="password"]');
    if (!passwordInput || !passwordInput.value) return;

    // Find username field (preceding the password or common selectors)
    const allInputs = Array.from(form.querySelectorAll('input'));
    const pwIndex = allInputs.indexOf(passwordInput);
    let usernameValue = '';

    // Look for the most likely username field before the password field
    for (let i = pwIndex - 1; i >= 0; i--) {
      const input = allInputs[i];
      const type = (input.type || '').toLowerCase();
      if (['text', 'email', 'tel', ''].includes(type) && input.value) {
        usernameValue = input.value;
        break;
      }
    }

    // Fallback: search all username-like inputs in form
    if (!usernameValue) {
      const usernameInput = form.querySelector(
        'input[type="email"], input[autocomplete="username"], input[autocomplete="email"], input[name*="user"], input[name*="email"], input[name*="login"]'
      );
      if (usernameInput && usernameInput.value) {
        usernameValue = usernameInput.value;
      }
    }

    if (!usernameValue) return; // Can't save without username

    const url = window.location.origin;
    const title = document.title || window.location.hostname;

    // Check if this is already a known saved password
    const isKnown = matchedPasswords.some(
      (pw) => pw.username === usernameValue
    );

    if (isKnown) return; // Already saved
    if (dismissedForSession.has(url)) return;

    pendingCredentials = {
      username: usernameValue,
      password: passwordInput.value,
      url,
      title: window.location.hostname,
    };

    showSaveBanner(pendingCredentials);
  }

  // ── Initialization ─────────────────────────────────────────────────────
  async function init() {
    // Check extension status
    const status = await sendMessage({ type: 'GET_STATUS' });
    if (!status || !status.isLoggedIn || !status.isVaultUnlocked) return;

    // Get matching passwords for current URL
    const result = await sendMessage({
      type: 'GET_PASSWORDS_FOR_URL',
      url: window.location.href,
    });

    if (result?.vaultLocked) return;
    matchedPasswords = result?.passwords || [];

    // Find and annotate login fields
    annotateFields();

    // Watch for new fields (SPAs, dynamic forms)
    const bodyObserver = new MutationObserver(debounce(annotateFields, 500));
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Watch for form submissions to detect new passwords
    watchForSubmissions();
  }

  function annotateFields() {
    const { usernameFields, passwordFields } = findLoginFields();
    const allFields = [...usernameFields, ...passwordFields];

    if (allFields.length === 0) {
      removeAllIcons();
      return;
    }

    // Only show icons if we have matching passwords
    if (matchedPasswords.length > 0) {
      allFields.forEach((field, index) => {
        addFieldIcon(field, index);

        // Show dropdown on focus
        field.addEventListener('focus', () => {
          activeField = field;
          if (matchedPasswords.length > 0) {
            createDropdown(field, matchedPasswords);
          }
        });
      });
    }

    // Always attach focus listeners so we can detect form submissions
    passwordFields.forEach((field) => {
      if (!field.__bytelockWatched) {
        field.__bytelockWatched = true;
        field.addEventListener('blur', () => {
          // Small delay so we don't conflict with dropdown click
          setTimeout(removeDropdown, 200);
        });
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
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

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ── Listen for messages from background ────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PAGE_LOADED') {
      init();
    }
    if (msg.type === 'VAULT_STATE_CHANGED') {
      // Re-init when vault is unlocked/locked
      if (msg.isUnlocked) {
        init();
      } else {
        removeAllIcons();
        removeDropdown();
        removeSaveBanner();
        matchedPasswords = [];
      }
    }
    if (msg.type === 'AUTOFILL') {
      // Triggered from popup "autofill" button
      const { usernameFields, passwordFields } = findLoginFields();
      if (usernameFields.length > 0 && msg.username) {
        setNativeValue(usernameFields[0], msg.username);
      }
      if (passwordFields.length > 0 && msg.password) {
        setNativeValue(passwordFields[0], msg.password);
      }
    }
  });

  // ── Start ──────────────────────────────────────────────────────────────
  // Run on initial load
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
