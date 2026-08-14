"use client";

import { useState, useEffect, useCallback } from 'react';
import { clearAuthToken } from '@/lib/auth-utils';
import { clearEncryptionKey, clearVaultKey } from '@/lib/clientCrypto';

interface User {
  id: string;
  email: string;
  name?: string;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);

      // Auth is cookie-based — cookies are sent automatically with credentials: 'include'
      const response = await fetch('/api/user/me', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
        } else {
          throw new Error('Failed to fetch user data');
        }
      } else {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Continue with client-side cleanup even if server call fails
    }
    clearAuthToken();
    clearEncryptionKey();
    clearVaultKey();
    setUser(null);
    window.location.href = '/login';
  };

  return {
    user,
    loading,
    error,
    logout,
    refetch: fetchUser
  };
}
