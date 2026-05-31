// Derive dashboard/analytics view models from the raw transaction list.
// Replaces the hand-faked numbers that previously lived in mockData.ts.

import type { TransactionRecord } from "@/lib/api";
import { categoryMeta } from "@/lib/categories";

export interface WalletSummary {
  balance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlySaving: number;
  savingRate: number;
  incomeChange: number;
  expenseChange: number;
}

export interface CategorySlice {
  name: string;
  value: number;
  percent: number;
  color: string;
}

export interface MonthlyPoint {
  month: string;
  thuNhap: number;
  chiTieu: number;
}

export interface WeeklyPoint {
  day: string;
  amount: number;
}

export interface RecentTransaction {
  id: string;
  type: "expense" | "income";
  amount: number; // signed: negative for expense
  category: string; // display label
  description: string;
  date: string;
  icon: string;
}

const MONTH_LABELS = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];
const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function txnDate(txn: TransactionRecord): Date {
  return new Date(txn.transaction_date ?? txn.created_at);
}

function sameMonth(date: Date, ref: Date): boolean {
  return date.getMonth() === ref.getMonth() && date.getFullYear() === ref.getFullYear();
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export function deriveWalletSummary(txns: TransactionRecord[], now = new Date()): WalletSummary {
  const prevMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  let prevIncome = 0;
  let prevExpense = 0;
  let balance = 0;

  for (const txn of txns) {
    const date = txnDate(txn);
    const signed = txn.type === "income" ? txn.amount : -txn.amount;
    balance += signed;

    if (sameMonth(date, now)) {
      if (txn.type === "income") monthlyIncome += txn.amount;
      else monthlyExpense += txn.amount;
    } else if (sameMonth(date, prevMonthRef)) {
      if (txn.type === "income") prevIncome += txn.amount;
      else prevExpense += txn.amount;
    }
  }

  const monthlySaving = monthlyIncome - monthlyExpense;
  const savingRate = monthlyIncome > 0 ? (monthlySaving / monthlyIncome) * 100 : 0;

  return {
    balance,
    monthlyIncome,
    monthlyExpense,
    monthlySaving,
    savingRate: Math.round(savingRate * 10) / 10,
    incomeChange: Math.round(percentChange(monthlyIncome, prevIncome) * 10) / 10,
    expenseChange: Math.round(percentChange(monthlyExpense, prevExpense) * 10) / 10,
  };
}

export function deriveExpenseByCategory(txns: TransactionRecord[], now = new Date()): CategorySlice[] {
  const totals = new Map<string, number>();
  for (const txn of txns) {
    if (txn.type !== "expense") continue;
    if (!sameMonth(txnDate(txn), now)) continue;
    totals.set(txn.category, (totals.get(txn.category) ?? 0) + txn.amount);
  }

  const grand = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([value, amount]) => {
      const meta = categoryMeta(value);
      return {
        name: meta.label,
        value: amount,
        percent: grand > 0 ? Math.round((amount / grand) * 1000) / 10 : 0,
        color: meta.color,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function deriveMonthlyTrend(txns: TransactionRecord[], months = 7, now = new Date()): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    let thuNhap = 0;
    let chiTieu = 0;
    for (const txn of txns) {
      if (!sameMonth(txnDate(txn), ref)) continue;
      if (txn.type === "income") thuNhap += txn.amount;
      else chiTieu += txn.amount;
    }
    const yy = String(ref.getFullYear()).slice(-2);
    points.push({ month: `${MONTH_LABELS[ref.getMonth()]}/${yy}`, thuNhap, chiTieu });
  }
  return points;
}

export function deriveWeeklyExpense(txns: TransactionRecord[], now = new Date()): WeeklyPoint[] {
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const buckets = new Array(7).fill(0);
  for (const txn of txns) {
    if (txn.type !== "expense") continue;
    const date = txnDate(txn);
    if (date < start || date > now) continue;
    const dayIndex = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
    if (dayIndex >= 0 && dayIndex < 7) buckets[dayIndex] += txn.amount;
  }

  return buckets.map((amount, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { day: WEEKDAY_LABELS[date.getDay()], amount };
  });
}

export function toRecentTransactions(txns: TransactionRecord[], limit = 8): RecentTransaction[] {
  return [...txns]
    .sort((a, b) => txnDate(b).getTime() - txnDate(a).getTime())
    .slice(0, limit)
    .map((txn) => {
      const meta = categoryMeta(txn.category);
      return {
        id: txn.id,
        type: txn.type,
        amount: txn.type === "income" ? txn.amount : -txn.amount,
        category: meta.label,
        description: txn.description || txn.merchant || meta.label,
        date: txn.transaction_date ?? txn.created_at,
        icon: meta.icon,
      };
    });
}
