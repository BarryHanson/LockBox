import { authenticator } from 'otplib';

const DEFAULT_TOTP_STEP_SECONDS = 30;
const DEFAULT_TOTP_DIGITS = 6;
const DEFAULT_TOTP_WINDOW = 1;

function getTotpWindow(): number {
  const raw = process.env.TOTP_WINDOW;
  if (!raw) {
    return DEFAULT_TOTP_WINDOW;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_TOTP_WINDOW;
  }

  return Math.floor(parsed);
}

export function normalizeTotpCode(code: string): string {
  return code.replace(/[\s-]/g, '').trim();
}

export function verifyTotpCode(secret: string, rawCode: string): boolean {
  const code = normalizeTotpCode(rawCode);
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const window = getTotpWindow();
  authenticator.options = {
    step: DEFAULT_TOTP_STEP_SECONDS,
    digits: DEFAULT_TOTP_DIGITS,
    window: [window, window],
  };

  const delta = authenticator.checkDelta(code, secret);
  return delta !== null;
}

export function normalizeBackupCode(code: string): string {
  return code.trim().toLowerCase();
}
