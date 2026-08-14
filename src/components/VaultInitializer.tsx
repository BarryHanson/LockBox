"use client";

import { useState, useEffect } from 'react';
import { VaultPasswordPrompt } from './VaultPasswordPrompt';
import { useUser } from '@/hooks/useUser';
import { ensureEncryptionKeyAvailable } from '@/lib/clientCrypto';

export function VaultInitializer() {
  const { user, loading } = useUser();
  const [vaultStatus, setVaultStatus] = useState<{ needsSetup: boolean } | null>(null);
  const [showVaultPrompt, setShowVaultPrompt] = useState(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  
  // Check vault status when user logs in
  useEffect(() => {
    async function checkVaultStatus() {
      try {
        // ALWAYS CHECK SERVER FIRST for vault status - this is the source of truth
        const response = await fetch('/api/vault/status', {
          credentials: 'include'
        });

        if (!response.ok) {
          return;
        }

        const status = await response.json();
        setVaultStatus(status);

        // Check if vault is already unlocked (we have the key in memory)
        const isUnlocked = await ensureEncryptionKeyAvailable();

        if (isUnlocked) {
          // Vault is already unlocked - no need to show prompt
          setIsVaultUnlocked(true);
          return;
        }

        // Not unlocked, so always show prompt - the server has already told us if we need setup or just unlock
        setShowVaultPrompt(true);
      } catch (error) {
      }
    }
    
    // If we have a user and not loading, check vault status
    if (user && !loading) {
      checkVaultStatus();
    } else if (!user && !loading && checkCount < 3) {
      // If no user but we're not loading, try a few more times
      // This helps with race conditions during initialization
      const timer = setTimeout(() => {
        setCheckCount(prev => prev + 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, loading, isVaultUnlocked, checkCount]);
  
  const handleVaultSuccess = () => {
    setIsVaultUnlocked(true);
    setShowVaultPrompt(false);
  };
  
  // Only render when we need to show the prompt
  // This prevents unnecessary rendering when the vault is already unlocked
  if (!showVaultPrompt) {
    return null;
  }
  
  return (
    <>
      {showVaultPrompt && vaultStatus && (
        <VaultPasswordPrompt
          isOpen={showVaultPrompt}
          onClose={() => setShowVaultPrompt(false)}
          onSuccess={handleVaultSuccess}
          isSetup={vaultStatus.needsSetup}
        />
      )}
    </>
  );
}
