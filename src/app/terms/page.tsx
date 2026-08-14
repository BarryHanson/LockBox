"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <div className="pt-32 pb-24">
        <div className="container max-w-4xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 text-primary hover:text-primary-hover transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
            <h1 className="text-5xl font-bold mb-4">Terms of Service</h1>
            <p className="text-lg text-muted-foreground">Last modified: March 1st, 2026</p>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="prose prose-invert max-w-none space-y-8"
          >
            <section className="space-y-4">
              <h2 className="text-2xl font-bold">1. Acceptance of Terms</h2>
              <p>
                By accessing and using ByteLock ("Service"), you accept and agree to be bound by the terms and provision of this 
                agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">2. Definition of Service</h2>
              <p>
                ByteLock is an end-to-end encrypted password manager and digital vault service designed to securely store and 
                manage sensitive information including passwords, payment card details, secure notes, and files. The Service 
                includes web applications, mobile applications, browser extensions, and related APIs.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">3. License Grant</h2>
              <p>
                Subject to your compliance with these Terms of Service, ByteLock grants you a limited, non-exclusive, 
                non-transferable license to use ByteLock for personal, non-commercial purposes. You may not reproduce, duplicate, 
                copy, sell, resell, or exploit any portion of ByteLock without express written permission from ByteLock.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">4. Account Creation & Responsibility</h2>
              <p>
                To use ByteLock, you may need to create an account. You are responsible for:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Providing accurate, current, and complete information</li>
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>Maintaining the security of your vault encryption key(s)</li>
                <li>Notifying ByteLock immediately of any unauthorized access</li>
                <li>All activities that occur under your account</li>
              </ul>
              <p className="mt-4">
                You acknowledge that you are solely responsible for the protection of your encryption keys. ByteLock cannot 
                recover lost or forgotten vault passwords—they are irreversibly derived from your master password.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">5. Encryption & Data Recovery</h2>
              <p>
                <strong>Important:</strong> ByteLock uses end-to-end encryption, which means that all your vault data is encrypted 
                on your device and cannot be decrypted by ByteLock servers. This provides maximum security but has important implications:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>ByteLock cannot decrypt, view, or recover your encrypted vault contents</li>
                <li>If you lose your master password, your vault cannot be recovered</li>
                <li>Backup and recovery options are provided to help protect against data loss</li>
                <li>You are responsible for safely storing your recovery codes, if provided</li>
                <li>ByteLock is not liable for data loss resulting from forgotten passwords</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">6. Acceptable Use Policy</h2>
              <p>
                You agree not to use ByteLock for any illegal or unauthorized purpose, or in any way that violates any applicable 
                law or regulation. Specifically, you agree not to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Attempt to unauthorized access to ByteLock systems or networks</li>
                <li>Use ByteLock to store information obtained through illegal means</li>
                <li>Transmit any viruses, malware, or malicious code</li>
                <li>Interfere with or disrupt the integrity or performance of the Service</li>
                <li>Reverse engineer, decompile, or disassemble ByteLock code</li>
                <li>Use ByteLock for any purpose that could harm, threaten, or exploit others</li>
                <li>Engage in any form of fraud, money laundering, or financial crime</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">7. User Content & Vault Data</h2>
              <p>
                ByteLock allows you to store sensitive information in your vault ("User Content"). You retain full ownership of 
                all User Content. The encryption ensures that only you can access your content.
              </p>
              <p>
                You represent and warrant that you have the right to store all User Content and that it does not violate any 
                applicable laws or third-party rights. You agree not to store information obtained through illegal means or that 
                facilitates illegal activity.
              </p>
              <p>
                ByteLock does not monitor, filter, or review User Content. However, ByteLock reserves the right to access or 
                disclose your account information if required by law or legal process, provided such disclosure is technically 
                possible (which is impossible for end-to-end encrypted content).
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">8. Third-Party Services & Integrations</h2>
              <p>
                ByteLock may integrate with third-party services such as email providers, payment processors, and security databases. 
                These third-party services are governed by their own terms of service and privacy policies. ByteLock is not responsible 
                for third-party services or their practices.
              </p>
              <p>
                When you integrate ByteLock with third-party services, you grant ByteLock permission to access only the necessary 
                information to facilitate the integration. Your vault data remains encrypted and is not shared with third parties.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">9. Subscription & Billing</h2>
              <p>
                ByteLock offers both free and premium subscription plans. By subscribing to a premium plan, you agree to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Pay all subscription fees at the agreed-upon rate</li>
                <li>Allow ByteLock to charge your payment method on a recurring basis</li>
                <li>Notify ByteLock of any changes to your payment information</li>
                <li>Be responsible for any applicable taxes on subscriptions</li>
              </ul>
              <p className="mt-4">
                Subscriptions renew automatically unless canceled. You can cancel at any time through your account settings. 
                Refunds are provided according to our refund policy. ByteLock may change pricing with 30 days' notice.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">10. Disclaimer of Warranties</h2>
              <p>
                BYTELOCK IS PROVIDED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. 
                BYTELOCK DISCLAIMS ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR 
                PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p>
                While ByteLock uses industry-standard security measures, ByteLock does not guarantee that the Service will be 
                uninterrupted, secure, or error-free. Security vulnerabilities or breaches, while highly unlikely given our 
                end-to-end encryption model, are not guaranteed to be prevented.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">11. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, BYTELOCK SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, REVENUE, OR PROFITS, EVEN IF ADVISED OF THE POSSIBILITY 
                OF SUCH DAMAGES.
              </p>
              <p>
                ByteLock's total liability shall not exceed the amount you paid for ByteLock services in the 12 months preceding 
                the claim. Some jurisdictions do not allow limitations of liability, so this limitation may not apply to you.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">12. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless ByteLock, its officers, directors, employees, and agents from 
                any claims, damages, losses, or expenses (including attorney's fees) arising from:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Your use of ByteLock or violation of these Terms</li>
                <li>Your User Content or violation of third-party rights</li>
                <li>Any illegal activity conducted through your account</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">13. Service Modifications & Termination</h2>
              <p>
                ByteLock reserves the right to modify, suspend, or discontinue the Service at any time with or without notice. 
                ByteLock may also terminate your account if you violate these Terms or engage in prohibited activities.
              </p>
              <p>
                Upon termination, you lose access to the Service, but your encrypted vault data remains on our servers. You may 
                request deletion of your account and associated metadata, after which your data will be permanently deleted.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">14. Changes to Terms</h2>
              <p>
                ByteLock may modify these Terms of Service at any time. Changes will be effective immediately upon posting. Your 
                continued use of ByteLock after modifications constitutes acceptance of the updated Terms. If you do not agree to 
                any modifications, you must stop using ByteLock.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">15. Governing Law</h2>
              <p>
                These Terms of Service and your use of ByteLock shall be governed by and construed in accordance with the laws
                of the Commonwealth of Massachusetts, United States, without regard to its conflict of law principles. You agree
                to submit to the exclusive jurisdiction of the courts of Massachusetts.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">16. Contact & Dispute Resolution</h2>
              <p>
                If you have any questions about these Terms or need to report a violation, please contact:
              </p>
              <div className="bg-card border border-primary/10 rounded-lg p-6 my-4">
                <p>
                  <strong>Email:</strong> support@bytelock.com
                </p>
                <p className="mt-2">
                  <strong>Mailing Address:</strong><br />
                  ByteLock Legal Team<br />
                  174 Brookfield Rd, Charlton MA 01507, USA
                </p>
              </div>
              <p>
                Before initiating legal proceedings, we encourage you to contact us to resolve any disputes informally.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">17. Entire Agreement</h2>
              <p>
                These Terms of Service, together with our Privacy Policy, constitute the entire agreement between you and ByteLock 
                concerning the Service and supersede all prior agreements and understandings, whether written or oral.
              </p>
            </section>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-16 pt-8 border-t border-primary/10"
          >
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                © 2026 ByteLock. All rights reserved.
              </p>
              <div className="flex gap-6 text-sm">
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </Link>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
