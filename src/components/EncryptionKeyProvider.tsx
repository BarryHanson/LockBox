"use client";

import { useEffect, useState } from 'react';
import { ensureEncryptionKeyAvailable } from '@/lib/clientCrypto';

/**
 * This component ensures the encryption key is available in session storage
 * It should be included in the layout of pages that need access to encrypted data
 */
export function EncryptionKeyProvider({ children }: { children: React.ReactNode }) {
  const [keyChecked, setKeyChecked] = useState(false);
  const [keyAvailable, setKeyAvailable] = useState(false);

  useEffect(() => {
    const checkEncryptionKey = async () => {
      let isAvailable = await ensureEncryptionKeyAvailable();

      // If not available on first try, wait a moment and try again
      // This helps with race conditions during page load
      if (!isAvailable) {
        await new Promise(resolve => setTimeout(resolve, 500));
        isAvailable = await ensureEncryptionKeyAvailable();
      }

      setKeyAvailable(isAvailable);
      setKeyChecked(true);
    };

    checkEncryptionKey();
  }, []);

  return <>{children}</>;
}
