import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { prisma } from '@/lib/prisma';
import { encryptPlaidToken } from '@/lib/plaidCrypto';

interface PlaidErrorResponse {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string;
}

export async function POST(request: Request) {
  try {
    // Middleware sets x-user-id on all authenticated requests.
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { publicToken } = await request.json();
    if (!publicToken || typeof publicToken !== 'string') {
      return NextResponse.json({ error: 'publicToken is required' }, { status: 400 });
    }

    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // Encrypt and store server-side — never expose to the client.
    const { encryptedAccessToken, accessTokenIv, accessTokenAuthTag } = encryptPlaidToken(accessToken);

    await prisma.plaidItem.upsert({
      where: { userId },
      create: { userId, encryptedAccessToken, accessTokenIv, accessTokenAuthTag, itemId },
      update: { encryptedAccessToken, accessTokenIv, accessTokenAuthTag, itemId },
    });

    return NextResponse.json({ success: true, itemId });
  } catch (error) {
    const plaidError = error as { error: PlaidErrorResponse };
    console.error('[plaid/exchange-token] Error:', plaidError.error || error);
    return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 });
  }
}
