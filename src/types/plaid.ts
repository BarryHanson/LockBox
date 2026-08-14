export interface Account {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  balances: {
    available: number | null;
    current: number;
    limit: number | null;
  };
  mask: string | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  pending: boolean;
}
