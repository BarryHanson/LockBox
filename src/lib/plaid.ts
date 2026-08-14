import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

export const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
export const PLAID_SECRET = process.env.PLAID_SECRET || '';

const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const PLAID_SANDBOX_INSTITUTION = 'ins_109508'; // First Platypus Bank

export const PLAID_SANDBOX_CREDENTIALS = {
  username: 'user_good',
  password: 'pass_good',
};

export const PRODUCTS = [Products.Transactions, Products.Auth] as const;
export const COUNTRY_CODES = [CountryCode.Us] as const;

export const PLAID_PRODUCTS = [Products.Transactions];
export const PLAID_COUNTRY_CODES = [CountryCode.Us];
export const PLAID_REDIRECT_URI = process.env.NEXT_PUBLIC_URL;
export const PLAID_ANDROID_PACKAGE_NAME = process.env.PLAID_ANDROID_PACKAGE_NAME;

// For testing different scenarios
export const PLAID_TEST_USERS = {
  basic: { username: 'user_good', password: 'pass_good' },
  transactions: { username: 'user_transactions_dynamic', password: 'pass_good' },
  error: { username: 'user_good', password: 'error_ITEM_LOGIN_REQUIRED' },
};
