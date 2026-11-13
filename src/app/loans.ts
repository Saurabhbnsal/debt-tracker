import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from './store';
import { Loan, Payment } from './models';
import { durationLabel, inr, monthLabel, monthlyRate, monthsToClose, simulate, sum } from './finance';
import { LoanForm } from './loan-form';

interface LoanView {
  loan: Loan;
  paidPct: number;
  months: number | null;
  interestLeft: number;
  payments: Payment[];
  emiTooLow: boolean;
}

@Component({
  selector: 'app-loans',
  imports: [FormsModule, LoanForm],
  template: `
    @if (editing() !== undefined) {
      <app-loan-form [loan]="editing()!" (saved)="save($event)" (cancel)="editing.set(undefined)" />
    } @else {
      <div class="toolbar">
        <h2>Your loans</h2>
        <button class="primary" (click)="editing.set(null)">+ Add loan</button>
      </div>
    }

    @if (!views().length && editing() === undefined) {
      <div class="card empty">
        <p>No loans yet. Add your first loan to see when you'll be debt free.</p>
      </div>
    }

    <div class="loan-list">
      @for (v of views(); track v.loan.id) {
        <article class="card loan" [class.closed]="v.loan.outstanding <= 0.5">
          <header>
            <div>
              <h3>{{ v.loan.name }}</h3>
              <span class="muted">{{ v.loan.lender }}{{ v.loan.lender ? ' · ' : '' }}{{ v.loan.annualRate }}% p.a.</span>
            </div>
            <div class="row-actions">
              <button class="ghost sm" (click)="togglePay(v.loan.id)">Log payment</button>
              <button class="ghost sm" (click)="editing.set(v.loan)">Edit</button>
              <button class="ghost sm danger" (click)="remove(v.loan)">Delete</button>
            </div>
          </header>

          <div class="progress" [attr.aria-label]="v.paidPct + '% repaid'">
            <div [style.width.%]="v.paidPct"></div>
          </div>
          <div class="muted small">{{ v.paidPct }}% of {{ inr(v.loan.principal) }} repaid</div>

          <dl class="stats">
            <div><dt>Outstanding</dt><dd>{{ inr(v.loan.outstanding) }}</dd></div>
            <div><dt>Monthly EMI</dt><dd>{{ inr(v.loan.emi) }}</dd></div>
            <div><dt>Time to close</dt><dd>{{ durationLabel(v.months) }}</dd></div>
            <div><dt>Closes</dt><dd>{{ v.months === null ? '—' : v.months === 0 ? 'Done' : monthLabel(v.months) }}</dd></div>
            <div><dt>Interest left</dt><dd>{{ v.months === null ? '—' : inr(v.interestLeft) }}</dd></div>
          </dl>

          @if (v.emiTooLow) {
            <p class="warn">The EMI doesn't cover the monthly interest of {{ inr(v.loan.outstanding * monthlyRate(v.loan.annualRate)) }}, so this loan will never close.</p>
          }

          @if (payingId() === v.loan.id) {
            <form class="pay" (ngSubmit)="logPayment(v.loan)">
              <label>Date <input type="date" name="d" [(ngModel)]="payDate" required /></label>
              <label>Amount (₹) <input type="number" inputmode="decimal" name="a" min="1" [(ngModel)]="payAmount" required /></label>
              <label>Type
                <select name="k" [(ngModel)]="payKind">
                  <option value="emi">Regular EMI (part interest)</option>
                  <option value="prepayment">Prepayment (all principal)</option>
                </select>
              </label>
              <button class="primary sm" type="submit">Save</button>
            </form>
          }

          @if (v.payments.length) {
            <details>
              <summary>{{ v.payments.length }} payment{{ v.payments.length > 1 ? 's' : '' }} · {{ inr(sumPaid(v.payments)) }} paid</summary>
              <ul class="payments">
                @for (p of v.payments; track p.id) {
                  <li>
                    <div>
                      <strong>{{ inr(p.amount) }}</strong>
                      <span class="muted small">{{ p.date }} · {{ p.kind === 'emi' ? 'EMI' : 'Prepayment' }}</span>
                      <span class="muted small">Principal {{ inr(p.principal) }} · Interest {{ inr(p.interest) }}</span>
                    </div>
                    <button class="link danger" (click)="store.deletePayment(p.id)">Undo</button>
                  </li>
                }
              </ul>
            </details>
          }
        </article>
      }
    </div>
  `,
})
export class Loans {
  protected readonly store = inject(Store);
  protected readonly inr = inr;
  protected readonly durationLabel = durationLabel;
  protected readonly monthLabel = monthLabel;
  protected readonly monthlyRate = monthlyRate;

  /** undefined = no form; null = new loan; Loan = editing that loan */
  readonly editing = signal<Loan | null | undefined>(undefined);
  readonly payingId = signal<string | null>(null);
  payDate = '';
  payAmount: number | null = null;
  payKind: Payment['kind'] = 'emi';

  readonly views = computed<LoanView[]>(() => {
    const payments = this.store.payments();
    return this.store.loans().map((loan) => {
      const months = monthsToClose(loan.outstanding, loan.annualRate, loan.emi);
      const sim = simulate([{ id: loan.id, balance: loan.outstanding, annualRate: loan.annualRate, emi: loan.emi }], null, 'avalanche');
      const paidPct = loan.principal > 0 ? Math.round(Math.min(100, Math.max(0, (1 - loan.outstanding / loan.principal) * 100))) : 0;
      return {
        loan,
        paidPct,
        months,
        interestLeft: sim.totalInterest,
        payments: payments.filter((p) => p.loanId === loan.id).sort((a, b) => b.date.localeCompare(a.date)),
        emiTooLow: months === null && loan.outstanding > 0.5,
      };
    });
  });

  sumPaid = (ps: Payment[]) => sum(ps.map((p) => p.amount));

  save(loan: Loan) {
    this.store.saveLoan(loan);
    this.editing.set(undefined);
  }

  remove(loan: Loan) {
    if (confirm(`Delete "${loan.name}" and its payment history?`)) this.store.deleteLoan(loan.id);
  }

  togglePay(id: string) {
    if (this.payingId() === id) {
      this.payingId.set(null);
      return;
    }
    const loan = this.store.loans().find((l) => l.id === id);
    this.payDate = new Date().toISOString().slice(0, 10);
    this.payAmount = loan ? Math.round(Math.min(loan.emi, loan.outstanding * (1 + monthlyRate(loan.annualRate)))) : null;
    this.payKind = 'emi';
    this.payingId.set(id);
  }

  logPayment(loan: Loan) {
    if (!this.payAmount || !this.payDate) return;
    this.store.logPayment(loan.id, this.payDate, this.payAmount, this.payKind);
    this.payingId.set(null);
  }
}
