import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatDistanceToNow } from "date-fns";
import { TransactionCategoryIcon } from "./TransactionCategoryIcon";

import type { Transaction } from "@/types/plaid";

interface SubscriptionTransaction extends Transaction {
  date: string;
  amount: number;
}

interface Subscription {
  name: string;
  category: string;
  amount: number;
  frequency: "monthly" | "yearly" | "weekly";
  lastCharge: string;
  transactions: SubscriptionTransaction[];
}

interface SubscriptionsProps {
  transactions: Transaction[];
  selectedAccountId: string | null;
}

function detectSubscriptions(transactions: Transaction[]): Subscription[] {
  // Group transactions by merchant name and exact amount
  const groups = transactions.reduce<Record<string, Transaction[]>>((acc, transaction) => {
    // Only include expenses (positive amounts in Plaid)
    if (transaction.amount > 0) {
      const key = `${transaction.name}_${transaction.amount}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(transaction);
    }
    return acc;
  }, {} as Record<string, Transaction[]>);

  // Analyze each group for recurring patterns
  const subscriptions: Subscription[] = [];
  
  for (const [key, groupTransactions] of Object.entries(groups)) {
    const [name] = key.split('_');
    if (groupTransactions.length < 3) continue; // Require at least 3 transactions

    // Sort transactions by date
    const sorted = [...groupTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Check if transactions occur on the same day of the month
    const dayOfMonth = new Set(sorted.map(t => new Date(t.date).getDate()));
    if (dayOfMonth.size > 2) continue; // Allow for 1 day variation due to weekends/holidays

    // Check for monthly intervals
    let isMonthly = true;
    const dates = sorted.map(t => new Date(t.date));
    
    for (let i = 1; i < dates.length; i++) {
      const curr = dates[i];
      const prev = dates[i-1];
      
      // Check if transactions are roughly one month apart
      const monthDiff = (prev.getFullYear() - curr.getFullYear()) * 12 + 
                        (prev.getMonth() - curr.getMonth());
      
      if (monthDiff !== 1) {
        isMonthly = false;
        break;
      }
    }

    if (!isMonthly) continue;

    subscriptions.push({
      name,
      category: sorted[0].category,
      amount: sorted[0].amount,
      frequency: "monthly",
      lastCharge: sorted[0].date,
      transactions: sorted as SubscriptionTransaction[]
    });
  }

  return subscriptions;
}

export function Subscriptions({ transactions, selectedAccountId }: SubscriptionsProps) {
  // Filter transactions by selected account
  const filteredTransactions = selectedAccountId
    ? transactions.filter(t => t.accountId === selectedAccountId)
    : transactions;
  const subscriptions = detectSubscriptions(filteredTransactions);
  const totalMonthly = subscriptions
    .filter(s => s.frequency === "monthly")
    .reduce((acc, s) => acc + s.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Subscriptions</h3>
        <div className="text-sm text-muted-foreground">
          Monthly Total: <span className="font-medium text-primary">${totalMonthly.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid gap-4">
        {subscriptions.map((subscription) => (
          <Accordion key={subscription.name} type="single" collapsible className="bg-card rounded-lg border">
            <AccordionItem value="history">
              <AccordionTrigger className="px-4 hover:no-underline hover:bg-accent/50">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <TransactionCategoryIcon category={subscription.category} />
                    <div className="text-left">
                      <div className="font-medium">{subscription.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {subscription.frequency} • last charged {formatDistanceToNow(new Date(subscription.lastCharge))} ago
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${subscription.amount < 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {subscription.amount < 0 ? '+' : '-'}${Math.abs(subscription.amount).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">{subscription.frequency}</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="px-4 py-2 space-y-2">
                  {subscription.transactions.map((transaction) => (
                    <div key={transaction.id} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        {new Date(transaction.date).toLocaleDateString()}
                      </span>
                      <span className={`font-medium ${transaction.amount < 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {transaction.amount < 0 ? '+' : '-'}${Math.abs(transaction.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </div>
    </div>
  );
}
