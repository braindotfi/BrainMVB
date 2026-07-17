import { createContext, useContext, useState, useCallback } from "react";

export interface AppTransaction {
  id: string;
  type: "exchange" | "deposit" | "withdrawal";
  label: string;
  time: string;
  date: string;
  amount: string;
  positive: boolean;
  txHash?: string;
  accountId?: string | null;
}

interface TransactionContextValue {
  transactions: AppTransaction[];
  addTransaction: (tx: Omit<AppTransaction, "id">) => void;
}

const TransactionContext = createContext<TransactionContextValue>({
  transactions: [],
  addTransaction: () => {},
});

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<AppTransaction[]>([]);

  const addTransaction = useCallback((tx: Omit<AppTransaction, "id">) => {
    const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTransactions(prev => [{ ...tx, id }, ...prev]);
  }, []);

  return (
    <TransactionContext.Provider value={{ transactions, addTransaction }}>
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransactions() {
  return useContext(TransactionContext);
}

export function generateTxHash(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return "0x" + Array.from({ length: 64 }, hex).join("");
}
