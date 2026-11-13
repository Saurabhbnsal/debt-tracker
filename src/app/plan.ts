import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from './store';
import { PlanResult, SimLoan, durationLabel, inr, monthLabel, simulate } from './finance';

@Component({
  selector: 'app-plan',
  imports: [FormsModule],
  template: `
    @if (!store.activeLoans().length) {
      <div class="card empty"><p>Add a loan with a balance to build your payoff plan.</p></div>
    } @else {
      <section class="card">
        <h2>I can pay each month</h2>
        <p class="muted small">Your EMIs ({{ inr(store.totalEmi()) }}) are paid first. Anything above that goes to your smallest loan. When it closes, its EMI rolls into the next smallest (snowball).</p>
        <label class="budget">
          <span>₹</span>
          <input type="number" inputmode="decimal" min="0" step="1000" [ngModel]="store.monthlyBudget()" (ngModelChange)="setBudget($event)" />
        </label>
        <div class="chips">
          @for (x of bumps; track x) {
            <button class="chip" (click)="setBudget(store.totalEmi() + x)">+{{ inr(x) }}</button>
          }
          @if (store.budgetIsCustom()) {
            <button class="chip" (click)="store.setBudget(null)">Reset to EMIs</button>
          }
        </div>
        @if (shortfall() > 0) {
          <p class="warn">This is {{ inr(shortfall()) }} less than your total EMIs. The plan below assumes you pay at least your EMIs ({{ inr(store.totalEmi()) }}).</p>
        } @else if (store.extraPayment() > 0) {
          <p class="good">{{ inr(store.extraPayment()) }} extra each month goes into the snowball, starting with {{ order()[0]?.name }}.</p>
        } @else {
          <p class="hint">Paying only your EMIs. Add anything extra to clear your debt sooner.</p>
        }
      </section>

      <section class="card hero">
        <span class="muted">Debt free in</span>
        <strong class="big">{{ durationLabel(plan().months) }}</strong>
        <span>{{ plan().months === null ? 'Increase your budget to close all loans' : 'by ' + monthLabel(plan().months!) }}</span>
        @if (monthsSaved() > 0 || interestSaved() > 1) {
          <p class="good">{{ durationLabel(monthsSaved()) }} sooner and {{ inr(interestSaved()) }} less interest than paying only EMIs</p>
        }
      </section>

      <section class="card">
        <h2>Balance over time</h2>
        <svg class="chart" viewBox="0 0 320 150" preserveAspectRatio="none" role="img" aria-label="Total outstanding over time">
          <polyline class="base" [attr.points]="points(baseline())" />
          <polyline class="line" [attr.points]="points(plan())" />
        </svg>
        <div class="legend">
          <span><i class="sw line"></i>Your plan</span>
          <span><i class="sw base"></i>EMIs only</span>
          <span class="muted">{{ chartEnd() }}</span>
        </div>
      </section>

      <section class="card">
        <h2>Compare</h2>
        <div class="compare">
          @for (s of scenarios(); track s.label) {
            <div [class.on]="s.on">
              <span class="muted small">{{ s.label }}</span>
              <strong>{{ durationLabel(s.r.months) }}</strong>
              <span class="small">{{ inr(s.r.totalInterest) }} interest</span>
            </div>
          }
        </div>
      </section>

      <section class="card">
        <h2>Payoff order</h2>
        <ol class="order">
          @for (o of order(); track o.id) {
            <li>
              <div>
                <strong>{{ o.name }}</strong>
                <span class="muted small">{{ inr(o.balance) }} · {{ o.rate }}%</span>
              </div>
              <div class="right">
                <strong>{{ o.month === null ? 'Never' : monthLabel(o.month) }}</strong>
                <span class="muted small">{{ durationLabel(o.month) }}</span>
              </div>
            </li>
          }
        </ol>
      </section>
    }
  `,
})
export class Plan {
  protected readonly store = inject(Store);
  protected readonly inr = inr;
  protected readonly durationLabel = durationLabel;
  protected readonly monthLabel = monthLabel;
  protected readonly bumps = [2000, 5000, 10000];

  private readonly sim = computed<SimLoan[]>(() =>
    this.store.activeLoans().map((l) => ({ id: l.id, balance: l.outstanding, annualRate: l.annualRate, emi: l.emi })),
  );
  readonly baseline = computed(() => simulate(this.sim(), null, 'avalanche'));
  readonly plan = computed(() => simulate(this.sim(), this.store.effectiveBudget(), 'snowball'));
  /** Shown for reference only. */
  private readonly avalanche = computed(() => simulate(this.sim(), this.store.effectiveBudget(), 'avalanche'));

  readonly shortfall = computed(() => this.store.totalEmi() - this.store.monthlyBudget());
  readonly monthsSaved = computed(() => {
    const b = this.baseline().months, p = this.plan().months;
    return b !== null && p !== null ? Math.max(0, b - p) : 0;
  });
  readonly interestSaved = computed(() => Math.max(0, this.baseline().totalInterest - this.plan().totalInterest));

  readonly scenarios = computed(() => [
    { label: 'EMIs only', r: this.baseline(), on: false },
    { label: 'Snowball (you)', r: this.plan(), on: true },
    { label: 'Highest rate first', r: this.avalanche(), on: false },
  ]);

  readonly order = computed(() => {
    const close = this.plan().closeMonth;
    return this.store
      .activeLoans()
      .map((l) => ({ id: l.id, name: l.name, balance: l.outstanding, rate: l.annualRate, month: close[l.id] ?? null }))
      .sort((a, b) => (a.month ?? Infinity) - (b.month ?? Infinity));
  });

  private readonly span = computed(() => Math.max(this.baseline().balances.length, this.plan().balances.length, 2) - 1);
  private readonly peak = computed(() => Math.max(1, this.baseline().balances[0] ?? 1));

  chartEnd = computed(() => `${monthLabel(0)} – ${monthLabel(this.span())}`);

  points(r: PlanResult): string {
    const n = this.span(), max = this.peak();
    return r.balances.map((b, i) => `${((i / n) * 320).toFixed(1)},${(145 - (b / max) * 140).toFixed(1)}`).join(' ');
  }

  setBudget(v: number | null) {
    this.store.setBudget(v === null || isNaN(v as number) ? null : Math.max(0, Number(v)));
  }
}
