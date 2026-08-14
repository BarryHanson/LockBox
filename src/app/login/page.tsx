"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, ArrowRight } from "lucide-react";
import CloudflareTurnstile from '@/components/CloudflareTurnstile';
import { useTwoFactor } from '@/components/TwoFactorProvider';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { requestTwoFactor } = useTwoFactor();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ||
    '';

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/vault');
    }
  }, [status, router]);

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!turnstileSiteKey) {
      setError('Captcha is not configured. Please contact support.');
      setIsLoading(false);
      return;
    }

    if (!turnstileToken) {
      setError('Please complete the captcha challenge.');
      setIsLoading(false);
      return;
    }

    try {
      // Only include TOTP code if 2FA is already required
      const payload = requiresTwoFactor
        ? { email, password, totpCode, turnstileToken }
        : { email, password, turnstileToken };

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setTurnstileResetKey((prev) => prev + 1);
        return;
      }

      if (data.requiresTwoFactor) {
        // Show 2FA modal using the global provider
        const method = data.method || 'email';
        try {
          setIsLoading(true);
          await requestTwoFactor({
            email,
            password,
            method,
            turnstileToken: turnstileToken || undefined,
          });

          // Cookie is set by the server — redirect to app
          localStorage.setItem('justLoggedIn', 'true');
          router.push('/vault');
        } catch (err) {
          // User cancelled 2FA modal
          setError('Two-factor authentication cancelled');
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // Login succeeded — cookie is set by the server as httpOnly
      localStorage.setItem('justLoggedIn', 'true');
      router.push('/vault');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Subtle background */}
      <div className="absolute inset-0 auth-bg-pattern opacity-40 dark:opacity-20" />
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />

      <div className="w-full max-w-[420px] relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-card border border-border/50 rounded-2xl p-8 shadow-xl shadow-black/5"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-6 group">
              <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-1.5 rounded-xl border border-primary/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
                <Image
                  src="/orange_logo_no_text.png"
                  alt="ByteLock Logo"
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
              </div>
              <span className="text-xl font-bold tracking-tight">
                ByteLock
              </span>
            </Link>
            <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to access your secure vault
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
                placeholder="Enter your password"
                required
              />
            </div>
            {requiresTwoFactor && (
              <div className="space-y-1.5">
                <label htmlFor="totpCode" className="text-sm font-medium">
                  Two-Factor Code
                </label>
                <input
                  id="totpCode"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-input rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
                  placeholder="000000 or backup code"
                  maxLength={64}
                  required={requiresTwoFactor}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code from your authenticator app or use a backup code
                </p>
              </div>
            )}
            <CloudflareTurnstile
              siteKey={turnstileSiteKey}
              onTokenChange={setTurnstileToken}
              resetKey={turnstileResetKey}
            />
            {!turnstileSiteKey && (
              <p className="text-destructive text-xs">Captcha is not configured.</p>
            )}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-input accent-primary" />
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => setShowForgotPasswordModal(true)}
                className="text-primary hover:text-primary/80 font-medium transition-colors text-sm"
              >
                Forgot password?
              </button>
            </div>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={isLoading || !turnstileSiteKey}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border/50 text-center text-sm text-muted-foreground">
            <p>
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Sign up for free
              </Link>
            </p>
          </div>
        </motion.div>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </main>
  );
}
