/**
 * Authentication utilities for client-side.
 *
 * Authentication is handled via httpOnly cookies set by the server.
 * These functions exist for backwards compatibility - they no longer
 * store tokens in localStorage to prevent XSS token theft.
 * Cookies are automatically sent with same-origin requests.
 */

// No longer stored in localStorage - auth is cookie-based
export function getAuthToken(): string | null {
  return null;
}

// No-op: tokens are set as httpOnly cookies by the server
export function setAuthToken(_token: string): void {
  // Intentionally empty - cookie is set server-side
}

// No-op: use /api/auth/logout to clear the cookie
export function clearAuthToken(): void {
  // Intentionally empty - cookie is cleared server-side
}

// Returns empty headers - cookies are sent automatically for same-origin requests
export function getAuthHeader(): Record<string, string> {
  return {};
}

// Parse the JWT payload without verification (for display purposes only)
export function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

// Always returns true since we can't read httpOnly cookies client-side.
// The server will reject expired tokens.
export function isTokenExpired(): boolean {
  return false;
}
