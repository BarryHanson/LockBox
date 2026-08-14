import { useState, useEffect, useCallback, useMemo } from 'react';
import { PlaidLink } from './PlaidLink';
import { Button } from './ui/button';
import type { Account, Transaction } from "@/types/plaid";
import { PLAID_SANDBOX_CREDENTIALS, PLAID_TEST_USERS } from '@/lib/plaid';
import { TransactionCategoryIcon } from "./TransactionCategoryIcon";
import { TransactionFilters, SortOption } from "./TransactionFilters";
import { Subscriptions } from "./Subscriptions";
import { Income } from "./Income";

function sortTransactions(transactions: Transaction[], sortOption: SortOption): Transaction[] {
  return [...transactions].sort((a, b) => {
    switch (sortOption) {
      case 'date-desc':
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      case 'date-asc':
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'amount-desc':
        return Math.abs(b.amount) - Math.abs(a.amount);
      case 'amount-asc':
        return Math.abs(a.amount) - Math.abs(b.amount);
      case 'category':
        return a.category.localeCompare(b.category);
      default:
        return 0;
    }
  });
}

export function Transactions() {
  const isDev = process.env.NODE_ENV === 'development';
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>("date-desc");
  const [view, setView] = useState<"transactions" | "subscriptions" | "income">("transactions");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingAccountId, setLoadingAccountId] = useState<string | null>(null);
  const transactionsPerPage = 20;

  // Get link token when component mounts
  useEffect(() => {
    const getLinkToken = async () => {
      try {
        const response = await fetch('/api/plaid/create-link-token', {
          method: 'POST',
        });
        const { linkToken } = await response.json();
        setLinkToken(linkToken);
      } catch (error) {
        setError('Failed to initialize bank connection');
      }
    };

    getLinkToken();
  }, []);

  // Quick connect with sandbox credentials
  const handleSandboxConnect = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/plaid/sandbox/create-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(PLAID_SANDBOX_CREDENTIALS),
      });

      if (!response.ok) throw new Error('Failed to create sandbox connection');
      
      const { publicToken } = await response.json();
      await handlePlaidSuccess(publicToken);
    } catch (error) {
      setError('Failed to create sandbox connection');
      setLoading(false);
    }
  };

  // Handle successful Plaid Link
  const handlePlaidSuccess = async (publicToken: string) => {
    try {
      setLoading(true);
      const response = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken }),
      });

      if (!response.ok) throw new Error('Failed to connect bank account');
      
      // Token is stored server-side; fetch transactions directly
      // Fetch initial transactions
      await fetchTransactions();
    } catch (error) {
      setError('Failed to connect bank account');
    } finally {
      setLoading(false);
    }
  };

  // Fetch transactions for a specific account or all accounts
  const fetchTransactions = async (accountId?: string) => {
    try {
      setLoading(true);
      if (accountId) {
        setLoadingAccountId(accountId);
      }

      const response = await fetch(`/api/plaid/transactions`);
      const data = await response.json();

      // Handle 202 status - transactions are still being processed
      if (response.status === 202) {
        console.log('🟡 Transactions are still being processed');
        setAccounts(data.accounts); // Still show accounts while waiting
        
        // Start polling for transactions
        let attempts = 0;
        const maxAttempts = 5;
        const pollInterval = setInterval(async () => {
          try {
            // Increase delay between attempts
            const delay = Math.min(2000 * Math.pow(2, attempts), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            const pollResponse = await fetch(`/api/plaid/transactions`);
            const pollData = await pollResponse.json();

            // If we get a 200 and have transactions, we're done
            if (pollResponse.status === 200 && pollData.transactions.length > 0) {
              clearInterval(pollInterval);
              setTransactions(pollData.transactions);
              setAccounts(pollData.accounts);
              setError('');
              setLoading(false);
              return;
            }

            // Increment attempts
            attempts++;
            if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              setError('Please try refreshing in a few minutes.');
              setLoading(false);
            }
          } catch (pollError) {
            console.error('Polling error:', pollError);
            attempts++;
          }
        }, 1000); // Initial poll after 1 second

        // Stop polling after 30 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
          if (transactions.length === 0) {
            setError('Transactions are taking longer than expected. Please try refreshing in a few minutes.');
            setLoading(false);
          }
        }, 30000);

        return;
      }

      // Handle regular 200 response
      if (!response.ok) throw new Error(data.error || 'Failed to fetch transactions');

      if (accountId) {
        // If fetching for specific account, only update those transactions
        setTransactions(prev => {
          const otherTransactions = prev.filter((t: Transaction) => t.accountId !== accountId);
          const newTransactions = data.transactions.filter((t: Transaction) => t.accountId === accountId);
          return [...otherTransactions, ...newTransactions];
        });
      } else {
        // If fetching all, update everything
        setTransactions(data.transactions);
      }
      setAccounts(data.accounts);
      setError('');
    } catch (error: any) {
      setError(error?.message || 'Failed to fetch transactions');
      console.error('Transaction error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!linkToken) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {accounts.length === 0 ? (
        <div className="text-center py-8">
          <h3 className="text-lg font-medium mb-4">Connect Your Bank Account</h3>
          {isDev && (
            <div className="mb-4">
              <Button
                variant="outline"
                onClick={handleSandboxConnect}
                disabled={loading}
                className="w-full mb-2"
              >
                Quick Connect (Sandbox)
              </Button>
              <p className="text-xs text-muted-foreground">
                Uses test credentials: {PLAID_TEST_USERS.transactions.username} / {PLAID_TEST_USERS.transactions.password}
              </p>
            </div>
          )}
          <PlaidLink linkToken={linkToken} onSuccess={handlePlaidSuccess} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Accounts List */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <button
                key={account.account_id}
                onClick={() => setSelectedAccountId(selectedAccountId === account.account_id ? null : account.account_id)}
                className={`bg-card rounded-xl border text-left ${selectedAccountId === account.account_id ? 'border-primary' : 'border-border/50'} p-4 space-y-2 hover:border-primary/50 transition-colors w-full`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.mask ? `****${account.mask}` : account.account_id}
                    </p>
                  </div>
                  <p className="font-medium">
                    ${account.balances.current.toFixed(2)}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center justify-end gap-2 mb-4">
            <Button
              variant={view === "transactions" ? "default" : "outline"}
              onClick={() => setView("transactions")}
            >
              Recent Transactions
            </Button>
            <Button
              variant={view === "subscriptions" ? "default" : "outline"}
              onClick={() => setView("subscriptions")}
            >
              View Subscriptions
            </Button>
            <Button
              variant={view === "income" ? "default" : "outline"}
              onClick={() => setView("income")}
            >
              View Income
            </Button>
          </div>

          {/* Content */}
          {transactions.length > 0 ? (
            <>
              {view === "transactions" ? (
                <>
                  {/* Filter transactions based on selected account */}
                  {(() => {
                    const filteredTransactions = sortTransactions(
                      selectedAccountId 
                        ? transactions.filter((t: Transaction) => t.accountId === selectedAccountId)
                        : transactions,
                      sortOption
                    );
                    
                    const paginatedTransactions = filteredTransactions.slice(
                      (currentPage - 1) * transactionsPerPage,
                      currentPage * transactionsPerPage
                    );

                    return (
                      <>
                        <TransactionFilters
                          currentSort={sortOption}
                          onSortChange={setSortOption}
                        />
                        <select
                    className="bg-card text-foreground border border-border/50 rounded-lg px-3 py-2 w-full"
                    value={selectedAccountId || ''}
                    onChange={(e) => {
                      const accountId = e.target.value || null;
                      setSelectedAccountId(accountId);
                      if (accountId) {
                        fetchTransactions(accountId);
                      } else {
                        fetchTransactions();
                      }
                    }}
                  >
                    <option value="">All Accounts</option>
                    {accounts.map((account) => (
                      <option key={account.account_id} value={account.account_id}>
                        {account.name} (${account.balances.current.toFixed(2)})
                        {loadingAccountId === account.account_id ? ' (Loading...)' : ''}
                      </option>
                    ))}
                        </select>
                        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">

                    <div className="p-6 border-b border-border/50">
                      <h3 className="font-semibold text-lg">Recent Transactions</h3>
                    </div>
                    <div className="divide-y divide-border/50">
                      {filteredTransactions.length > 0 ? (
                        <>
                          <div className="space-y-4">
                            {paginatedTransactions.map((transaction) => (
                              <div
                                key={transaction.id}
                                className="p-4 bg-card/50 rounded-lg border border-border/50 hover:border-border transition-colors"
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-medium">{transaction.name}</p>
                                    <div className="flex items-center space-x-2 mt-1.5">
                                      <TransactionCategoryIcon category={transaction.category} />
                                      {transaction.pending && (
                                        <span className="text-xs bg-warning/20 text-warning-foreground px-2 py-1 rounded-md">
                                          Pending
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className={`font-medium ${transaction.amount < 0 ? 'text-green-500' : 'text-red-500'}`}>
                                      {transaction.amount < 0 ? '+' : '-'}${Math.abs(transaction.amount).toFixed(2)}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {new Date(transaction.date).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Pagination - only show if there are multiple pages */}
                          {Math.ceil(filteredTransactions.length / transactionsPerPage) > 1 && (
                            <div className="p-4 border-t border-border/50 flex items-center justify-center gap-4 text-sm">
                              <button
                                className={`hover:text-primary transition-colors ${currentPage === 1 ? 'text-muted-foreground cursor-not-allowed' : 'text-foreground hover:underline'}`}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                              >
                                Previous
                              </button>
                              <span>
                                Page {currentPage} of {Math.ceil(filteredTransactions.length / transactionsPerPage)}
                              </span>
                              <button
                                className={`hover:text-primary transition-colors ${currentPage * transactionsPerPage >= filteredTransactions.length ? 'text-muted-foreground cursor-not-allowed' : 'text-foreground hover:underline'}`}
                                onClick={() => setCurrentPage(p => p + 1)}
                                disabled={currentPage * transactionsPerPage >= filteredTransactions.length}
                              >
                                Next
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No recent transactions
                        </div>
                      )}
                    </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : view === "subscriptions" ? (
                <Subscriptions 
                  transactions={transactions}
                  selectedAccountId={selectedAccountId}
                />
              ) : (
                <Income 
                  transactions={transactions}
                  selectedAccountId={selectedAccountId}
                />
              )}
            </>
          ) : loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              Loading transactions...
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground bg-card rounded-xl border border-border/50">
              No transaction data available
            </div>
          )}
          <div className="flex justify-end">
            <Button
              onClick={() => fetchTransactions()}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh Transactions'}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
