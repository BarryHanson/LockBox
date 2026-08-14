"use client";

import React, { useState, useEffect, createContext, useContext } from 'react';
import { ensureEncryptionKeyAvailable, storeSalt, clearEncryptionKey } from '@/lib/clientCrypto';
import { useUser } from '@/hooks/useUser';

interface IVaultContext {
  isVaultUnlocked: boolean;
  doesVaultNeedSetup: boolean | null;
  isCheckingVaultStatus: boolean;
  checkVaultStatusNow: () => Promise<void>;
  markVaultAsLocked: () => void;
}

const VaultContext = createContext<IVaultContext | undefined>(undefined);

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
};

interface VaultProviderProps {
  children: React.ReactNode;
}

export function VaultProvider({ children }: VaultProviderProps) {
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [doesVaultNeedSetup, setDoesVaultNeedSetup] = useState<boolean | null>(null);
  const [isCheckingVaultStatus, setIsCheckingVaultStatus] = useState(true);
  const { user, loading: userLoading } = useUser();

  const checkVaultStatusNow = async () => {
    setIsCheckingVaultStatus(true);

    try {
      // Check if key is already in memory first (e.g., user just entered vault password).
      // This must happen BEFORE the user check because VaultProvider's useUser()
      // state may not be populated yet when called from VaultPasswordPrompt's onSuccess.
      const keyInMemory = await ensureEncryptionKeyAvailable();

      if (keyInMemory) {
        setIsVaultUnlocked(true);
        setDoesVaultNeedSetup(false);
        setIsCheckingVaultStatus(false);
        return;
      }

      if (!user) {
        setIsVaultUnlocked(false);
        setDoesVaultNeedSetup(null);
        setIsCheckingVaultStatus(false);
        return;
      }

      setIsVaultUnlocked(false);
      const response = await fetch('/api/vault/status', {
        credentials: 'include',
      });

      if (!response.ok) {
        setDoesVaultNeedSetup(false);
        setIsCheckingVaultStatus(false);
        return;
      }

      const serverStatus = await response.json();
      const needsSetup = serverStatus.needsSetup === true;
      setDoesVaultNeedSetup(needsSetup);

      if (serverStatus.needsSetup === false) {
        try {
          const keyResponse = await fetch('/api/vault/retrieve', { credentials: 'include' });

          if (keyResponse.ok) {
            const keyData = await keyResponse.json();
            if (keyData.keySalt) {
              storeSalt(keyData.keySalt);
            }
          }
        } catch {
          // Non-blocking: user can still unlock by entering vault password.
        }
      }

    } catch {
      setIsVaultUnlocked(false);
      setDoesVaultNeedSetup(false);
    } finally {
      setIsCheckingVaultStatus(false);
    }
  };
  
  const markVaultAsLocked = () => {
    clearEncryptionKey();
    setIsVaultUnlocked(false);
  };

  useEffect(() => {
    if (!userLoading) {
      checkVaultStatusNow();
    }
  }, [user, userLoading]);

  return (
    <VaultContext.Provider value={{ isVaultUnlocked, doesVaultNeedSetup, isCheckingVaultStatus, checkVaultStatusNow, markVaultAsLocked }}>
      {children}
    </VaultContext.Provider>
  );
}
