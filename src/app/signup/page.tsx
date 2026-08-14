"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import CloudflareTurnstile from '@/components/CloudflareTurnstile';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { validatePassword } from '@/lib/passwordValidation';

export default function SignUpPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    agreeToTerms: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
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

    if (!validatePassword(formData.password)) {
      setError('Password does not meet security requirements');
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          turnstileToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setTurnstileResetKey((prev) => prev + 1);
        throw new Error(data.message || 'Something went wrong');
      }

      // If email verification is required, redirect to verification page
      if (data.requiresEmailVerification) {
        router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`);
      } else {
        window.location.href = '/vault';
      }
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
            <h1 className="text-2xl font-bold mb-1">Create your account</h1>
            <p className="text-sm text-muted-foreground">
              Start securing your digital life today
            </p>
          </div>

          {/* Sign Up Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-medium">
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={formData.fullName}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
                placeholder="John Doe"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
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
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
                placeholder="Create a strong password"
                required
              />
              {formData.password && (
                <PasswordRequirements password={formData.password} className="mt-3" />
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors"
                placeholder="Confirm your password"
                required
              />
            </div>
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleChange}
                className="mt-0.5 rounded border-input accent-primary"
                required
              />
              <span className="text-muted-foreground leading-snug">
                I agree to the{" "}
                <Link
                  href="/terms"
                  className="text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
              </span>
            </label>
            <CloudflareTurnstile
              siteKey={turnstileSiteKey}
              onTokenChange={setTurnstileToken}
              resetKey={turnstileResetKey}
            />
            {!turnstileSiteKey && (
              <p className="text-destructive text-xs">Captcha is not configured.</p>
            )}
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
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border/50 text-center text-sm text-muted-foreground">
            <p>
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
