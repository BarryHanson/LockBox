"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from "next-auth/react";
import { useUser } from '@/hooks/useUser';
import { generateEncryptionKey, encryptEncryptionKey, encrypt, decryptEncryptionKey, storeSalt, deriveKeyFromPassword, arrayBufferToBase64, retrieveEncryptionKey, decryptObject, exportCryptoKey, base64ToArrayBuffer, decrypt, clearEncryptionKey } from '@/lib/clientCrypto';
import { VaultPasswordPrompt } from '@/components/VaultPasswordPrompt';
import { ChangeVaultPasswordPrompt } from '@/components/ChangeVaultPasswordPrompt';
import { useVault } from '@/components/providers/VaultProvider';
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, Shield, CreditCard, Clock, Download, Trash2, LogOut } from 'lucide-react';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { validatePassword } from '@/lib/passwordValidation';
import { TwoFactorVerificationDialog } from '@/components/TwoFactorVerificationDialog';

export default function AccountPage() {
  const { data: session, status: authStatus } = useSession();
  const { user, loading: userLoading } = useUser();
  const userEmail = session?.user?.email ?? '';
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{
    qrCode: string;
    secret: string;
    backupCodes?: string[];
  } | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [emailTwoFactorEnabled, setEmailTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [verificationCode, setVerificationCode] = useState('');
  const [disableTwoFactorPassword, setDisableTwoFactorPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showExportVaultPrompt, setShowExportVaultPrompt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeletePasswordConfirm, setShowDeletePasswordConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [dbUser, setDbUser] = useState<any | null>(null);
  const [loginHistory, setLoginHistory] = useState<Array<any>>([]);
  const [changingPlan, setChangingPlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('security');
  const [showChangeVaultUnlockPrompt, setShowChangeVaultUnlockPrompt] = useState(false);
  const [showChangeVaultPasswordPrompt, setShowChangeVaultPasswordPrompt] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [pending2FAAction, setPending2FAAction] = useState<'export' | 'changePassword' | 'changeVault' | 'delete' | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  // Subscription-derived helpers — mirror main app logic (prefer authoritative DB user then useUser)
  const plan = (
    (dbUser?.userSubscription?.plan) ??
    ((user as any)?.userSubscription?.plan) ??
    ((user as any)?.subscription?.plan) ??
    'FREE'
  ) as string;
  const planDisplay = plan === 'PRO' ? 'Pro' : plan === 'TEAM' ? 'Team' : 'Free';

  const getSubscriptionExpiry = () => {
    const raw = dbUser?.userSubscription?.expiresAt
      ?? (user as any)?.userSubscription?.expiresAt
      ?? (user as any)?.subscription?.expiresAt
      ?? dbUser?.userSubscription?.renewalDate
      ?? (user as any)?.userSubscription?.renewalDate
      ?? dbUser?.expiresAt
      ?? null;
    if (!raw) return 'N/A';
    try { return new Date(raw).toLocaleDateString(); } catch { return String(raw); }
  };

  // Helper to check if 2FA verification is required
  const require2FAForAction = (action: 'export' | 'changePassword' | 'changeVault' | 'delete'): boolean => {
    return twoFactorEnabled || emailTwoFactorEnabled;
  };

  // Helper to initiate 2FA verification for an action
  const initiate2FAVerification = (action: 'export' | 'changePassword' | 'changeVault' | 'delete') => {
    if (require2FAForAction(action)) {
      setPending2FAAction(action);
      setShow2FADialog(true);
      return true;
    }
    return false;
  };

  // Function to export account data securely (no sensitive fields)
  const exportAccountData = async () => {
    // Check if 2FA verification is required
    if (require2FAForAction('export')) {
      initiate2FAVerification('export');
      return;
    }
    
    // If no 2FA required, proceed directly
    await executeExportData(null);
  };

  const executeExportData = async (token: string | null) => {
    // Ensure user is authenticated (use same check as main app)
    if (!(authStatus === 'authenticated' || !!user)) {
      setMessage({ text: 'Please sign in to export account data', type: 'error' });
      return;
    }
    try {
      setIsLoading(true);
      setMessage(null);

      // Ensure we have an in-memory CryptoKey
      const masterKey = await retrieveEncryptionKey();
      if (!masterKey) {
        // Prompt user to unlock vault (VaultPasswordPrompt handled elsewhere)
        setShowExportVaultPrompt(true);
        setIsLoading(false);
        return;
      }

      let userRes = await fetch('/api/user/me', {
        credentials: 'include'
      });

      const [passwordsRes, notesRes, cardsRes, filesRes] = await Promise.all([
        fetch('/api/passwords', { credentials: 'include' }),
        fetch('/api/notes', { credentials: 'include' }),
        fetch('/api/cards', { credentials: 'include' }),
        fetch('/api/files', { credentials: 'include' })
      ]);

      if (!userRes.ok || !passwordsRes.ok || !notesRes.ok || !cardsRes.ok) {
        throw new Error('Failed to fetch account data');
      }

      const filesAllowedStatus = filesRes.ok || filesRes.status === 403;
      if (!filesAllowedStatus) {
        throw new Error('Failed to fetch account files');
      }

      const userData = await userRes.json();
      const rawPasswords = await passwordsRes.json();
      const rawNotes = await notesRes.json();
      const rawCards = await cardsRes.json();
      const rawFiles = filesRes.ok ? await filesRes.json() : [];

      // Decrypt passwords (if encrypted)
      const passwords = await Promise.all(rawPasswords.map(async (p: any) => {
        try {
          if (p.encryptionData) {
            const decrypted = await decryptObject(p, masterKey, ['password', 'username'] as const, p.encryptionData);
            return {
              id: p.id,
              title: p.title,
              username: decrypted.username ?? p.username,
              password: decrypted.password ?? null,
              url: p.url,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            };
          }
          return {
            id: p.id,
            title: p.title,
            username: p.username,
            password: p.password ?? null,
            url: p.url,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          };
        } catch (err) {
          console.error('Failed to decrypt password for export:', p.id, err);
          return { id: p.id, title: p.title, username: null, password: null, url: p.url, createdAt: p.createdAt, updatedAt: p.updatedAt };
        }
      }));

      // Decrypt notes (handle per-field salt/iv like elsewhere)
      const exportedKey = await exportCryptoKey(masterKey);
      const notes = await Promise.all(rawNotes.map(async (n: any) => {
        let title = n.title ?? null;
        let content = n.content ?? null;
        try {
          if (n.encryptedTitle && n.encryptionMetadata?.title?.iv && n.encryptionMetadata?.title?.salt) {
            const ivTitle = base64ToArrayBuffer(n.encryptionMetadata.title.iv);
            const saltTitle = base64ToArrayBuffer(n.encryptionMetadata.title.salt);
            const { key: derivedTitleKey } = await deriveKeyFromPassword(exportedKey, new Uint8Array(saltTitle));
            title = await decrypt(n.encryptedTitle, derivedTitleKey, new Uint8Array(ivTitle));
          }
          if (n.encryptedContent && n.encryptionMetadata?.content?.iv && n.encryptionMetadata?.content?.salt) {
            const ivContent = base64ToArrayBuffer(n.encryptionMetadata.content.iv);
            const saltContent = base64ToArrayBuffer(n.encryptionMetadata.content.salt);
            const { key: derivedContentKey } = await deriveKeyFromPassword(exportedKey, new Uint8Array(saltContent));
            content = await decrypt(n.encryptedContent, derivedContentKey, new Uint8Array(ivContent));
          }
        } catch (err) {
          console.error('Failed to decrypt note for export:', n.id, err);
        }
        return {
          id: n.id,
          title,
          content,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        };
      }));

      // Decrypt cards (if encrypted)
      const cards = await Promise.all(rawCards.map(async (c: any) => {
        try {
          if (c.encryptionData) {
            const decrypted = await decryptObject(c, masterKey, ['cardNumber', 'cvv', 'billingAddress'] as const, c.encryptionData);
            return {
              id: c.id,
              name: c.name,
              cardNumber: decrypted.cardNumber ?? c.cardNumber,
              expiryMonth: c.expiryMonth,
              expiryYear: c.expiryYear,
              cvv: decrypted.cvv ?? c.cvv,
              billingAddress: decrypted.billingAddress ?? c.billingAddress ?? null,
              tags: Array.isArray(c.tags) ? c.tags : [],
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
            };
          }

          return {
            id: c.id,
            name: c.name,
            cardNumber: c.cardNumber,
            expiryMonth: c.expiryMonth,
            expiryYear: c.expiryYear,
            cvv: c.cvv,
            billingAddress: c.billingAddress ?? null,
            tags: Array.isArray(c.tags) ? c.tags : [],
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          };
        } catch (err) {
          console.error('Failed to decrypt card for export:', c.id, err);
          return {
            id: c.id,
            name: c.name,
            cardNumber: null,
            expiryMonth: c.expiryMonth,
            expiryYear: c.expiryYear,
            cvv: null,
            billingAddress: null,
            tags: Array.isArray(c.tags) ? c.tags : [],
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          };
        }
      }));

      const files = rawFiles.map((f: any) => ({
        id: f.id,
        fileName: f.fileName,
        encryptedName: f.encryptedName ?? null,
        storageKey: f.storageKey ?? null,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
        iv: f.iv ?? null,
        authTag: f.authTag ?? null,
        encryptionMetadata: f.encryptionMetadata ?? null,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));

      const exportData = {
        user: {
          email: userData.email,
          name: userData.name,
          createdAt: userData.createdAt,
          updatedAt: userData.updatedAt,
        },
        passwords,
        notes,
        cards,
        files,
        exportMetadata: {
          filesIncluded: filesRes.ok,
          filesReason: filesRes.ok ? null : 'Files are only available on PRO plan',
        }
      };

      const jsonData = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lockbox-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage({ text: 'Account data exported successfully (decrypted)', type: 'success' });
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ text: error instanceof Error ? error.message : 'Failed to export account data', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Hooks
  const { isVaultUnlocked } = useVault();

  // Fetch initial 2FA state on mount and when auth status changes
  useEffect(() => {
    const fetchTwoFactorState = async () => {
      try {
        let response = await fetch('/api/2fa/status', {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          setTwoFactorEnabled(Boolean(data.twoFactorEnabled));
          setEmailTwoFactorEnabled(Boolean(data.emailTwoFactorEnabled));
        } else {
          console.error('2FA status request failed:', response.status, response.statusText);
          setTwoFactorEnabled(false);
          setEmailTwoFactorEnabled(false);
        }
      } catch (err) {
        setTwoFactorEnabled(false);
        setEmailTwoFactorEnabled(false);
      } finally {
        setTwoFactorLoading(false);
      }
    };
    
    // fetch immediately when component mounts
    fetchTwoFactorState();
  }, []);

  // Refresh 2FA state manually (called after enable/disable)
  const refreshTwoFactorState = useCallback(async () => {
    try {
      let response = await fetch('/api/2fa/status', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setTwoFactorEnabled(Boolean(data.enabled));
      } else {
      }
    } catch (err) {
    }
  }, []);

  // Fetch DB user (with subscription and loginHistory) on auth
  const fetchDbUser = useCallback(async () => {
    try {
      const res = await fetch('/api/user/me', {
        credentials: 'include'
      });

      if (res.ok) {
        const d = await res.json();
        setDbUser(d);
        setSelectedPlan(d?.userSubscription?.plan ?? 'FREE');
        setLoginHistory(d?.loginHistory ?? []);
      } else {
        setDbUser(null);
        setLoginHistory([]);
      }
    } catch (err) {
      console.error('fetchDbUser error', err);
      setDbUser(null);
    }
  }, []);

  useEffect(() => {
    // Mirror main app: fetch when session is authenticated or useUser has a user.
    if (authStatus === 'authenticated' || !!user) {
      fetchDbUser();
    } else {
      setDbUser(null);
    }
  }, [authStatus, user, fetchDbUser]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!validatePassword(newPassword)) {
      setMessage({ text: 'New password does not meet security requirements', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'New passwords do not match', type: 'error' });
      return;
    }
    
    // Check if 2FA verification is required
    if (require2FAForAction('changePassword')) {
      initiate2FAVerification('changePassword');
      return;
    }
    
    // If no 2FA required, proceed directly
    await executePasswordChange(null);
  };

  const executePasswordChange = async (token: string | null) => {
    setIsLoading(true);
    try {
      const requestBody: any = { 
        currentPassword, 
        newPassword, 
        confirmPassword 
      };
      
      if (token) {
        requestBody.verificationToken = token;
      }
      
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const data = await response.json();
        if (data.requires2FA) {
          initiate2FAVerification('changePassword');
          return;
        }
        throw new Error(data.error || data.message || 'Failed to change password');
      }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage({ text: 'Password changed successfully', type: 'success' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Failed to change password', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Manage subscription: change plan
  const handleChangePlan = async () => {
    if (!selectedPlan) return;
    try {
      setChangingPlan(true);
      const res = await fetch('/api/user/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to update subscription');
      }
      await fetchDbUser();
      setMessage({ text: 'Subscription updated', type: 'success' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Failed to update subscription', type: 'error' });
    } finally {
      setChangingPlan(false);
    }
  };

  // Fetch login history explicitly (if needed)
  const fetchLoginHistory = async () => {
    try {
      const res = await fetch('/api/auth/login-history', {
        credentials: 'include'
      });
      if (res.ok) {
        const entries = await res.json();
        setLoginHistory(entries);
      }
    } catch (err) {
      console.error('fetchLoginHistory error', err);
    }
  };

  // Delete account action
  const deleteAccount = async (password?: string) => {
    // Check if 2FA verification is required
    if (require2FAForAction('delete')) {
      initiate2FAVerification('delete');
      return;
    }
    
    // If no 2FA required, proceed directly
    await executeDeleteAccount(null);
  };

  const executeDeleteAccount = async (token: string | null) => {
    try {
      setIsLoading(true);
      const opts: RequestInit = {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      };
      
      const bodyData: any = {};
      if (deletePassword) {
        bodyData.password = deletePassword;
      }
      if (token) {
        bodyData.verificationToken = token;
      }
      
      if (Object.keys(bodyData).length > 0) {
        opts.body = JSON.stringify(bodyData);
      }
      
      const res = await fetch('/api/user/delete', opts);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.requires2FA) {
          initiate2FAVerification('delete');
          return;
        }
        throw new Error(data?.error || `Failed to delete account (${res.status})`);
      }
      // Clear local encryption state and storage
      try { clearEncryptionKey(); } catch (e) { /* best-effort */ }
      localStorage.removeItem('encryptedMasterKey');
      localStorage.removeItem('encryptionKeyBackup');
      localStorage.removeItem('rawEncryptionKey');
      localStorage.removeItem('encryptionKeyTimestamp');
      sessionStorage.removeItem('encryptionKey');
      sessionStorage.removeItem('rawEncryptionKey');
      sessionStorage.removeItem('encryptionKeyTimestamp');

      // Sign out and redirect to login
      await signOut({ redirect: true, callbackUrl: '/login' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Failed to delete account', type: 'error' });
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
      setShowDeletePasswordConfirm(false);
      setDeletePassword('');
    }
  };

  // Handler for change vault password with 2FA
  const handleChangeVaultPassword = async () => {
    // Check if 2FA verification is required
    if (require2FAForAction('changeVault')) {
      initiate2FAVerification('changeVault');
      return;
    }
    
    // If no 2FA required, proceed directly
    await executeChangeVaultPassword(null);
  };

  const executeChangeVaultPassword = async (token: string | null) => {
    // Check if vault is already unlocked (returns in-memory CryptoKey if available)
    const masterKey = await retrieveEncryptionKey();
    setShowChangeVaultUnlockPrompt(true);
  };

  // Handler for successful 2FA verification (defined after execute functions)
  const handle2FASuccess = (token: string) => {
    setVerificationToken(token);
    setShow2FADialog(false);
    
    // Execute the pending action
    if (pending2FAAction === 'export') {
      executeExportData(token);
    } else if (pending2FAAction === 'changePassword') {
      executePasswordChange(token);
    } else if (pending2FAAction === 'changeVault') {
      executeChangeVaultPassword(token);
    } else if (pending2FAAction === 'delete') {
      executeDeleteAccount(token);
    }
    
    setPending2FAAction(null);
  };

  return (
    <main className="min-h-screen bg-background">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link href='/vault' className="text-sm text-muted-foreground hover:text-primary transition-colors mb-4 inline-block">← Back to Dashboard</Link>
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">Account Settings</h1>
              {userEmail && <p className="text-muted-foreground">Signed in as {userEmail}</p>}
            </div>
            <Button variant="ghost" onClick={() => setShowLogoutConfirm(true)}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-lg px-4 py-3 mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
          >
            {message.text}
          </motion.div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-4 mb-8">
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Billing</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
            <TabsTrigger value="data" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Data</span>
            </TabsTrigger>
          </TabsList>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="max-w-lg space-y-4">
                  <div>
                    <label htmlFor="currentPassword" className="text-sm font-medium block mb-1">Current Password</label>
                    <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="newPassword" className="text-sm font-medium block mb-1">New Password</label>
                    <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                    {newPassword && (
                      <PasswordRequirements password={newPassword} className="mt-3" />
                    )}
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="text-sm font-medium block mb-1">Confirm New Password</label>
                    <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Button type="submit" disabled={isLoading}>{isLoading ? 'Updating…' : 'Update Password'}</Button>
                    <Button type="button" variant="outline" onClick={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}>Clear</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>Add an extra layer of security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {twoFactorLoading && (
                  <p className="text-sm text-muted-foreground">Loading 2FA status...</p>
                )}
                
                {!twoFactorLoading && emailTwoFactorEnabled && !twoFactorEnabled && (
                  <div className="space-y-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="text-primary text-lg">✓</div>
                      <div>
                        <p className="font-medium text-primary">Email 2FA Active</p>
                        <p className="text-sm text-primary/70 mt-1">You're currently using email for two-factor authentication. Upgrade to an authenticator app for stronger security.</p>
                      </div>
                    </div>
                    <Button onClick={async () => {
                      try {
                        setIsLoading(true);
                        const res = await fetch('/api/2fa/setup', { method: 'POST', credentials: 'include' });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Failed to prepare 2FA');
                        setTwoFactorSetup(data);
                      } catch (err) {
                        setMessage({ text: err instanceof Error ? err.message : 'Failed to setup 2FA', type: 'error' });
                      } finally {
                        setIsLoading(false);
                      }
                    }} disabled={isLoading} className="w-full">
                      Enable Authenticator App
                    </Button>
                  </div>
                )}
                
                {!twoFactorLoading && !twoFactorSetup && !twoFactorEnabled && !emailTwoFactorEnabled && (
                  <Button onClick={async () => {
                    try {
                      setIsLoading(true);
                      const res = await fetch('/api/2fa/setup', { method: 'POST', credentials: 'include' });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to prepare 2FA');
                      setTwoFactorSetup(data);
                    } catch (err) {
                      setMessage({ text: err instanceof Error ? err.message : 'Failed to setup 2FA', type: 'error' });
                    } finally {
                      setIsLoading(false);
                    }
                  }} disabled={isLoading}>Enable 2FA</Button>
                )}

                {!twoFactorLoading && twoFactorEnabled && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-green-600">✓ Two-factor authentication is enabled</p>
                    <div className="grid gap-3">
                      <Input
                        placeholder="Enter 6-digit code or backup code"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        maxLength={64}
                      />
                      <Input
                        type="password"
                        placeholder="Or enter your account password to disable 2FA"
                        value={disableTwoFactorPassword}
                        onChange={(e) => setDisableTwoFactorPassword(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="destructive" onClick={async () => {
                        try {
                          setIsLoading(true);
                          const res = await fetch('/api/2fa/disable', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              code: verificationCode,
                              accountPassword: disableTwoFactorPassword,
                            }),
                            credentials: 'include'
                          });
                          if (!res.ok) {
                            const data = await res.json();
                            throw new Error(data.error || 'Failed to disable 2FA');
                          }
                          await refreshTwoFactorState();
                          setVerificationCode('');
                          setDisableTwoFactorPassword('');
                          setMessage({ text: '2FA disabled', type: 'success' });
                        } catch (err) {
                          setMessage({ text: err instanceof Error ? err.message : 'Failed to disable 2FA', type: 'error' });
                        } finally {
                          setIsLoading(false);
                        }
                      }} disabled={isLoading}>Disable</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use either a current authenticator/backup code, or your account password for recovery.
                    </p>
                  </div>
                )}

                {!twoFactorLoading && twoFactorSetup && !twoFactorEnabled && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-3">Scan with your authenticator app</p>
                      <div className="inline-block p-4 bg-white rounded-lg border border-border">
                        <QRCodeSVG value={twoFactorSetup.qrCode} size={180} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input placeholder="Enter 6-digit code" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} maxLength={6} />
                      <Button onClick={async () => {
                        try {
                          setIsLoading(true);
                          const res = await fetch('/api/2fa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verificationCode }), credentials: 'include' });
                          if (!res.ok) {
                            const data = await res.json();
                            throw new Error(data.error || 'Failed to verify code');
                          }
                          setTwoFactorSetup(null);
                          setVerificationCode('');
                          await refreshTwoFactorState();
                          setMessage({ text: '2FA enabled successfully', type: 'success' });
                        } catch (err) {
                          setMessage({ text: err instanceof Error ? err.message : 'Failed to verify code', type: 'error' });
                        } finally {
                          setIsLoading(false);
                        }
                      }} disabled={isLoading}>Verify</Button>
                    </div>
                    {twoFactorSetup.backupCodes && twoFactorSetup.backupCodes.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                        <p className="text-sm font-medium text-amber-900 mb-2">Save these backup codes:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {twoFactorSetup.backupCodes.map((c, i) => <code key={i} className="font-mono text-sm bg-white p-2 rounded border">{c}</code>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vault Security</CardTitle>
                <CardDescription>Manage your encrypted vault settings</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleChangeVaultPassword}>Change Vault Password</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Current Plan
                </CardTitle>
                <CardDescription>Manage your subscription</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Plan</span>
                    <span className="text-lg font-bold text-primary">{planDisplay}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Renewal Date</span>
                    <span className="text-sm text-muted-foreground">{getSubscriptionExpiry()}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => { window.location.href = '/vault/account/upgrade'; }}>Change Plan</Button>
                  <Button variant="outline" onClick={() => fetchDbUser()}>Refresh</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Login History
                </CardTitle>
                <CardDescription>Recent account activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={() => fetchLoginHistory()}>Refresh</Button>
                  <Button variant="outline" size="sm" onClick={() => setLoginHistory([])}>Clear</Button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {loginHistory.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No login history</p>}
                  {loginHistory.map((h: any) => (
                    <div key={h.id} className="p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="flex justify-between items-start mb-1 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{h.ip}</p>
                          <p className="text-xs text-muted-foreground">{h.city || 'Unknown city'} • {h.deviceType || 'Unknown device'}</p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(h.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{h.userAgent}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Data Tab */}
          <TabsContent value="data" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Export Data
                </CardTitle>
                <CardDescription>Download your account data</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">Export all your passwords and notes in JSON format.</p>
                <Button onClick={async () => {
                  if (isVaultUnlocked) { setIsLoading(true); await exportAccountData(); setIsLoading(false); }
                  else setShowExportVaultPrompt(true);
                }} disabled={isLoading}>{isLoading ? 'Preparing export…' : 'Export Account Data'}</Button>
              </CardContent>
            </Card>

            <Card className="border-red-200 dark:border-red-900">
              <CardHeader>
                <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">Permanently delete your account and all associated data.</p>
                <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={isLoading}>
                  Delete Account
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {showExportVaultPrompt && (
        <VaultPasswordPrompt
          isOpen={showExportVaultPrompt}
          onClose={() => setShowExportVaultPrompt(false)}
          onSuccess={async () => { setShowExportVaultPrompt(false); setIsLoading(true); await exportAccountData(); setIsLoading(false); }}
          isSetup={false}
        />
      )}

      {showChangeVaultUnlockPrompt && (
        <VaultPasswordPrompt
          isOpen={showChangeVaultUnlockPrompt}
          onClose={() => setShowChangeVaultUnlockPrompt(false)}
          onSuccess={() => { setShowChangeVaultUnlockPrompt(false); setShowChangeVaultPasswordPrompt(true); }}
          isSetup={false}
        />
      )}

      {showChangeVaultPasswordPrompt && (
        <ChangeVaultPasswordPrompt
          isOpen={showChangeVaultPasswordPrompt}
          onClose={() => setShowChangeVaultPasswordPrompt(false)}
          onSuccess={() => { 
            setShowChangeVaultPasswordPrompt(false);
            setMessage({ text: 'Vault password updated successfully', type: 'success' });
          }}
        />
      )}

      {/* In-page Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={(val) => setShowDeleteConfirm(val)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Account Deletion</DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all associated data. This action cannot be undone.
            </DialogDescription>
            <div className="flex items-center gap-3 justify-end mt-4">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => { setShowDeleteConfirm(false); setShowDeletePasswordConfirm(true); }} disabled={isLoading}>
                Continue to confirm
              </Button>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Password Confirmation Modal for Deletion */}
      <Dialog open={showDeletePasswordConfirm} onOpenChange={(val) => {
        if (!val) {
          setShowDeletePasswordConfirm(false);
          setShowDeleteConfirm(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm with Account Password</DialogTitle>
            <DialogDescription>Enter your account password to permanently delete your account.</DialogDescription>
            <div className="mb-4 mt-4">
              <label className="text-sm block mb-1">Password</label>
              <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoFocus />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <Button variant="ghost" onClick={() => { setShowDeletePasswordConfirm(false); setShowDeleteConfirm(true); }}>Back</Button>
              <Button variant="destructive" onClick={() => deleteAccount(deletePassword)} disabled={isLoading || !deletePassword}>
                {isLoading ? 'Deleting…' : 'Delete account'}
              </Button>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out? Your vault will be locked and you'll need to enter your vault password again when you return.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowLogoutConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={async () => {
              setShowLogoutConfirm(false);
              try {
                // Clear encryption keys from local storage
                clearEncryptionKey();
                
                // Call logout API
                await fetch('/api/auth/logout', {
                  method: 'POST',
                  credentials: 'include'
                });
                
                // Redirect to login page
                window.location.href = '/login';
              } catch (error) {
                console.error('Error during logout:', error);
                // Still redirect to login even on error
                window.location.href = '/login';
              }
            }}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Vault Password Modal */}

      {/* Two-Factor Verification Dialog */}
      <TwoFactorVerificationDialog
        isOpen={show2FADialog}
        onClose={() => {
          setShow2FADialog(false);
          setPending2FAAction(null);
        }}
        onSuccess={handle2FASuccess}
        title="Two-Factor Authentication Required"
        description={
          pending2FAAction === 'export' ? 'Exporting your account data requires two-factor authentication.' :
          pending2FAAction === 'changePassword' ? 'Changing your password requires two-factor authentication.' :
          pending2FAAction === 'changeVault' ? 'Changing your vault password requires two-factor authentication.' :
          pending2FAAction === 'delete' ? 'Deleting your account requires two-factor authentication.' :
          'This action requires two-factor authentication.'
        }
        actionName="Verify"
      />
    </main>
  );
}
