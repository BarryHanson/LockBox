"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [canResend, setCanResend] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    // Get email from search params
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    } else {
      // If no email in params and session exists, redirect to app
      if (status === "authenticated") {
        router.push('/vault');
      }
    }
  }, [searchParams, status, router]);

  // Handle resend countdown
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => {
        setResendCountdown(resendCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (resendCountdown === 0 && !canResend && email) {
      setCanResend(true);
    }
  }, [resendCountdown, canResend, email]);

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

    if (!code || code.length !== 6) {
      setError("Please enter a valid 6-digit code");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/2fa/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setSuccessMessage("Email verified successfully!");
      
      // Redirect to login with email pre-filled
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(email)}`);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card border-2 border-primary/10 rounded-2xl p-8 shadow-xl backdrop-blur"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-8 group">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-gradient-to-br from-primary/20 to-primary/5 p-1.5 rounded-full shadow-md shadow-primary/10 border border-primary/20 flex items-center justify-center group-hover:rotate-12 transition-transform"
              >
                <Image
                  src="/orange_logo_no_text.png"
                  alt="ByteLock"
                  width={36}
                  height={36}
                  className="rounded-full overflow-hidden"
                />
              </motion.div>
              <span className="text-2xl font-bold bg-gradient-to-r from-primary via-primary-hover to-primary-dark bg-clip-text text-transparent animate-gradient">
                ByteLock
              </span>
            </Link>
            <h1 className="text-2xl font-bold mb-2">Verify Your Email</h1>
            <p className="text-muted-foreground">
              Enter the 6-digit code we sent to <span className="font-semibold text-foreground">{email}</span>
            </p>
          </div>

          {/* Success Message */}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-900/20 border border-green-700/30 text-green-400 p-3 rounded-lg mb-6 text-sm"
            >
              {successMessage}
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-lg mb-6 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Code Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-center text-2xl tracking-widest font-mono transition-colors"
                disabled={isLoading}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2">
                Enter the 6-digit code from your email
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !code || code.length !== 6}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-primary/20"
            >
              {isLoading ? "Verifying..." : "Verify Email"}
            </button>
          </form>

          {/* Resend Code */}
          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-muted-foreground text-sm mb-3">
              Didn't receive the code?
            </p>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isLoading || !canResend}
              className="text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              {isLoading
                ? "Sending..."
                : canResend
                ? "Resend Code"
                : `Resend in ${resendCountdown}s`}
            </button>
          </div>

          {/* Footer Links */}
          <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground">
            <Link href="/signup" className="text-primary hover:text-primary/80 transition-colors">
              Back to Sign Up
            </Link>
            {" · "}
            <Link href="/login" className="text-primary hover:text-primary/80 transition-colors">
              Already Verified? Login
            </Link>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
