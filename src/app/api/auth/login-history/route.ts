import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (bearerToken) return bearerToken;

  const cookieHeader = req.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [k, ...v] = c.split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
  );

  return cookies['token'] || cookies['next-auth.session-token'] || cookies['session'] || null;
}

function extractIp(req: Request) {
  const toIpv4 = (rawIp: string): string => {
    const ip = rawIp.trim();
    if (ip === '::1') return '127.0.0.1';
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
  };

  const xf = req.headers.get('x-forwarded-for');
  if (xf) return toIpv4(xf.split(',')[0].trim());
  const xr = req.headers.get('x-real-ip');
  if (xr) return toIpv4(xr);
  return '0.0.0.0';
}

export async function POST(req: Request) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return new NextResponse('Unauthorized', { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = String((payload as any).userId);

    const body = await req.json().catch(() => ({}));
    const successful = body?.successful ?? true;

    const ip = extractIp(req);
    const userAgent = req.headers.get('user-agent') || '';

    const rec = await prisma.loginHistory.create({
      data: {
        userId,
        ip,
        userAgent,
        successful: Boolean(successful)
      }
    });

    return NextResponse.json(rec);
  } catch (err) {
    console.error('login-history POST error', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return new NextResponse('Unauthorized', { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = String((payload as any).userId);

    const entries = await prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return NextResponse.json(entries);
  } catch (err) {
    console.error('login-history GET error', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
