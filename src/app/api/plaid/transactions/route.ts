import { NextResponse } from 'next/server';
import { plaidClient, PLAID_PRODUCTS, PLAID_TEST_USERS } from '@/lib/plaid';
import { prisma } from '@/lib/prisma';
import { decryptPlaidToken } from '@/lib/plaidCrypto';
import { PlaidError, TransactionsUpdateStatus, TransactionsSyncResponse } from 'plaid';
import { AxiosResponse } from 'axios';

export const dynamic = 'force-dynamic';

interface PlaidErrorResponse {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string;
}

export async function GET(request: Request) {
  try {
    // Middleware sets x-user-id on all authenticated requests.
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up the stored Plaid access token for this user.
    const plaidItem = await prisma.plaidItem.findUnique({ where: { userId } });
    if (!plaidItem) {
      return NextResponse.json({ error: 'No bank account linked. Please connect a bank account first.' }, { status: 404 });
    }

    const accessToken = decryptPlaidToken(
      plaidItem.encryptedAccessToken,
      plaidItem.accessTokenIv,
      plaidItem.accessTokenAuthTag,
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // Try to sync transactions
    let response = await plaidClient.transactionsSync({
      access_token: accessToken,
      options: { include_personal_finance_category: true },
    });

    // If no transactions found, request a refresh and return accounts
    if (response.data.added.length === 0) {
      try {
        await plaidClient.transactionsRefresh({ access_token: accessToken });

        const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
        return NextResponse.json({
          transactions: [],
          accounts: accountsResponse.data.accounts,
          status: 'PENDING_TRANSACTIONS',
        }, { status: 202 });
      } catch (refreshError) {
        // Continue to try getting transactions directly
      }

      try {
        const initialResponse = await plaidClient.transactionsGet({
          access_token: accessToken,
          start_date: thirtyDaysAgo.toISOString().split('T')[0],
          end_date: now.toISOString().split('T')[0],
          options: { include_personal_finance_category: true },
        });

        if (initialResponse.data.transactions.length > 0) {
          const updateStatus = {
            last_webhook: null as string | null,
            last_successful_update: new Date().toISOString(),
            last_attempted_update: new Date().toISOString(),
          } as unknown as TransactionsUpdateStatus;

          const syncResponse: TransactionsSyncResponse = {
            added: initialResponse.data.transactions,
            modified: [],
            removed: [],
            has_more: false,
            next_cursor: '',
            request_id: initialResponse.data.request_id,
            transactions_update_status: updateStatus,
            accounts: initialResponse.data.accounts,
          };

          response = {
            data: syncResponse,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {},
          } as AxiosResponse<TransactionsSyncResponse>;
        }
      } catch (error) {
        const plaidError = error as { error: PlaidErrorResponse };
        if (plaidError.error?.error_code === 'PRODUCT_NOT_READY') {
          const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
          return NextResponse.json({
            transactions: [],
            accounts: accountsResponse.data.accounts,
            status: 'PENDING_TRANSACTIONS',
          }, { status: 202 });
        }
        throw error;
      }
    }

    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });

    // Request refresh if no transactions yet
    if (response.data.added.length === 0) {
      try {
        await plaidClient.transactionsRefresh({ access_token: accessToken });
      } catch (refreshError: any) {
        const plaidError = refreshError?.response?.data;
        if (plaidError?.error_code !== 'TRANSACTIONS_LIMIT') {
          console.error('[plaid/transactions] Refresh failed:', refreshError);
        }
      }
    }

    const transactions = response.data.added.map(transaction => ({
      id: transaction.transaction_id,
      amount: transaction.amount,
      date: transaction.date,
      name: transaction.merchant_name || transaction.name,
      category: transaction.personal_finance_category?.primary || transaction.category?.[0] || 'Other',
      pending: transaction.pending,
      accountId: transaction.account_id,
    }));

    return NextResponse.json({ transactions, accounts: accountsResponse.data.accounts });
  } catch (error) {
    const plaidError = error as { error: PlaidErrorResponse };
    console.error('[plaid/transactions] Error:', plaidError.error || error);

    // Dev-only: auto-create a sandbox item if the token is invalid
    if (plaidError.error?.error_code === 'INVALID_ACCESS_TOKEN' && process.env.NODE_ENV === 'development') {
      try {
        const userId = request.headers.get('x-user-id');
        if (userId) {
          const createResponse = await plaidClient.sandboxPublicTokenCreate({
            institution_id: 'ins_109508',
            initial_products: PLAID_PRODUCTS,
            options: {
              override_username: PLAID_TEST_USERS.transactions.username,
              override_password: PLAID_TEST_USERS.transactions.password,
            },
          });
          const exchangeResponse = await plaidClient.itemPublicTokenExchange({
            public_token: createResponse.data.public_token,
          });
          // Store the new sandbox token for this user
          const { encryptPlaidToken } = await import('@/lib/plaidCrypto');
          const encrypted = encryptPlaidToken(exchangeResponse.data.access_token);
          await prisma.plaidItem.upsert({
            where: { userId },
            create: { userId, ...encrypted, itemId: exchangeResponse.data.item_id },
            update: { ...encrypted, itemId: exchangeResponse.data.item_id },
          });
          return GET(request);
        }
      } catch (retryError) {
        console.error('[plaid/transactions] Sandbox retry failed:', retryError);
      }
    }

    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
