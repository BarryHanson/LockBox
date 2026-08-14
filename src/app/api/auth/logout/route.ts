import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/fileAuditLog';

function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim() === 'https';
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  await logAuditEvent({ req: request, action: 'auth.logout', status: 200 });

  const response = NextResponse.json({
    message: 'Logged out successfully',
  });

  // Clear the authentication cookie
  response.cookies.set('token', '', {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'lax',
    path: '/',
    expires: new Date(0), // Set expiry to the past to delete the cookie
  });

  return response;
}
