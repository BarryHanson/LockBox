"use client";

import { useEffect } from 'react';
import { ensureEncryptionKeyAvailable } from '@/lib/clientCrypto';

export default function AppInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const checkEncryptionKey = async () => {
      // Check if we have an encryption key
      const isUnlocked = await ensureEncryptionKeyAvailable();
    };
    
    checkEncryptionKey();
  }, []);
  
  return <>{children}</>;
}
