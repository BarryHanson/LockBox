'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Mail, Shield, ExternalLink, LogOut } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface DiscoveredAccount {
  service: string;
  email: string;
  lastActivity: string;
  category: string;
  subject: string;
  hasUnsubscribe?: boolean;
  unsubscribeLink?: string;
  hasDeletionProcess?: boolean;
  deletionLink?: string;
}

interface AccountStats {
  totalAccounts: number;
  activeLastMonth: number;
  inactiveAccounts: number;
  unsubscribable: number;
  deletable: number;
}

import { EmailLinkButton } from './EmailLinkButton';

export function AccountDiscovery() {
  const { data: session, status } = useSession();
  const [scanning, setScanning] = useState(false);
  const [accounts, setAccounts] = useState<DiscoveredAccount[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 10;

  // Fetch accounts when session is available
  useEffect(() => {
    if (session?.user?.email) {
      handleScan();
    }
  }, [session]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      setAccounts([]);
      setStats(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out');
    }
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      await signIn('google');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
    }
  }, []);

  const handleScan = async () => {
    if (!session?.user?.email) return;
    
    try {
      setScanning(true);
      setError(null);
      
      const response = await fetch('/api/account-discovery/scan', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to scan accounts');
      }

      const data = await response.json();
      setAccounts(data.accounts);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan accounts');
    } finally {
      setScanning(false);
    }
  };

  const totalPages = Math.ceil(accounts.length / itemsPerPage);
  const currentAccounts = accounts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Account Discovery</h3>
          <p className="text-sm text-muted-foreground">
            Find accounts you've registered and manage your digital footprint
          </p>
        </div>
        {session?.user?.email ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{session.user.email}</span>
              <button
                onClick={handleSignOut}
                className="text-orange-500 hover:text-orange-600 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium"
            >
              {scanning ? 'Scanning...' : 'Scan Inbox'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('google')}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium flex items-center gap-2"
          >
            <Mail className="w-4 h-4" />
            Sign in with Google
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-card border border-input rounded-lg">
            <div className="text-sm text-muted-foreground">Total Accounts</div>
            <div className="text-2xl font-bold text-orange-500">{stats.totalAccounts}</div>
          </div>
          <div className="p-4 bg-card border border-input rounded-lg">
            <div className="text-sm text-muted-foreground">Active Last Month</div>
            <div className="text-2xl font-bold text-orange-500">{stats.activeLastMonth}</div>
          </div>
          <div className="p-4 bg-card border border-input rounded-lg">
            <div className="text-sm text-muted-foreground">Inactive Accounts</div>
            <div className="text-2xl font-bold text-orange-500">{stats.inactiveAccounts}</div>
          </div>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {currentAccounts.map((account) => (
              <div
                key={`${account.service}-${account.email}`}
                className="p-4 bg-card border border-input rounded-lg hover:border-orange-500/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-orange-500">{account.service}</h4>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      {account.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {account.hasUnsubscribe && (
                      <a
                        href={account.unsubscribeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-orange-500 hover:text-orange-600 transition-colors flex items-center gap-1"
                      >
                        <Mail className="w-4 h-4" />
                        Unsubscribe
                      </a>
                    )}
                    {account.hasDeletionProcess && (
                      <a
                        href={account.deletionLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Account
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-500">
                      {account.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Last activity: {account.lastActivity}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {account.subject}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-input pt-4">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
