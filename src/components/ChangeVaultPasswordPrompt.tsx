"use client";

import { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { encryptEncryptionKey, encryptObject, decryptObject, deriveKeyFromPassword, arrayBufferToBase64, storeSalt, encrypt, decrypt, base64ToArrayBuffer, exportCryptoKey, createVaultCheck } from '@/lib/clientCrypto';
import { retrieveEncryptionKey } from '@/lib/clientCrypto';
import { getAuthHeader } from '@/lib/auth-utils';

interface ChangeVaultPasswordPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangeVaultPasswordPrompt({ isOpen, onClose, onSuccess }: ChangeVaultPasswordPromptProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [passwordType, setPasswordType] = useState<'pin' | 'password'>('password');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validatePin = (pin: string) => {
    return /^\d{6,}$/.test(pin);
  };

  const validatePassword = (pass: string) => {
    return pass.length >= 8;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validation
      if (passwordType === 'pin' && !validatePin(password)) {
        setError('PIN must be at least 6 digits');
        setIsLoading(false);
        return;
      }
      if (passwordType === 'password' && !validatePassword(password)) {
        setError('Password must be at least 8 characters');
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setIsLoading(false);
        return;
      }
      if (!currentPassword) {
        setError('Current vault password is required');
        setIsLoading(false);
        return;
      }

      // Get the current decryption key (already unlocked in memory)
      const currentKey = await retrieveEncryptionKey();
      if (!currentKey) {
        setError('Vault key not found. Please unlock the vault first.');
        setIsLoading(false);
        return;
      }

      // Fetch all encrypted data that needs to be re-encrypted
      const [passwordsRes, cardsRes, notesRes, filesRes] = await Promise.all([
        fetch('/api/passwords', { credentials: 'include' }),
        fetch('/api/cards', { credentials: 'include' }),
        fetch('/api/notes', { credentials: 'include' }),
        fetch('/api/files', { credentials: 'include' })
      ]);

      if (!passwordsRes.ok) {
        throw new Error(`Failed to fetch passwords: ${passwordsRes.status} ${passwordsRes.statusText}`);
      }
      if (!cardsRes.ok) {
        throw new Error(`Failed to fetch cards: ${cardsRes.status} ${cardsRes.statusText}`);
      }
      if (!notesRes.ok) {
        throw new Error(`Failed to fetch notes: ${notesRes.status} ${notesRes.statusText}`);
      }
      if (!filesRes.ok) {
        throw new Error(`Failed to fetch files: ${filesRes.status} ${filesRes.statusText}`);
      }

      const passwords = await passwordsRes.json();
      const cards = await cardsRes.json();
      const notes = await notesRes.json();
      const files = await filesRes.json();

      // Derive new encryption key from the new password
      const { key: newKey, salt: newSalt } = await deriveKeyFromPassword(password);
      const newSaltBase64 = arrayBufferToBase64(newSalt.buffer);

      // Send plaintext vault password over HTTPS and hash server-side
      const newVaultPasswordHash = password;
      const encryptedNewKey = await encryptEncryptionKey(newKey, password);

      // Fetch user's email to create new VaultCheck
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
          throw new Error('Failed to retrieve user email');
        }
      } catch (error) {
        setError('Failed to get user email for vault password change');
        setIsLoading(false);
        return;
      }

      // Create new VaultCheck with new password
      let newVaultCheckEncrypted = '';
      let newVaultCheckIv = '';
      try {
        const vaultCheckData = await createVaultCheck(userEmail, password);
        newVaultCheckEncrypted = vaultCheckData.encryptedEmail;
        newVaultCheckIv = vaultCheckData.iv;
      } catch (error) {
        setError('Failed to create new vault check');
        setIsLoading(false);
        return;
      }

      // === RE-ENCRYPT PASSWORDS ===
      const reEncryptedPasswords = await Promise.all(passwords.map(async (p: any) => {
        try {
          // Decrypt with old key first
          const decrypted = await decryptObject(
            p,
            currentKey,
            ['password', 'username', 'notes'],
            p.encryptionData || {}
          );

          // Re-encrypt with new key
          const { encryptedObj, encryptionData } = await encryptObject(
            decrypted,
            newKey,
            ['password', 'username', 'notes']
          );

          return {
            id: p.id,
            password: encryptedObj.password,
            username: encryptedObj.username,
            notes: encryptedObj.notes,
            encryptionData
          };
        } catch (err) {
          throw err;
        }
      }));

      // === RE-ENCRYPT CARDS ===
      const reEncryptedCards = await Promise.all(cards.map(async (c: any) => {
        try {
          // Decrypt with old key first
          const decrypted = await decryptObject(
            c,
            currentKey,
            ['cardNumber', 'cvv', 'billingAddress'],
            c.encryptionData || {}
          );

          // Re-encrypt with new key
          const { encryptedObj, encryptionData } = await encryptObject(
            decrypted,
            newKey,
            ['cardNumber', 'cvv', 'billingAddress']
          );

          return {
            id: c.id,
            cardNumber: encryptedObj.cardNumber,
            cvv: encryptedObj.cvv,
            billingAddress: encryptedObj.billingAddress,
            encryptionData
          };
        } catch (err) {
          throw err;
        }
      }));

      // === RE-ENCRYPT NOTES ===
      const reEncryptedNotes = await Promise.all(notes.map(async (n: any) => {
        try {
          // Decrypt with old key first
          const titleMetadata = n.encryptionMetadata?.title || {};
          const contentMetadata = n.encryptionMetadata?.content || {};

          let decryptedTitle = n.encryptedTitle || '';
          let decryptedContent = n.encryptedContent || '';

          // Decrypt title using salt-based derived key
          if (titleMetadata.iv && titleMetadata.salt) {
            const ivArrayTitle = new Uint8Array(base64ToArrayBuffer(titleMetadata.iv));
            const saltArrayTitle = new Uint8Array(base64ToArrayBuffer(titleMetadata.salt));
            const { key: derivedKeyTitle } = await deriveKeyFromPassword(await exportCryptoKey(currentKey), saltArrayTitle);
            decryptedTitle = await decrypt(n.encryptedTitle, derivedKeyTitle, ivArrayTitle);
          }

          // Decrypt content using salt-based derived key
          if (contentMetadata.iv && contentMetadata.salt) {
            const ivArrayContent = new Uint8Array(base64ToArrayBuffer(contentMetadata.iv));
            const saltArrayContent = new Uint8Array(base64ToArrayBuffer(contentMetadata.salt));
            const { key: derivedKeyContent } = await deriveKeyFromPassword(await exportCryptoKey(currentKey), saltArrayContent);
            decryptedContent = await decrypt(n.encryptedContent, derivedKeyContent, ivArrayContent);
          }

          // Re-encrypt with new key using new random salts and IVs
          const newSaltTitle = crypto.getRandomValues(new Uint8Array(16));
          const newSaltContent = crypto.getRandomValues(new Uint8Array(16));

          const { key: newDerivedKeyTitle } = await deriveKeyFromPassword(await exportCryptoKey(newKey), newSaltTitle);
          const { key: newDerivedKeyContent } = await deriveKeyFromPassword(await exportCryptoKey(newKey), newSaltContent);

          const { encrypted: encryptedTitle, iv: newIvTitle } = await encrypt(decryptedTitle, newDerivedKeyTitle);
          const { encrypted: encryptedContent, iv: newIvContent } = await encrypt(decryptedContent, newDerivedKeyContent);

          return {
            id: n.id,
            encryptedTitle,
            encryptedContent,
            encryptionMetadata: {
              title: {
                iv: arrayBufferToBase64(newIvTitle.buffer),
                salt: arrayBufferToBase64(newSaltTitle.buffer)
              },
              content: {
                iv: arrayBufferToBase64(newIvContent.buffer),
                salt: arrayBufferToBase64(newSaltContent.buffer)
              }
            }
          };
        } catch (err) {
          throw err;
        }
      }));

      // === RE-ENCRYPT FILES ===
      const reEncryptedFiles = await Promise.all(files.map(async (f: any) => {
        try {
          if (!f.encryptedName) {
            return {
              id: f.id,
              encryptedName: null,
              encryptionMetadata: null
            };
          }

          // Decrypt file name - handle both old and new formats
          const nameMetadata = f.encryptionMetadata?.name || {};

          let decryptedName = f.encryptedName;
          if (nameMetadata.iv && nameMetadata.salt) {
            // New format: salt-based key derivation
            const ivArray = new Uint8Array(base64ToArrayBuffer(nameMetadata.iv));
            const saltArray = new Uint8Array(base64ToArrayBuffer(nameMetadata.salt));
            const { key: derivedKeyFileName } = await deriveKeyFromPassword(await exportCryptoKey(currentKey), saltArray);
            decryptedName = await decrypt(f.encryptedName, derivedKeyFileName, ivArray);
          } else if (f.iv) {
            // Old format: simple IV-based encryption (backward compatibility)
            const ivArray = new Uint8Array(base64ToArrayBuffer(f.iv));
            decryptedName = await decrypt(f.encryptedName, currentKey, ivArray);
          }

          // Re-encrypt file name with new key using new salt
          const newFileNameSalt = crypto.getRandomValues(new Uint8Array(16));
          const { key: newDerivedKeyFileName } = await deriveKeyFromPassword(await exportCryptoKey(newKey), newFileNameSalt);
          const { encrypted: encryptedName, iv: newIvFileName } = await encrypt(decryptedName, newDerivedKeyFileName);

          // === RE-ENCRYPT FILE CONTENT IN R2 ===

          // Download encrypted file content from R2
          const downloadResp = await fetch('/api/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'download-proxy', fileId: f.id }),
            credentials: 'include'
          });

          if (!downloadResp.ok) {
            throw new Error(`Failed to download file ${f.id}: ${downloadResp.statusText}`);
          }

          const encryptedArrayBuffer = await downloadResp.arrayBuffer();
          const encryptedBase64 = arrayBufferToBase64(encryptedArrayBuffer);

          // Decrypt file content with old key
          const dataMetadata = f.encryptionMetadata?.data || {};
          let decryptedFileData: string;

          if (dataMetadata.iv && dataMetadata.salt) {
            // New format: salt-based key derivation
            const ivBytes = new Uint8Array(base64ToArrayBuffer(dataMetadata.iv));
            const saltBytes = new Uint8Array(base64ToArrayBuffer(dataMetadata.salt));
            const { key: derivedKeyFileData } = await deriveKeyFromPassword(await exportCryptoKey(currentKey), saltBytes);
            decryptedFileData = await decrypt(encryptedBase64, derivedKeyFileData, ivBytes);
          } else if (f.iv) {
            // Old format: simple IV-based encryption
            const ivBytes = new Uint8Array(base64ToArrayBuffer(f.iv));
            decryptedFileData = await decrypt(encryptedBase64, currentKey, ivBytes);
          } else {
            throw new Error('Missing IV or encryption metadata for file data decryption');
          }

          // Re-encrypt file content with new key using new salt
          const newFileDataSalt = crypto.getRandomValues(new Uint8Array(16));
          const { key: newDerivedKeyFileData } = await deriveKeyFromPassword(await exportCryptoKey(newKey), newFileDataSalt);
          const { encrypted: reEncryptedFileData, iv: newIvFileData } = await encrypt(decryptedFileData, newDerivedKeyFileData);

          // Convert re-encrypted base64 back to binary for upload
          const reEncryptedBinary = base64ToArrayBuffer(reEncryptedFileData);
          const reEncryptedBlob = new Blob([reEncryptedBinary], { type: f.mimeType || 'application/octet-stream' });

          // Upload re-encrypted file back to R2 via server proxy
          const formData = new FormData();
          formData.append('file', reEncryptedBlob);
          formData.append('metadata', JSON.stringify({
            action: 'replace-proxy',
            fileId: f.id,
            mimeType: f.mimeType || 'application/octet-stream'
          }));

          const uploadResp = await fetch('/api/files', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });

          if (!uploadResp.ok) {
            throw new Error(`Failed to upload re-encrypted file ${f.id}: ${uploadResp.statusText}`);
          }

          return {
            id: f.id,
            encryptedName,
            encryptionMetadata: {
              name: {
                iv: arrayBufferToBase64(newIvFileName.buffer),
                salt: arrayBufferToBase64(newFileNameSalt.buffer)
              },
              data: {
                iv: arrayBufferToBase64(newIvFileData.buffer),
                salt: arrayBufferToBase64(newFileDataSalt.buffer)
              }
            }
          };
        } catch (err) {
          throw err;
        }
      }));

      // Update vault on server with all re-encrypted data and new master key
      const response = await fetch('/api/vault/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentVaultPassword: currentPassword,
          vaultPasswordHash: newVaultPasswordHash,
          keySalt: newSaltBase64,
          encryptedMasterKey: encryptedNewKey,
          passwords: reEncryptedPasswords,
          cards: reEncryptedCards,
          notes: reEncryptedNotes,
          files: reEncryptedFiles,
          vaultCheckEncrypted: newVaultCheckEncrypted,
          vaultCheckIv: newVaultCheckIv
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        let errorText = 'Failed to update vault password';
        try {
          const errorData = await response.json();
          errorText = errorData.error || errorData.message || errorText;
        } catch (e) {
          // Ignore JSON parse errors
        }
        throw new Error(errorText);
      }

      // Store the new salt in memory for future use
      storeSalt(newSaltBase64);

      // Reset state
      setPassword('');
      setConfirmPassword('');
      setCurrentPassword('');

      // Call success callback and close
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change vault password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] p-6">
        <div className="flex flex-col items-center justify-center pt-4 pb-2">
          {/* Vault Icon */}
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
              Create Your New Vault Password
            </DialogTitle>
            <DialogDescription className="text-base max-w-md mx-auto text-center w-full">
              Choose a new strong password to protect your sensitive information. All your data will be re-encrypted with this new password.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto">
          <div className="space-y-3">
            <Label htmlFor="current-vault-password" className="text-sm font-medium block text-center">
              Current Vault Password
            </Label>
            <Input
              id="current-vault-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter current vault password"
              value={currentPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)}
              className="py-3 text-base rounded-lg"
            />
          </div>

          {/* PIN vs Password Selection */}
          <div className="flex justify-center gap-4 mb-6">
            <Button
              type="button"
              variant={passwordType === 'pin' ? 'default' : 'outline'}
              onClick={() => {
                setPasswordType('pin');
                setPassword('');
                setConfirmPassword('');
                setError('');
              }}
              className={`px-8 py-2 rounded-full ${passwordType === 'pin' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
            >
              Use PIN
            </Button>
            <Button
              type="button"
              variant={passwordType === 'password' ? 'default' : 'outline'}
              onClick={() => {
                setPasswordType('password');
                setPassword('');
                setConfirmPassword('');
                setError('');
              }}
              className={`px-8 py-2 rounded-full ${passwordType === 'password' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
            >
              Use Password
            </Button>
          </div>

          {/* New Password Input */}
          <div className="space-y-3">
            <Label htmlFor="new-vault-password" className="text-sm font-medium block text-center">
              {passwordType === 'pin' ? 'Enter Your New PIN' : 'Enter Your New Password'}
            </Label>
            <div className="relative">
              <Input
                id="new-vault-password"
                type={passwordType === 'pin' ? 'number' : (showPassword ? 'text' : 'password')}
                placeholder={passwordType === 'pin' ? 'e.g., 123456' : '••••••••'}
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                className="py-3 text-base rounded-lg pr-10 text-center"
                style={{ textAlign: 'center', paddingLeft: '2.5rem' }}
                autoFocus
              />
              {passwordType === 'password' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-orange-500 hover:text-orange-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </Button>
              )}
            </div>
            {passwordType === 'password' && (
              <p className="text-xs text-muted-foreground mt-1 text-center">Must be at least 8 characters.</p>
            )}
            {passwordType === 'pin' && (
              <p className="text-xs text-muted-foreground mt-1 text-center">Must be 4-6 digits.</p>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-3">
            <Label htmlFor="confirm-new-password" className="text-sm font-medium block text-center">
              Confirm {passwordType === 'pin' ? 'PIN' : 'Password'}
            </Label>
            <div className="relative">
              <Input
                id="confirm-new-password"
                type={passwordType === 'pin' ? 'number' : (showConfirmPassword ? 'text' : 'password')}
                placeholder={passwordType === 'pin' ? 'Re-enter PIN' : 'Re-enter password'}
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                className="py-3 text-base rounded-lg pr-10 text-center"
                style={{ textAlign: 'center', paddingLeft: '2.5rem' }}
              />
              {passwordType === 'password' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-orange-500 hover:text-orange-600"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </Button>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm p-4 bg-red-50 border border-red-200 rounded-lg text-center mt-4">
              {error}
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex flex-col gap-3 pt-6">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 text-base font-medium rounded-lg"
            >
              {isLoading ? 'Updating...' : 'Save New Vault Password'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="w-full py-3 text-base rounded-lg"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
