// animated-header.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export function AnimatedHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 w-full bg-background/80 backdrop-blur-xl border-b border-border/50 z-50">
      <nav className="container max-w-6xl mx-auto flex h-16 items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-1.5 rounded-xl border border-primary/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
              <Image
                src="/orange_logo_no_text.png"
                alt="ByteLock Logo"
                width={28}
                height={28}
                priority
                className="rounded-lg"
              />
            </div>
          </motion.div>
          <span className="text-lg font-bold tracking-tight">
            ByteLock
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            href="#features"
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
          >
            Features
          </Link>
          <Link
            href="#pricing"
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
          >
            Pricing
          </Link>
          <Link
            href="/privacy"
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
          >
            Terms
          </Link>
        </div>

        {/* Desktop Auth Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-all shadow-sm hover:shadow-md"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <div className="md:hidden flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl"
        >
          <div className="container max-w-6xl mx-auto px-6 py-4 flex flex-col gap-1">
            <Link
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
            >
              Pricing
            </Link>
            <Link
              href="/privacy"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
            >
              Terms
            </Link>
            <div className="border-t border-border/50 mt-2 pt-3 flex flex-col gap-2">
              <Link
                href="/login"
                className="px-3 py-2.5 text-sm font-medium text-center rounded-lg border border-border hover:bg-accent transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-3 py-2.5 text-sm font-medium text-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </header>
  );
}
