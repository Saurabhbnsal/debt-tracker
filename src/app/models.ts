export type Strategy = 'avalanche' | 'snowball';

export interface Loan {
  id: string;
  name: string;
  lender: string;
  /** Original sanctioned / total loan amount */
  principal: number;
  /** Annual interest rate in percent, e.g. 10.5 */
  annualRate: number;
  /** Original tenure in months */
  tenureMonths: number;
  /** Loan start month, 'YYYY-MM' */
  startDate: string;
  /** Monthly EMI / payment */
  emi: number;
  /** Current outstanding balance */
  outstanding: number;
  notes: string;
}

export interface Payment {
  id: string;
  loanId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  amount: number;
  kind: 'emi' | 'prepayment';
  interest: number;
  principal: number;
}

export interface AppData {
  version: 1;
  loans: Loan[];
  payments: Payment[];
  /** Total amount you can put towards debt each month; null = sum of EMIs */
  monthlyBudget: number | null;
  strategy: Strategy;
}
