"use client";

import { EncryptionKeyProvider } from '@/components/EncryptionKeyProvider';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ensureEncryptionKeyAvailable } from '@/lib/clientCrypto';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();

  // Check for encryption key on page load
  useEffect(() => {
    const checkEncryptionKey = async () => {
      await ensureEncryptionKeyAvailable();
    };

    checkEncryptionKey();
  }, []);

  return (
    <EncryptionKeyProvider>
      {children}
    </EncryptionKeyProvider>
  );
}
