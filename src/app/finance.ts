import type { Strategy } from './models';

/** Cap simulations at 50 years so non-closing loans don't loop forever. */
export const MAX_MONTHS = 600;
const EPS = 0.5; // half a rupee counts as closed

export const monthlyRate = (annualRate: number) => annualRate / 12 / 100;

/** Standard reducing-balance EMI. */
export function calcEmi(principal: number, annualRate: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = monthlyRate(annualRate);
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

/** Balance left after `monthsPaid` regular EMIs. */
export function outstandingAfter(principal: number, annualRate: number, emi: number, monthsPaid: number): number {
  const r = monthlyRate(annualRate);
  if (monthsPaid <= 0) return principal;
  if (r === 0) return Math.max(0, principal - emi * monthsPaid);
  const f = Math.pow(1 + r, monthsPaid);
  return Math.max(0, principal * f - (emi * (f - 1)) / r);
}

/** Months until a single loan closes at its EMI; null if the EMI never covers interest. */
export function monthsToClose(balance: number, annualRate: number, emi: number): number | null {
  if (balance <= EPS) return 0;
  if (emi <= 0) return null;
  const r = monthlyRate(annualRate);
  if (r === 0) return Math.ceil(balance / emi);
  if (emi <= balance * r) return null;
  return Math.ceil(-Math.log(1 - (r * balance) / emi) / Math.log(1 + r) - 1e-6);
}

/** Months elapsed from a 'YYYY-MM' start to today. */
export function monthsSince(startYm: string, today = new Date()): number {
  const [y, m] = startYm.split('-').map(Number);
  if (!y || !m) return 0;
  return Math.max(0, (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m));
}

export interface SimLoan {
  id: string;
  balance: number;
  annualRate: number;
  emi: number;
}

export interface PlanResult {
  /** Months until all debt is cleared; null if it never clears within MAX_MONTHS */
  months: number | null;
  totalInterest: number;
  totalPaid: number;
  /** Month number (1-based) in which each loan closes; null if it doesn't */
  closeMonth: Record<string, number | null>;
  /** Total outstanding at the start of month 0..n */
  balances: number[];
}

/**
 * Month-by-month payoff simulation.
 * - budget === null: every loan pays only its own EMI (no rollover).
 * - budget given: pay every EMI first, then throw everything left over at one
 *   target loan (highest rate for avalanche, smallest balance for snowball).
 *   When a loan closes its EMI is freed up and rolls into the next target.
 */
export function simulate(loans: SimLoan[], budget: number | null, strategy: Strategy): PlanResult {
  const state = loans.map((l) => ({ ...l, balance: Math.max(0, l.balance) }));
  const closeMonth: Record<string, number | null> = {};
  state.forEach((l) => (closeMonth[l.id] = l.balance <= EPS ? 0 : null));
  const balances = [sum(state.map((l) => l.balance))];
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;

  while (state.some((l) => l.balance > EPS) && month < MAX_MONTHS) {
    month++;
    const active = state.filter((l) => l.balance > EPS);

    for (const l of active) {
      const interest = l.balance * monthlyRate(l.annualRate);
      l.balance += interest;
      totalInterest += interest;
    }

    let available = budget ?? Infinity;
    for (const l of active) {
      const pay = Math.min(l.emi, l.balance, available);
      l.balance -= pay;
      available -= pay;
      totalPaid += pay;
    }

    if (budget !== null && available > 0) {
      const order = [...active].sort((a, b) =>
        strategy === 'avalanche' ? b.annualRate - a.annualRate || a.balance - b.balance : a.balance - b.balance || b.annualRate - a.annualRate,
      );
      for (const l of order) {
        if (available <= 0) break;
        const pay = Math.min(l.balance, available);
        l.balance -= pay;
        available -= pay;
        totalPaid += pay;
      }
    }

    for (const l of active) {
      if (l.balance <= EPS) {
        l.balance = 0;
        closeMonth[l.id] = month;
      }
    }
    balances.push(sum(state.map((l) => l.balance)));
  }

  const done = state.every((l) => l.balance <= EPS);
  return { months: done ? month : null, totalInterest, totalPaid, closeMonth, balances };
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Calendar label for N months from now, e.g. "Mar 2029". */
export function monthLabel(monthsFromNow: number, today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() + monthsFromNow, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/** "3 yr 4 mo" */
export function durationLabel(months: number | null): string {
  if (months === null) return 'Never';
  if (months === 0) return 'Closed';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ');
}

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const inr = (n: number) => inrFmt.format(Math.round(n));
