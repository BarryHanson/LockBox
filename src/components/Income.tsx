import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatDistanceToNow } from "date-fns";
import { TransactionCategoryIcon } from "./TransactionCategoryIcon";
import type { Transaction } from "@/types/plaid";

interface IncomeSource {
  name: string;
  category: string;
  transactions: Transaction[];
  averageAmount: number;
  frequency: string;
  lastPayment: string;
  nextEstimatedDate: string | null;
}

interface IncomeProps {
  transactions: Transaction[];
  selectedAccountId: string | null;
}

function detectIncomePatterns(transactions: Transaction[]): IncomeSource[] {
  // Filter for income transactions (negative amounts in Plaid)
  const incomeTransactions = transactions.filter(t => t.amount < 0);

  // Group by source
  const groups = incomeTransactions.reduce<Record<string, Transaction[]>>((acc, transaction) => {
    const key = transaction.name;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(transaction);
    return acc;
  }, {});

  const incomeSources: IncomeSource[] = [];

  for (const [name, sourceTransactions] of Object.entries(groups)) {
    if (sourceTransactions.length < 2) continue; // Need at least 2 transactions to detect a pattern

    // Sort transactions by date, newest first
    const sorted = [...sourceTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Calculate intervals between payments
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round(
        (new Date(sorted[i-1].date).getTime() - new Date(sorted[i].date).getTime()) 
        / (1000 * 60 * 60 * 24)
      );
      intervals.push(days);
    }

    // Analyze payment pattern
    const averageInterval = intervals.length > 0 
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
      : 0;
    
    const intervalVariance = intervals.length > 0
      ? Math.sqrt(intervals.reduce((acc, i) => acc + Math.pow(i - averageInterval, 2), 0) / intervals.length)
      : 0;

    // Determine frequency
    let frequency = "";
    if (intervals.length === 0) {
      frequency = "one-time";
    } else if (intervalVariance <= 2 && averageInterval >= 6 && averageInterval <= 8) {
      frequency = "weekly";
    } else if (intervalVariance <= 2 && averageInterval >= 13 && averageInterval <= 15) {
      frequency = "bi-weekly";
    } else if (intervalVariance <= 3 && averageInterval >= 28 && averageInterval <= 31) {
      frequency = "monthly";
    } else if (intervalVariance <= 5 && averageInterval >= 13 && averageInterval <= 16) {
      frequency = "semi-monthly";
    } else {
      frequency = "irregular";
    }

    // Calculate average amount
    const averageAmount = sorted.reduce((acc, t) => acc + t.amount, 0) / sorted.length;

    // Estimate next payment date
    let nextEstimatedDate: string | null = null;
    if (frequency !== "irregular" && frequency !== "one-time") {
      const lastDate = new Date(sorted[0].date);
      const daysToAdd = {
        weekly: 7,
        "bi-weekly": 14,
        "semi-monthly": 15,
        monthly: 30
      }[frequency] || 0;

      if (daysToAdd) {
        const nextDate = new Date(lastDate);
        nextDate.setDate(lastDate.getDate() + daysToAdd);
        nextEstimatedDate = nextDate.toISOString().split('T')[0];
      }
    }

    incomeSources.push({
      name,
      category: sorted[0].category,
      transactions: sorted,
      averageAmount,
      frequency,
      lastPayment: sorted[0].date,
      nextEstimatedDate
    });
  }

  // Sort by most recent payment
  return incomeSources.sort(
    (a, b) => new Date(b.lastPayment).getTime() - new Date(a.lastPayment).getTime()
  );
}

export function Income({ transactions, selectedAccountId }: IncomeProps) {
  // Filter transactions by selected account
  const filteredTransactions = selectedAccountId
    ? transactions.filter(t => t.accountId === selectedAccountId)
    : transactions;
  const incomeSources = detectIncomePatterns(filteredTransactions);
  const monthlyTotal = incomeSources
    .filter(s => s.frequency !== "one-time" && s.frequency !== "irregular")
    .reduce((acc, s) => {
      const multiplier = {
        weekly: 4.33,
        "bi-weekly": 2.17,
        "semi-monthly": 2,
        monthly: 1
      }[s.frequency] || 0;
      return acc + (Math.abs(s.averageAmount) * multiplier);
    }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Income Sources</h3>
        <div className="text-sm text-muted-foreground">
          Est. Monthly: <span className="font-medium text-primary">+${monthlyTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid gap-4">
        {incomeSources.map((source) => (
          <Accordion key={source.name} type="single" collapsible className="bg-card rounded-lg border">
            <AccordionItem value="history">
              <AccordionTrigger className="px-4 hover:no-underline hover:bg-accent/50">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <TransactionCategoryIcon category={source.category} />
                    <div className="text-left">
                      <div className="font-medium">{source.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {source.frequency} • last payment {formatDistanceToNow(new Date(source.lastPayment))} ago
                        {source.nextEstimatedDate && (
                          <> • next est. {formatDistanceToNow(new Date(source.nextEstimatedDate))} from now</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-green-500">
                      +${Math.abs(source.averageAmount).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">{source.frequency}</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="px-4 py-2 space-y-2">
                  {source.transactions.map((transaction) => (
                    <div key={transaction.id} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        {new Date(transaction.date).toLocaleDateString()}
                      </span>
                      <span className="font-medium text-green-500">
                        +${Math.abs(transaction.amount).toFixed(2)}
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
