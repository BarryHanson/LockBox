"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { ensureEncryptionKeyAvailable, storeEncryptionKey, storeSalt, deriveKeyFromPassword, arrayBufferToBase64, createVaultCheck, verifyVaultPassword } from '@/lib/clientCrypto';
import { getAuthHeader } from '@/lib/auth-utils';

interface VaultPasswordPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
  isSetup?: boolean;
}

export function VaultPasswordPrompt({ isOpen, onClose, onSuccess, isSetup = false }: VaultPasswordPromptProps) {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [passwordType, setPasswordType] = useState<'pin' | 'password'>('password');
  const [internalIsSetup, setInternalIsSetup] = useState(true); // Default to setup, API call will verify
  const [isLoadingStatus, setIsLoadingStatus] = useState(true); // Start in loading state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Use refs for callbacks to avoid useEffect re-firing on every render
  // (inline arrow functions create new references each render)
  const onSuccessRef = useRef(onSuccess);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const fetchVaultStatusAndHandleSessionKey = async () => {
      if (isOpen) {
        setIsLoadingStatus(true); // Set loading early
        setError(''); // Clear previous errors

        try {
          const keyAlreadyAvailable = await ensureEncryptionKeyAvailable(); // Check session storage first
          if (keyAlreadyAvailable) {
            if (typeof onSuccessRef.current === 'function') {
              onSuccessRef.current();
            }
            onCloseRef.current();
            setIsLoadingStatus(false);
            return; // Exit early, no need to fetch status or show form
          }
        } catch (sessionCheckError) {
          // Proceed to normal flow even if session check fails
        }

        // If key not in session, proceed with fetching vault status
        setIsLoadingStatus(true);
        setError(''); // Clear previous errors
        try {
          const response = await fetch('/api/vault/status', {
            method: 'GET',
            headers: getAuthHeader(), // Ensure auth headers are sent
            credentials: 'include',
          });

          if (!response.ok) {
            let errorText = 'Server error';
            if (response.status === 401) {
              errorText = await response.text().catch(() => 'Unauthorized');
            } else {
              try {
                const errorData = await response.json();
                errorText = errorData.error || errorData.message || response.statusText;
              } catch (jsonError) {
                errorText = await response.text().catch(() => response.statusText || 'Failed to retrieve error details');
              }
            }
            setError(`Failed to determine vault status: ${errorText}. Please try again or contact support.`);
            setInternalIsSetup(true); // Fallback to setup mode
          } else {
            const data = await response.json();
            if (typeof data.needsSetup === 'boolean') {
              setInternalIsSetup(data.needsSetup);
            } else {
              setError('Received invalid vault status from server. Defaulting to setup mode.');
              setInternalIsSetup(true);
            }
          }
        } catch (err) {
          setError('Network error while checking vault status. Please check your connection and try again.');
          setInternalIsSetup(true); // Fallback to setup mode
        } finally {
          setIsLoadingStatus(false);
        }
      } else {
        // Reset states when dialog is closed to ensure fresh fetch next time it opens
        setInternalIsSetup(true);
        setIsLoadingStatus(true);
      }
    };

    fetchVaultStatusAndHandleSessionKey();
  }, [isOpen]); // Only re-run when dialog opens/closes

  const validatePin = (pin: string) => {
    return /^\d{4,}$/.test(pin);
  };

  const validatePassword = (pass: string) => {
    return pass.length >= 8;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Create a vault setup
      if (internalIsSetup) {
        // Validation
        if (passwordType === 'pin' && !validatePin(password)) {
          setError('PIN must be at least 4 digits');
          return;
        }
        if (passwordType === 'password' && !validatePassword(password)) {
          setError('Password must be at least 8 characters');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return;
        }

        // 1. Generate a random salt and derive the encryption key from the password and salt
        // This happens entirely client-side - the server never sees the key
        const { key: masterKey, salt } = await deriveKeyFromPassword(password);

        // 2. Convert salt to base64 for storage
        // Use salt.buffer to convert from Uint8Array to ArrayBufferLike to fix type issue
        const saltBase64 = arrayBufferToBase64(salt.buffer);

        // Store salt in memory immediately so VaultCheck uses deterministic derivation
        storeSalt(saltBase64);

        // Send plaintext vault password over HTTPS and hash server-side
        const vaultPassword = password;

        // 3. Fetch user's email to create VaultCheck
        let userEmail = '';
        try {
          const userResponse = await fetch('/api/user/me', {
            headers: getAuthHeader(),
            credentials: 'include',
          });
          if (userResponse.ok) {
            const userData = await userResponse.json();
            userEmail = userData.email;
          } else {
            setError('Failed to retrieve user email');
            return;
          }
        } catch (error) {
          setError('Failed to get user email for vault setup');
          return;
        }

        // 4. Create VaultCheck by encrypting the user's email
        let vaultCheckEncrypted = '';
        let vaultCheckIv = '';
        try {
          const vaultCheckData = await createVaultCheck(userEmail, password);
          vaultCheckEncrypted = vaultCheckData.encryptedEmail;
          vaultCheckIv = vaultCheckData.iv;
        } catch (error) {
          setError('Failed to create vault check');
          return;
        }

        try {
          const setupResponse = await fetch('/api/vault/setup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader(),
            },
            body: JSON.stringify({
              vaultPassword,
              keySalt: saltBase64,
              vaultCheckEncrypted,
              vaultCheckIv
            }),
            credentials: 'include',
          });

          if (!setupResponse.ok) {
            let errorText = 'Failed to set up vault.';
            if (setupResponse.status === 401) {
              errorText = await setupResponse.text().catch(() => 'Unauthorized during setup');
            } else {
              try {
                const errorData = await setupResponse.json();
                errorText = errorData.error || errorData.message || `Server error: ${setupResponse.statusText}`;
              } catch (jsonError) {
                errorText = await setupResponse.text().catch(() => setupResponse.statusText || 'Failed to retrieve setup error details');
              }
            }
            setError(errorText);
            return;
          }

          // 6. Store the encryption key in memory for the current session
          await storeEncryptionKey(masterKey);

          // 7. Also save the salt in memory to avoid needing to hit the server again
          storeSalt(saltBase64);

        } catch (apiError) {
          setError('Failed to save vault settings to server. Please check your connection or try again.');
          return;
        }
      } else {
        // Unlock existing vault - derive the key from password and salt
        try {
          const statusResponse = await fetch('/api/vault/status', {
            method: 'GET',
            headers: getAuthHeader(),
            credentials: 'include',
          });

          if (!statusResponse.ok) {
            let errorText = 'Failed to retrieve vault status.';
            if (statusResponse.status === 401) {
              errorText = 'Authentication failed. Please log in again.';
            } else if (statusResponse.status === 404) {
              setInternalIsSetup(true);
              errorText = 'Vault not found. Please set up a new vault.';
            } else {
              try {
                const errorData = await statusResponse.json();
                errorText = errorData.error || errorData.message || `Server error: ${statusResponse.statusText}`;
              } catch (jsonError) {
                errorText = await statusResponse.text().catch(() => statusResponse.statusText || 'Failed to retrieve status error details');
              }
            }
            setError(errorText);
            return;
          }

          const statusData = await statusResponse.json();
          const { keySalt, needsSetup, vaultCheckEncrypted, vaultCheckIv } = statusData;

          if (needsSetup || !keySalt) {
            setError('No vault found. Please set up a new vault.');
            setInternalIsSetup(true);
            return;
          }

          // Store salt before verification so VaultCheck uses the same derivation parameters as setup
          storeSalt(keySalt);

          // Verify password using VaultCheck if available
          if (vaultCheckEncrypted && vaultCheckIv) {
            // Fetch user's email to verify against
            let userEmail = '';
            try {
              const userResponse = await fetch('/api/user/me', {
                headers: getAuthHeader(),
                credentials: 'include',
              });
              if (userResponse.ok) {
                const userData = await userResponse.json();
                userEmail = userData.email;
              } else {
                setError('Failed to retrieve user email');
                return;
              }
            } catch (error) {
              setError('Failed to get user email for verification');
              return;
            }

            // Verify the password by attempting to decrypt VaultCheck
            const isPasswordValid = await verifyVaultPassword(
              vaultCheckEncrypted,
              vaultCheckIv,
              password,
              userEmail
            );

            if (!isPasswordValid) {
              // Backward compatibility for accounts created while VaultCheck salt derivation was inconsistent
              const unlockFallbackResponse = await fetch('/api/vault/unlock', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...getAuthHeader(),
                },
                body: JSON.stringify({ vaultPassword: password }),
                credentials: 'include',
              });

              if (!unlockFallbackResponse.ok) {
                setError('Incorrect password. Please try again.');
                return;
              }
            }
          } else {
            // If no VaultCheck data, we MUST verify using bcrypt before unlocking
            const unlockResponse = await fetch('/api/vault/unlock', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader(),
              },
              body: JSON.stringify({ vaultPassword: password }),
              credentials: 'include',
            });

            if (!unlockResponse.ok) {
              setError('Incorrect password. Please try again.');
              return;
            }
          }

          // Only derive the key AFTER successful password verification
          // Derive and store the encryption key from the password and salt
          const unlocked = await ensureEncryptionKeyAvailable(password);

          if (!unlocked) {
            setError('Failed to unlock vault. Please try again.');
            return;
          }

        } catch (error) {
          setError('Network error. Please try again.');
          return;
        }
      }

      // If we've made it here, success!

      // Reset state
      setPassword('');
      setConfirmPassword('');

      // Call success callback and close
      // Await onSuccess so checkVaultStatusNow completes (sets isVaultUnlocked=true)
      // before closing the dialog
      if (typeof onSuccess === 'function') {
        await onSuccess();
      }
      onClose();

    } catch (generalError) {
      setError('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] p-6">
        <div className="flex flex-col items-center justify-center pt-4 pb-2">
          {/* Local Vault Icon */}
          <div className="relative w-28 h-28 mb-6 flex justify-center">
            <div className="relative w-28 h-28" style={{ marginLeft: '15px' }}>
              <Image
                src="/safe-box.png"
                alt="Secure Vault"
                fill
                className="object-contain"
                style={{ filter: `brightness(0) saturate(100%) invert(56%) sepia(75%) saturate(1615%) hue-rotate(360deg) brightness(101%) contrast(92%)` }}
                priority
              />
            </div>
          </div>

          <DialogHeader className="text-center w-full mb-6">
            <DialogTitle className="text-2xl font-bold tracking-tight mb-2 text-center mx-auto w-full">
              {isLoadingStatus ? 'Loading...' : (internalIsSetup ? 'Set Up Your Secure Vault' : 'Unlock Your Vault')}
            </DialogTitle>
            <DialogDescription className="text-base max-w-md mx-auto text-center w-full">
              {isLoadingStatus ? 'Please wait...' : (internalIsSetup
                ? 'Create a strong password to protect your sensitive information. This password cannot be recovered if lost.'
                : 'Enter your vault password to access your encrypted data.')}
            </DialogDescription>
          </DialogHeader>
        </div>

        {!isLoadingStatus && (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto">
            {internalIsSetup && (
              <div className="flex justify-center gap-4 mb-6">
                <Button
                  type="button"
                  variant={passwordType === 'pin' ? 'default' : 'outline'}
                  onClick={() => setPasswordType('pin')}
                  className={`px-8 py-2 rounded-full ${passwordType === 'pin' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
                >
                  Use PIN
                </Button>
                <Button
                  type="button"
                  variant={passwordType === 'password' ? 'default' : 'outline'}
                  onClick={() => setPasswordType('password')}
                  className={`px-8 py-2 rounded-full ${passwordType === 'password' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
                >
                  Use Password
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <Label htmlFor="vault-password" className="text-sm font-medium block text-center">
                {passwordType === 'pin' ? 'Enter Your PIN' : 'Enter Your Password/Pin'}
              </Label>
              <div className="relative">
                <Input
                  id="vault-password"
                  type={passwordType === 'pin' ? 'number' : (showPassword ? 'text' : 'password')}
                  placeholder={passwordType === 'pin' ? 'e.g., 123456' : '••••••••'}
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  className="py-3 text-base rounded-lg pr-10 text-center"
                  style={{ textAlign: 'center', paddingLeft: '2.5rem' }}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-orange-500 hover:text-orange-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </Button>
              </div>
            </div>

            {internalIsSetup && (
              <div className="space-y-3">
                <Label htmlFor="confirm-password" className="text-sm font-medium block text-center">
                  Confirm {passwordType === 'pin' ? 'PIN' : 'Password'}
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={passwordType === 'pin' ? 'number' : (showConfirmPassword ? 'text' : 'password')}
                    placeholder={passwordType === 'pin' ? 'Re-enter PIN' : 'Re-enter password'}
                    value={confirmPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                    className="py-3 text-base rounded-lg pr-10 text-center"
                    style={{ textAlign: 'center', paddingLeft: '2.5rem' }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-orange-500 hover:text-orange-600"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm p-4 bg-red-50 border border-red-200 rounded-lg text-center mt-4">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-6">
              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 text-base font-medium rounded-lg"
              >
                {internalIsSetup ? 'Create Vault' : 'Unlock Vault'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="w-full py-3 text-base rounded-lg"
              >
                Cancel
              </Button>
            </div>

            <div className="text-xs text-muted-foreground text-center pt-2">
              Mode: {internalIsSetup ? 'Setup' : 'Unlock'}
            </div>
          </form>
        )}

        {isLoadingStatus && (
          <div className="flex flex-col items-center justify-center py-12">
            <svg className="animate-spin h-10 w-10 text-orange-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-muted-foreground text-center">Checking vault status...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
