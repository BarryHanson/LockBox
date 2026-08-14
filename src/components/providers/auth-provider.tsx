'use client';

import { SessionProvider } from 'next-auth/react';
import { VaultProvider } from './VaultProvider';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <VaultProvider>
        {children}
      </VaultProvider>
    </SessionProvider>
  );
}
