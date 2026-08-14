import { NextResponse } from 'next/server';
import { plaidClient, PLAID_SANDBOX_INSTITUTION, PLAID_PRODUCTS, PLAID_COUNTRY_CODES } from '@/lib/plaid';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    // Create a test Item in Sandbox
    const createResponse = await plaidClient.sandboxPublicTokenCreate({
      institution_id: PLAID_SANDBOX_INSTITUTION,
      initial_products: PLAID_PRODUCTS,
      options: {
        override_username: username,
        override_password: password,
      },
    });

    return NextResponse.json({ 
      publicToken: createResponse.data.public_token,
      institutionId: PLAID_SANDBOX_INSTITUTION,
    });
  } catch (error) {
    console.error('Error creating sandbox token:', error);
    return NextResponse.json(
      { error: 'Failed to create sandbox token' },
      { status: 500 }
    );
  }
}
