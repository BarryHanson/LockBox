import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
);

export async function POST(request: Request) {
  try {
    // Get token from cookie
    const cookies = request.headers.get('cookie');
    if (!cookies) {
      return NextResponse.json({ error: 'No cookies present' }, { status: 401 });
    }

    const token = cookies.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    if (!token) {
      return NextResponse.json({ error: 'No token found' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get the authorization code from request body
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }

    // Exchange the code for tokens
    const { tokens } = await client.getToken(code);
    const accessToken = tokens.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: 'No access token received' }, { status: 400 });
    }

    // Get user info using the access token
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    if (!profile.data.emailAddress) {
      return NextResponse.json({ error: 'Could not get email address' }, { status: 400 });
    }

    // Store or update the user's email credentials
    await prisma.userEmail.upsert({
      where: {
        userId_email: {
          userId: userId,
          email: profile.data.emailAddress
        }
      },
      update: {
        accessToken: accessToken,
        provider: 'gmail',
        lastScanned: null
      },
      create: {
        userId,
        email: profile.data.emailAddress,
        accessToken: accessToken,
        provider: 'gmail',
        lastScanned: null
      }
    });

    return NextResponse.json({
      email: profile.data.emailAddress,
      message: 'Email linked successfully'
    });
  } catch (error) {
    console.error('Email auth error:', error);
    return NextResponse.json(
      { error: 'Failed to authenticate email' },
      { status: 500 }
    );
  }
}
