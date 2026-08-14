"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
            <h1 className="text-5xl font-bold mb-4">Privacy Policy</h1>
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
              <h2 className="text-2xl font-bold">Introduction</h2>
              <p>
                This Privacy Policy is an integral part of the ByteLock Terms of Service. It details the data processing 
                activities specifically related to the creation and activity of your ByteLock Account when you use ByteLock, 
                our end-to-end encrypted password manager and secure vault.
              </p>
              <p>
                At ByteLock, we believe your privacy is fundamental. We've designed our entire platform around the principle 
                that your sensitive data belongs to you alone, and we're committed to protecting it with the highest level of encryption.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Account Data & Activity</h2>
              <p>
                All data stored in ByteLock, including passwords, payment card information, secure notes, and files, are 
                end-to-end encrypted. ByteLock does not possess the ability to decrypt end-to-end encrypted data. This means 
                we cannot access, view, or decrypt your sensitive information under any circumstances.
              </p>
              <p>
                Metadata associated with your vault entries (such as creation dates, modification timestamps, and entry types) 
                is also encrypted. Only you have the encryption keys to decrypt this information on your device.
              </p>
              <p>
                If you use ByteLock's alias forwarding feature, alias addresses are created and retained for as long as you 
                choose to keep them. These aliases are not encrypted (as they need to forward emails), but they are stored 
                securely on our servers. This processing of data relies on our contract of services with you.
              </p>
              <p>
                If you use ByteLock with an external email address, this address will be used as a basis for creating your aliases 
                and account authentication. We will not share this email with third parties without your explicit consent.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Vault Sharing & Access Control</h2>
              <p>
                When sharing your vault with another ByteLock user, you share your vault encryption key with them. This key is 
                encrypted with your recipient's address key, ensuring only they can access the shared vault. ByteLock servers 
                cannot decrypt this shared key.
              </p>
              <p>
                All shared vault activities are logged (who has access, when access was granted), but the vault contents themselves 
                remain encrypted and inaccessible to ByteLock servers.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Data Security & Infrastructure</h2>
              <p>
                <strong>Server Infrastructure:</strong> Data storage servers used in connection with ByteLock are wholly-owned 
                and operated by ByteLock or our subsidiaries. Access to this infrastructure is tightly controlled—only authorized 
                employees of ByteLock have physical or other access to the servers.
              </p>
              <p>
                <strong>Encryption at Rest:</strong> All data is stored in encrypted format on our servers. Data is exclusively 
                located in Switzerland, Germany, or Norway, under the protection of some of the world's strongest privacy laws.
              </p>
              <p>
                <strong>Backups:</strong> Offline backups, which may be stored periodically for disaster recovery, are also encrypted 
                and subject to the same access controls. We cannot decrypt any user encrypted content on either production servers or 
                in backups. Backups are kept for up to 30 days.
              </p>
              <p>
                <strong>Transmission Security:</strong> All data transmitted between your device and ByteLock servers is encrypted 
                using TLS/SSL with strong cipher suites. Additionally, the encryption/decryption of vault contents occurs exclusively 
                on your device.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Third-Party Services</h2>
              <p>
                <strong>Analytics:</strong> We may collect non-personally identifiable usage analytics to improve ByteLock's 
                functionality and security. This data does not include the contents of your vault or personal information.
              </p>
              <p>
                <strong>Privacy Scanning:</strong> Our privacy scanning feature analyzes your online accounts to identify security 
                breaches and vulnerabilities. This service may use third-party breach databases to identify compromised accounts. 
                We do not store or transmit your passwords to these services.
              </p>
              <p>
                <strong>Payment Processing:</strong> Payment and subscription information is processed through secure third-party 
                payment processors. ByteLock servers do not store complete credit card information—only tokenized payment references.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Personal Data We Collect</h2>
              <p>
                We collect minimal personal data necessary to provide ByteLock services:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Email address (for account creation and password recovery)</li>
                <li>Account preferences and settings (encrypted on your device)</li>
                <li>Device information (for security and cross-device synchronization)</li>
                <li>IP address (for security and fraud prevention)</li>
                <li>Usage statistics (anonymized and non-identifying)</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Your Rights</h2>
              <p>
                You have the right to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Access your personal data upon request</li>
                <li>Correct inaccurate personal data</li>
                <li>Delete your account and associated metadata</li>
                <li>Export your data in an accessible format</li>
                <li>Opt-out of non-essential communications</li>
              </ul>
              <p>
                To exercise any of these rights, please contact us at privacy@bytelock.com or through your account settings.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Changes to This Policy</h2>
              <p>
                ByteLock may update this Privacy Policy from time to time. We will notify you of any material changes via email 
                or through the ByteLock app. Your continued use of ByteLock after such modifications constitutes acceptance of 
                the updated Privacy Policy.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold">Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy or ByteLock's privacy practices, please contact us at:
              </p>
              <div className="bg-card border border-primary/10 rounded-lg p-6 my-4">
                <p>
                  <strong>Email:</strong> privacy@bytelock.com
                </p>
                <p className="mt-2">
                  <strong>Mailing Address:</strong><br />
                  ByteLock Security Team<br />
                  174 Brookfield Rd, Charlton MA 01507, USA
                </p>
              </div>
              <p className="text-sm text-muted-foreground mt-6">
                We take data privacy seriously and are committed to transparent, ethical practices.
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
                <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
