/**
 * Client-side storage utilities for Plaid integration
 * Uses sessionStorage only (not localStorage) for security
 */

// Store Plaid access token in memory-safe session storage only
export function storePlaidToken(token: string): void {
  try {
    sessionStorage.setItem('plaid_access_token', token);

    const storedToken = sessionStorage.getItem('plaid_access_token');
    if (!storedToken) {
      throw new Error('Failed to store Plaid access token');
    }
  } catch (error) {
    throw error;
  }
}

// Retrieve Plaid access token from session storage
export function getPlaidToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return sessionStorage.getItem('plaid_access_token');
  } catch (error) {
    return null;
  }
}
