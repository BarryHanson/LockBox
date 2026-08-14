"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
  email: string;
  password: string;
  method: "email" | "totp";
  turnstileToken?: string;
}

export default function TwoFactorModal({
  isOpen,
  onClose,
  onSuccess,
  email,
  password,
  method,
  turnstileToken,
}: TwoFactorModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [canResend, setCanResend] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (isOpen && method === "email") {
      setCanResend(false);
      setResendCountdown(60);
    }
  }, [isOpen, method]);

  // Handle resend countdown
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => {
        setResendCountdown(resendCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (resendCountdown === 0 && !canResend && method === "email") {
      setCanResend(true);
    }
  }, [resendCountdown, canResend, method]);

  const handleResendCode = async () => {
    setError("");
    setIsLoading(true);
    setCanResend(false);

    try {
      const response = await fetch("/api/2fa/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend code");
      }

      setSuccessMessage("Verification code sent! Check your email.");
      setResendCountdown(60);
      setCode("");
      
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
      setCanResend(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (method === "email" && (!code || code.length !== 6)) {
      setError("Please enter a valid 6-digit code");
      setIsLoading(false);
      return;
    }

    if (method === "totp" && !code) {
      setError("Please enter your authenticator code");
      setIsLoading(false);
      return;
    }

    try {
      // Retry login with 2FA code + original CAPTCHA token
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          totpCode: code,
          turnstileToken,
        }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setSuccessMessage("Verification successful!");

      // Cookie is set by the server — call success callback
      setTimeout(() => {
        onSuccess(data.token || '');
      }, 500);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCode("");
    setError("");
    setSuccessMessage("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {method === "email" ? "Verify via Email" : "Two-Factor Authentication"}
          </DialogTitle>
          <DialogDescription>
            {method === "email"
              ? `Enter the 6-digit code sent to ${email}`
              : `Enter the code from your authenticator app`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Success Message */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-900/20 border border-green-700/30 text-green-400 p-3 rounded-lg text-sm"
              >
                {successMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-lg text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Code Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                {method === "email" ? "Email Code" : "Authenticator Code"}
              </label>
              <Input
                type="text"
                inputMode={method === "email" ? "numeric" : "text"}
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(
                    method === "email" ? e.target.value.replace(/\D/g, "") : e.target.value
                  )
                }
                className="text-center text-2xl tracking-widest font-mono"
                disabled={isLoading}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {method === "email"
                  ? "Enter the 6-digit code from your email"
                  : "Enter the 6-digit code from your authenticator app"}
              </p>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading || !code || code.length !== 6}
              className="w-full"
            >
              {isLoading ? "Verifying..." : "Verify"}
            </Button>
          </form>

          {/* Resend Code (Email only) */}
          {method === "email" && (
            <div className="pt-4 border-t border-border text-center">
              <p className="text-muted-foreground text-sm mb-2">
                Didn't receive the code?
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={handleResendCode}
                disabled={isLoading || !canResend}
                className="text-sm"
              >
                {isLoading
                  ? "Sending..."
                  : canResend
                  ? "Resend Code"
                  : `Resend in ${resendCountdown}s`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
