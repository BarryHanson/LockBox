// animated-main.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Shield, Lock, Key, Fingerprint, Globe, CreditCard, FileText, Share2, ArrowRight, Check } from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.08 },
  },
};

export function AnimatedMain() {
  return (
    <main>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl float-glow" />
          <div className="absolute top-40 right-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl float-glow" style={{ animationDelay: '3s' }} />
        </div>

        <div className="container max-w-6xl mx-auto px-6 pt-32 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-sm font-medium text-primary mb-8"
            >
              <Shield className="w-3.5 h-3.5" />
              Zero-Knowledge Encryption
            </motion.div>

            <motion.h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6"
              {...fadeUp}
              transition={{ delay: 0.15 }}
            >
              Your passwords deserve{" "}
              <span className="bg-gradient-to-r from-primary to-primary-dark bg-clip-text text-transparent">
                real protection
              </span>
            </motion.h1>

            <motion.p
              className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10"
              {...fadeUp}
              transition={{ delay: 0.25 }}
            >
              End-to-end encrypted vault with zero-knowledge architecture.
              Your data is encrypted on your device before it ever leaves.
              We cannot read it. Nobody can.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-3 justify-center"
              {...fadeUp}
              transition={{ delay: 0.35 }}
            >
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 cta-pulse"
              >
                Start for free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href='/vault'
                className="inline-flex items-center justify-center gap-2 border border-border hover:bg-accent px-6 py-3 rounded-lg font-medium transition-all"
              >
                Open my vault
              </Link>
            </motion.div>

            <motion.p
              className="text-xs text-muted-foreground mt-6"
              {...fadeUp}
              transition={{ delay: 0.45 }}
            >
              No credit card required &middot; Free plan available forever
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="border-y border-border/50 bg-muted/30">
        <div className="container max-w-6xl mx-auto px-6 py-6">
          <motion.div
            className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              AES-256 Encryption
            </span>
            <span className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-primary" />
              Two-Factor Auth
            </span>
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Zero-Knowledge Proof
            </span>
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Access Anywhere
            </span>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container max-w-6xl mx-auto px-6 py-24">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Everything you need to stay secure
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            A complete security toolkit built with privacy-first design principles
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {[
            {
              icon: Lock,
              title: "Zero-Knowledge Vault",
              description: "All data is encrypted client-side before transmission. Even ByteLock cannot access your unencrypted data.",
            },
            {
              icon: Key,
              title: "Password Generator",
              description: "Create strong, unique passwords with customizable length, character types, and complexity requirements.",
            },
            {
              icon: CreditCard,
              title: "Secure Card Storage",
              description: "Store payment cards with the same military-grade encryption used for your passwords.",
            },
            {
              icon: Shield,
              title: "Breach Monitoring",
              description: "Check if your accounts have been compromised in known data breaches. Get alerts to take action fast.",
            },
            {
              icon: Share2,
              title: "Secure Sharing",
              description: "Share encrypted items with time-limited, one-time links. The recipient's access is cryptographically controlled.",
            },
            {
              icon: FileText,
              title: "Encrypted Notes & Files",
              description: "Store sensitive documents and notes with the same end-to-end encryption as your passwords.",
            },
          ].map((feature, index) => (
            <motion.div
              key={index}
              variants={fadeUp}
              className="group p-6 rounded-xl border border-border/50 bg-card hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="bg-muted/30 border-y border-border/50">
        <div className="container max-w-6xl mx-auto px-6 py-24">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              How ByteLock protects you
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Your master password never leaves your device. Here is what happens under the hood.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {[
              {
                step: "01",
                title: "You set a master password",
                description: "A cryptographic key is derived from your password on your device. The password itself is never sent to our servers.",
              },
              {
                step: "02",
                title: "Data is encrypted locally",
                description: "Every password, card, note, and file is encrypted with AES-256 on your device before being stored.",
              },
              {
                step: "03",
                title: "Only you can decrypt",
                description: "Without your master password, the encrypted data is unreadable. We store only ciphertext we cannot access.",
              },
            ].map((item, index) => (
              <motion.div key={index} variants={fadeUp} className="relative">
                <div className="text-6xl font-bold text-primary/10 mb-4">{item.step}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container max-w-6xl mx-auto px-6 py-24">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Start free and upgrade when you need more. No hidden fees, cancel anytime.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {[
            {
              name: "Free",
              price: "$0",
              description: "For personal use",
              features: [
                "Up to 50 passwords",
                "Password generator",
                "Secure notes",
                "Mobile access",
              ],
              cta: "Get Started",
              href: "/signup",
            },
            {
              name: "Pro",
              price: "$4.99",
              description: "For power users",
              features: [
                "Unlimited passwords",
                "Encrypted file storage (5 GB)",
                "Breach monitoring",
                "Secure sharing",
                "Priority support",
              ],
              highlighted: true,
              cta: "Upgrade to Pro",
              href: "/signup",
            },
            {
              name: "Family",
              price: "$9.99",
              description: "For your household",
              features: [
                "Everything in Pro",
                "Up to 5 members",
                "Shared vaults",
                "Admin controls",
                "24/7 support",
              ],
              cta: "Get Family Plan",
              href: "/signup",
            },
          ].map((plan, index) => (
            <motion.div
              key={index}
              variants={fadeUp}
              className={`relative flex flex-col rounded-xl border p-8 ${
                plan.highlighted
                  ? "border-primary bg-card shadow-xl shadow-primary/5 ring-1 ring-primary/10"
                  : "border-border/50 bg-card"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`w-full inline-flex justify-center items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    : "border border-border hover:bg-accent"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Testimonial / Trust Section */}
      <section className="bg-muted/30 border-y border-border/50">
        <div className="container max-w-4xl mx-auto px-6 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              Built by security engineers, for everyone
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              ByteLock uses the same cryptographic standards trusted by security researchers
              and privacy advocates worldwide.
            </p>
            <blockquote className="bg-card border border-border/50 rounded-xl p-8 max-w-2xl mx-auto">
              <p className="text-base italic leading-relaxed mb-4">
                &ldquo;Zero-knowledge architecture is not optional&mdash;it is essential. ByteLock ensures that
                even we cannot decrypt your vault. Your encryption keys are yours alone.&rdquo;
              </p>
              <footer className="text-sm font-medium text-muted-foreground">
                &mdash; The ByteLock Security Team
              </footer>
            </blockquote>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container max-w-6xl mx-auto px-6 py-24">
        <motion.div
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 p-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Take control of your digital security
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Join users worldwide who trust ByteLock to protect their most sensitive information.
            Start your free account today.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg font-medium transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
          >
            Get started for free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="container max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <h3 className="font-semibold mb-3">ByteLock</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Zero-knowledge password manager. Your data remains yours&mdash;always encrypted, never compromised.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href='/vault' className="hover:text-foreground transition-colors">Vault</Link></li>
                <li><Link href="#features" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Security</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><span>AES-256 Encryption</span></li>
                <li><span>Zero-Knowledge Proof</span></li>
                <li><span>SOC 2 Compliant</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} ByteLock. All rights reserved.</p>
            <div className="flex gap-6">
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
