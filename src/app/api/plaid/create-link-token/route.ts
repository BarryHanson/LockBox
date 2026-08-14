import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { CountryCode, Products } from 'plaid';
import { getAuthenticatedApiUser } from '@/lib/api-auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const request = {
      user: {
        client_user_id: authUser.id,
      },
      client_name: 'Lock Box',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    };

    const response = await plaidClient.linkTokenCreate(request);
    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    );
  }
}
