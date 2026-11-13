import { Component, input, output, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Loan } from './models';
import { calcEmi, inr, monthsSince, outstandingAfter } from './finance';
import { newId } from './store';

@Component({
  selector: 'app-loan-form',
  imports: [FormsModule],
  template: `
    <form class="card form" (ngSubmit)="submit()" #f="ngForm">
      <h2>{{ loan() ? 'Edit loan' : 'Add a loan' }}</h2>
      <div class="grid">
        <label>Loan name
          <input name="name" [(ngModel)]="m.name" required placeholder="e.g. Home loan" />
        </label>
        <label>Lender
          <input name="lender" [(ngModel)]="m.lender" placeholder="e.g. HDFC" />
        </label>
        <label>Total loan amount (₹)
          <input name="principal" type="number" inputmode="decimal" min="1" [(ngModel)]="m.principal" required />
        </label>
        <label>Interest rate (% per year)
          <input name="annualRate" type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="m.annualRate" required />
        </label>
        <label>Tenure (months)
          <input name="tenureMonths" type="number" inputmode="decimal" min="1" [(ngModel)]="m.tenureMonths" required />
          <small>{{ years() }}</small>
        </label>
        <label>Start month
          <input name="startDate" type="month" [(ngModel)]="m.startDate" required />
        </label>
        <label>Monthly payment / EMI (₹)
          <input name="emi" type="number" inputmode="decimal" min="0" [(ngModel)]="m.emi" required />
          <button type="button" class="link" (click)="fillEmi()">Calculate from amount, rate &amp; tenure</button>
        </label>
        <label>Outstanding today (₹)
          <input name="outstanding" type="number" inputmode="decimal" min="0" [(ngModel)]="m.outstanding" required />
          <button type="button" class="link" (click)="fillOutstanding()">Estimate from start month &amp; EMI</button>
        </label>
        <label class="wide">Notes
          <input name="notes" [(ngModel)]="m.notes" placeholder="Optional" />
        </label>
      </div>
      @if (hint) {
        <p class="hint">{{ hint }}</p>
      }
      <div class="actions">
        <button type="button" class="ghost" (click)="cancel.emit()">Cancel</button>
        <button type="submit" class="primary" [disabled]="f.invalid">Save loan</button>
      </div>
    </form>
  `,
})
export class LoanForm implements OnInit {
  readonly loan = input<Loan | null>(null);
  readonly saved = output<Loan>();
  readonly cancel = output<void>();

  m!: Loan;
  hint = '';

  ngOnInit() {
    const now = new Date();
    this.m = this.loan()
      ? { ...this.loan()! }
      : {
          id: newId(),
          name: '',
          lender: '',
          principal: null as unknown as number,
          annualRate: null as unknown as number,
          tenureMonths: null as unknown as number,
          startDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          emi: null as unknown as number,
          outstanding: null as unknown as number,
          notes: '',
        };
  }

  years() {
    const n = this.m.tenureMonths;
    return n > 0 ? `${(n / 12).toFixed(1).replace(/\.0$/, '')} years` : '';
  }

  fillEmi() {
    const { principal, annualRate, tenureMonths } = this.m;
    if (!(principal > 0) || annualRate == null || !(tenureMonths > 0)) {
      this.hint = 'Enter the total amount, interest rate and tenure first.';
      return;
    }
    this.m.emi = Math.round(calcEmi(principal, annualRate, tenureMonths));
    this.hint = `Calculated EMI: ${inr(this.m.emi)}. Change it if your actual payment differs.`;
  }

  fillOutstanding() {
    const { principal, annualRate, emi, startDate } = this.m;
    if (!(principal > 0) || annualRate == null || !(emi > 0) || !startDate) {
      this.hint = 'Enter the amount, rate, EMI and start month first.';
      return;
    }
    const paid = monthsSince(startDate);
    this.m.outstanding = Math.round(outstandingAfter(principal, annualRate, emi, paid));
    this.hint = `Estimated after ${paid} EMIs. Check this against your lender's statement, which is more accurate.`;
  }

  submit() {
    this.saved.emit({ ...this.m, name: this.m.name.trim() });
  }
}
