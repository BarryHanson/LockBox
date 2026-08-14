"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield } from 'lucide-react';

interface TwoFactorVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (verificationToken: string) => void;
  title?: string;
  description?: string;
  actionName?: string;
}

export function TwoFactorVerificationDialog({
  isOpen,
  onClose,
  onSuccess,
  title = "Two-Factor Authentication Required",
  description = "This action requires two-factor authentication. Please enter your 6-digit code or backup code.",
  actionName = "Verify"
}: TwoFactorVerificationDialogProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRequestEmail, setCanRequestEmail] = useState(true);
  const [emailSent, setEmailSent] = useState(false);

  const handleRequestEmailCode = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/2fa/email/send', {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send email code');
      }

      setCanRequestEmail(false);
      setEmailSent(true);
      setError(null);
      
      setTimeout(() => {
        setCanRequestEmail(true);
      }, 60000); // Allow requesting again after 1 minute

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) {
      setError('Please enter a verification code');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/2fa/verify-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid verification code');
      }

      const data = await response.json();
      
      if (data.success && data.verificationToken) {
        setCode('');
        setError(null);
        onSuccess(data.verificationToken);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCode('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label htmlFor="2fa-code" className="text-sm font-medium block mb-2">
              Verification Code
            </label>
            <Input
              id="2fa-code"
              type="text"
              placeholder="Enter 6-digit code or backup code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleVerify();
                }
              }}
              disabled={isLoading}
              autoFocus
              maxLength={64}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {emailSent && !error && (
            <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ Verification code sent to your email
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-2">
            <p>• Enter your 6-digit authenticator code</p>
            <p>• Or use one of your backup codes</p>
            <p>• Or request a code via email (if email 2FA is enabled)</p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleRequestEmailCode}
            disabled={isLoading || !canRequestEmail}
            className="w-full"
          >
            {canRequestEmail ? 'Send Code via Email' : 'Email Code Sent (wait 1min)'}
          </Button>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={isLoading || !code.trim()}
          >
            {isLoading ? 'Verifying...' : actionName}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
