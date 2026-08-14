import { appendFile } from 'fs/promises';
import path from 'path';

type AuditLevel = 'info' | 'warn' | 'error';

interface AuditLogInput {
  req?: Request;
  action: string;
  level?: AuditLevel;
  status?: number;
  userId?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown>;
}

function getClientIp(req?: Request): string {
  if (!req) return 'unknown';
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  return 'unknown';
}

function toSafeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}

export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const { req, action, level = 'info', status, userId, email, metadata } = input;
    const now = new Date().toISOString();
    const method = req?.method || '-';
    const requestPath = req ? new URL(req.url).pathname : '-';
    const ip = getClientIp(req);
    const userAgent = req?.headers.get('user-agent') || 'unknown';
    const line = [
      `[${now}]`,
      `level=${level}`,
      `action=${action}`,
      `status=${status ?? '-'}`,
      `ip=${ip}`,
      `method=${method}`,
      `path=${requestPath}`,
      `userId=${userId ?? 'anonymous'}`,
      `email=${email ?? '-'}`,
      `ua=${JSON.stringify(userAgent)}`,
      `meta=${toSafeJson(metadata ?? {})}`,
    ].join(' ');

    const logPath = path.join(process.cwd(), 'log.txt');
    await appendFile(logPath, `${line}\n`, 'utf8');
  } catch (error) {
    console.error('audit log write failed', error);
  }
}
