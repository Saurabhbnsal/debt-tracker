import { Injectable, computed, effect, signal } from '@angular/core';
import { AppData, Loan, Payment, Strategy } from './models';
import { monthlyRate, sum } from './finance';

const KEY = 'debt-tracker:v1';

const empty = (): AppData => ({ version: 1, loans: [], payments: [], monthlyBudget: null, strategy: 'snowball' });

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw), strategy: 'snowball' };
  } catch {
    return empty();
  }
}

export const newId = () => crypto.randomUUID();

@Injectable({ providedIn: 'root' })
export class Store {
  private readonly data = signal<AppData>(load());

  readonly loans = computed(() => this.data().loans);
  readonly payments = computed(() => this.data().payments);
  readonly strategy = computed(() => this.data().strategy);
  readonly activeLoans = computed(() => this.loans().filter((l) => l.outstanding > 0.5));
  readonly totalOutstanding = computed(() => sum(this.loans().map((l) => l.outstanding)));
  readonly totalPrincipal = computed(() => sum(this.loans().map((l) => l.principal)));
  readonly totalEmi = computed(() => sum(this.activeLoans().map((l) => l.emi)));
  /** What you put towards debt each month; defaults to the sum of EMIs. */
  readonly monthlyBudget = computed(() => this.data().monthlyBudget ?? this.totalEmi());
  readonly budgetIsCustom = computed(() => this.data().monthlyBudget !== null);
  /** Budget used for planning: never less than the EMIs you owe. */
  readonly effectiveBudget = computed(() => Math.max(this.monthlyBudget(), this.totalEmi()));
  /** Amount above EMIs that snowballs into the smallest loan. */
  readonly extraPayment = computed(() => Math.max(0, this.monthlyBudget() - this.totalEmi()));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data()));
      } catch {
        /* storage full or blocked */
      }
    });
  }

  private patch(fn: (d: AppData) => Partial<AppData>) {
    this.data.update((d) => ({ ...d, ...fn(d) }));
  }

  saveLoan(loan: Loan) {
    this.patch((d) => ({
      loans: d.loans.some((l) => l.id === loan.id) ? d.loans.map((l) => (l.id === loan.id ? loan : l)) : [...d.loans, loan],
    }));
  }

  deleteLoan(id: string) {
    this.patch((d) => ({ loans: d.loans.filter((l) => l.id !== id), payments: d.payments.filter((p) => p.loanId !== id) }));
  }

  /** Record a payment and reduce the loan's outstanding by its principal portion. */
  logPayment(loanId: string, date: string, amount: number, kind: Payment['kind']) {
    const loan = this.loans().find((l) => l.id === loanId);
    if (!loan || amount <= 0) return;
    const interest = kind === 'emi' ? Math.min(amount, loan.outstanding * monthlyRate(loan.annualRate)) : 0;
    const principal = Math.min(loan.outstanding, amount - interest);
    const payment: Payment = { id: newId(), loanId, date, amount, kind, interest, principal };
    this.patch((d) => ({
      payments: [...d.payments, payment],
      loans: d.loans.map((l) => (l.id === loanId ? { ...l, outstanding: Math.max(0, l.outstanding - principal) } : l)),
    }));
  }

  /** Undo a payment: delete it and add its principal back to the loan. */
  deletePayment(id: string) {
    const p = this.payments().find((x) => x.id === id);
    if (!p) return;
    this.patch((d) => ({
      payments: d.payments.filter((x) => x.id !== id),
      loans: d.loans.map((l) => (l.id === p.loanId ? { ...l, outstanding: l.outstanding + p.principal } : l)),
    }));
  }

  setBudget(budget: number | null) {
    this.patch(() => ({ monthlyBudget: budget }));
  }

  setStrategy(strategy: Strategy) {
    this.patch(() => ({ strategy }));
  }

  exportJson(): string {
    return JSON.stringify(this.data(), null, 2);
  }

  importJson(text: string) {
    const parsed = JSON.parse(text) as AppData;
    if (!parsed || !Array.isArray(parsed.loans)) throw new Error('Not a Debt Tracker backup file');
    this.data.set({ ...empty(), ...parsed });
  }
}
