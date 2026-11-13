import { Component, computed, inject, signal } from '@angular/core';
import { Store } from './store';
import { Loans } from './loans';
import { Plan } from './plan';
import { durationLabel, inr, monthLabel, simulate } from './finance';

type Tab = 'loans' | 'plan' | 'backup';

@Component({
  selector: 'app-root',
  imports: [Loans, Plan],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(Store);
  protected readonly inr = inr;
  protected readonly durationLabel = durationLabel;
  protected readonly monthLabel = monthLabel;
  readonly tab = signal<Tab>('loans');
  readonly message = signal('');

  readonly plan = computed(() =>
    simulate(
      this.store.activeLoans().map((l) => ({ id: l.id, balance: l.outstanding, annualRate: l.annualRate, emi: l.emi })),
      this.store.effectiveBudget(),
      'snowball',
    ),
  );
  readonly repaidPct = computed(() => {
    const p = this.store.totalPrincipal();
    return p > 0 ? Math.round(Math.max(0, (1 - this.store.totalOutstanding() / p) * 100)) : 0;
  });

  exportData() {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `debt-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.message.set('Backup downloaded.');
  }

  async importData(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!confirm('Replace all current data with this backup?')) return;
    try {
      this.store.importJson(await file.text());
      this.message.set('Backup restored.');
    } catch (e) {
      this.message.set(`Couldn't restore: ${(e as Error).message}`);
    }
    (ev.target as HTMLInputElement).value = '';
  }
}
