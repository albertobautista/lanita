// Pure financial logic (no database, no React). Used on the server and by the simulator.
// Amounts in cents; period "YYYY-MM" = month in which the statement payment is due.

import type {
  Account, BankStatement, Budget, Card, CardPayment, Contribution, Goal, Purchase, Recurring, RecurringPrice, Transaction, Transfer,
} from "@/db/schema";
import { money } from "./format";
import { addMonths, dateInPeriod, dayOf, daysBetween, monthsBetween, periodOf, periodRange } from "./periods";

export type Data = {
  accounts: Account[];
  cards: Card[];
  purchases: Purchase[];
  recurring: Recurring[];
  prices: RecurringPrice[];
  transactions: Transaction[];
  payments: CardPayment[];
  bankStatements: BankStatement[];
  transfers: Transfer[];
  budgets: Budget[];
  goals: Goal[];
  contributions: Contribution[];
};

export const VAT = 0.16;

type CardCycle = Pick<Card, "cutoffDay" | "dueDay">;

/** Period in which a purchase made on `date` is paid: the next cutoff and then its due date. */
export function paymentPeriod(c: CardCycle, date: string) {
  const closing = dayOf(date) <= c.cutoffDay ? periodOf(date) : addMonths(periodOf(date), 1);
  return c.dueDay > c.cutoffDay ? closing : addMonths(closing, 1);
}

export function dueDate(c: CardCycle, period: string) {
  return dateInPeriod(period, c.dueDay);
}

/** Cutoff date of the statement due in `period`. */
export function cutoffDate(c: CardCycle, period: string) {
  return dateInPeriod(c.dueDay > c.cutoffDay ? period : addMonths(period, -1), c.cutoffDay);
}

// ---------- installment purchases ----------

export type ScheduledPayment = { period: string; amount: number; principal: number; interest: number; settlement: boolean };

export type PurchasePlan = Pick<Purchase, "amount" | "months" | "date" | "annualRate" | "withVat" | "settledPeriod">;

export function monthlyRate(p: Pick<Purchase, "annualRate" | "withVat">) {
  return (p.annualRate / 10000 / 12) * (p.withVat ? 1 + VAT : 1);
}

/** Payment schedule of an installment purchase (with or without interest), cut short if paid off early. */
export function purchaseSchedule(p: PurchasePlan, c: CardCycle): ScheduledPayment[] {
  const n = Math.max(1, p.months);
  const start = paymentPeriod(c, p.date);
  const r = monthlyRate(p);
  const installment = r > 0 ? Math.round((p.amount * r) / (1 - Math.pow(1 + r, -n))) : Math.floor(p.amount / n);
  const payments: ScheduledPayment[] = [];
  let balance = p.amount;
  for (let k = 0; k < n; k++) {
    const period = addMonths(start, k);
    if (p.settledPeriod && period >= p.settledPeriod) {
      if (balance > 0) payments.push({ period: p.settledPeriod, amount: balance, principal: balance, interest: 0, settlement: true });
      return payments;
    }
    const interest = Math.round(balance * r);
    const principal = k === n - 1 ? balance : Math.min(balance, installment - interest);
    payments.push({ period, amount: principal + interest, principal, interest, settlement: false });
    balance -= principal;
  }
  return payments;
}

export function planSummary(p: PurchasePlan, c: CardCycle) {
  const schedule = purchaseSchedule(p, c);
  const installment = schedule.find((x) => !x.settlement)?.amount ?? 0;
  const total = schedule.reduce((s, x) => s + x.amount, 0);
  return {
    schedule,
    installment,
    start: schedule[0]?.period ?? paymentPeriod(c, p.date),
    end: schedule.at(-1)?.period ?? paymentPeriod(c, p.date),
    total,
    interest: total - p.amount,
  };
}

// ---------- recurring charges and subscriptions ----------

export function currentPrice(prices: RecurringPrice[], recurringId: string, period: string) {
  let best: RecurringPrice | undefined;
  for (const p of prices) if (p.recurringId === recurringId && p.startPeriod <= period && (!best || p.startPeriod > best.startPeriod)) best = p;
  return best?.amount ?? 0;
}

/** Amount the recurring charge generates in `period` (0 if not due that month, not started yet or canceled). */
export function chargeInPeriod(r: Recurring, prices: RecurringPrice[], period: string) {
  if (period < r.startPeriod || (r.endPeriod && period > r.endPeriod)) return 0;
  if (r.frequency === "yearly" && Number(period.slice(5)) !== (r.yearlyMonth ?? Number(r.startPeriod.slice(5)))) return 0;
  return currentPrice(prices, r.id, period);
}

export function monthlyEquivalentCost(r: Recurring, prices: RecurringPrice[], period: string) {
  if (r.endPeriod && r.endPeriod < period) return 0;
  const price = currentPrice(prices, r.id, period < r.startPeriod ? r.startPeriod : period);
  return r.frequency === "yearly" ? Math.round(price / 12) : price;
}

export function nextCharge(r: Recurring, prices: RecurringPrice[], today: string) {
  for (let i = 0; i < 24; i++) {
    const period = addMonths(periodOf(today), i);
    const amount = chargeInPeriod(r, prices, period);
    const date = dateInPeriod(period, r.day);
    if (amount > 0 && date >= today) return { date, amount };
  }
  return null;
}

/** Occurrences that should have been charged up to `today` and do not exist yet as transactions. */
export function pendingOccurrences(d: Pick<Data, "recurring" | "prices" | "transactions">, today: string) {
  const done = new Set(d.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.period}`));
  const out: { recurring: Recurring; period: string; date: string; amount: number }[] = [];
  for (const r of d.recurring) {
    const last = r.endPeriod && r.endPeriod < periodOf(today) ? r.endPeriod : periodOf(today);
    for (let p = r.startPeriod; p <= last; p = addMonths(p, 1)) {
      const date = dateInPeriod(p, r.day);
      if (date > today || done.has(`${r.id}|${p}`)) continue;
      const amount = chargeInPeriod(r, d.prices, p);
      if (amount > 0) out.push({ recurring: r, period: p, date, amount });
    }
  }
  return out;
}

// ---------- main engine ----------

export type PaymentStatus = "no_charges" | "paid" | "advance" | "minimum" | "partial" | "overdue" | "due_soon" | "pending";

export type CardStatement = {
  period: string;
  cutoffDate: string;
  dueDate: string;
  installments: { purchase: Purchase; payment: ScheduledPayment }[];
  charges: Transaction[];
  installmentsTotal: number;
  chargesTotal: number;
  previousBalance: number;
  /** What the app calculated from what was recorded. */
  calculated: number;
  /** Bank figures, if recorded. */
  bank: BankStatement | null;
  /** bank − calculated: expenses you forgot to record (positive) or that are extra (negative). */
  difference: number;
  /** What remains owed (or in your favor if negative) before payments; carried to the next month. */
  netCharges: number;
  /** Payment to avoid interest. */
  noInterestPayment: number;
  minimumPayment: number;
  estimatedInterest: number;
  paid: number;
  /** What is still owed to avoid interest after the payments made so far. */
  remaining: number;
  status: PaymentStatus;
  daysUntilDue: number;
};

export class Finance {
  readonly today: string;
  readonly current: string;
  private statements = new Map<string, CardStatement>();
  private schedules = new Map<string, ScheduledPayment[]>();

  constructor(readonly d: Data, today: string) {
    this.today = today;
    this.current = periodOf(today);
  }

  card(id: string | null | undefined) {
    return this.d.cards.find((c) => c.id === id);
  }
  account(id: string | null | undefined) {
    return this.d.accounts.find((a) => a.id === id);
  }

  schedule(p: Purchase) {
    let s = this.schedules.get(p.id);
    if (!s) {
      const c = this.card(p.cardId);
      s = c ? purchaseSchedule(p, c) : [];
      this.schedules.set(p.id, s);
    }
    return s;
  }

  private firstPeriod(c: Card) {
    let first = this.current;
    for (const p of this.d.purchases) if (p.cardId === c.id) { const s = this.schedule(p)[0]?.period; if (s && s < first) first = s; }
    for (const t of this.d.transactions) if (t.cardId === c.id && t.type === "expense") { const s = paymentPeriod(c, t.date); if (s < first) first = s; }
    for (const p of this.d.payments) if (p.cardId === c.id && p.period < first) first = p.period;
    return first;
  }

  /** Earliest statement whose due date already passed with nothing paid, if any. */
  firstOverduePeriod(c: Card) {
    for (let p = this.firstPeriod(c); p <= this.current; p = addMonths(p, 1)) if (this.statement(c, p).status === "overdue") return p;
    return null;
  }

  /** Card statement for the payment due in `period`. */
  statement(c: Card, period: string): CardStatement {
    const key = `${c.id}|${period}`;
    const hit = this.statements.get(key);
    if (hit) return hit;

    const prev = period > this.firstPeriod(c) ? this.statement(c, addMonths(period, -1)) : null;
    // What was left unpaid (or in your favor, if negative) from the previous month. A statement not yet due can still
    // be paid in full, so it only carries over once its due date passes; until then each month shows just its own charges.
    const prevBalance = prev ? prev.netCharges - prev.paid : 0;
    const previousBalance = prev && (prevBalance < 0 || prev.daysUntilDue < 0) ? prevBalance : 0;

    const installments = this.d.purchases
      .filter((p) => p.cardId === c.id)
      .flatMap((purchase) => this.schedule(purchase).filter((x) => x.period === period).map((payment) => ({ purchase, payment })));
    const charges = this.d.transactions.filter((t) => t.cardId === c.id && t.type === "expense" && paymentPeriod(c, t.date) === period);
    const installmentsTotal = installments.reduce((s, x) => s + x.payment.amount, 0);
    const chargesTotal = charges.reduce((s, t) => s + t.amount, 0);
    const calculatedNet = installmentsTotal + chargesTotal + previousBalance;
    const calculated = Math.max(0, calculatedNet);
    const bank = this.d.bankStatements.find((b) => b.cardId === c.id && b.period === period) ?? null;
    const netCharges = bank ? bank.noInterestPayment : calculatedNet;
    const noInterestPayment = Math.max(0, netCharges);
    const revolving = Math.max(0, noInterestPayment - installmentsTotal);
    const fixed = Math.max(Math.round((revolving * c.minPctBalance) / 10000), Math.round((c.creditLimit * c.minPctLimit) / 10000));
    const minimumPayment = bank?.minimumPayment ?? Math.min(noInterestPayment, installmentsTotal + fixed);
    const estimatedInterest = previousBalance > 0 ? Math.round((previousBalance * c.annualRate * (1 + VAT)) / 10000 / 12) : 0;
    const paid = this.d.payments.filter((p) => p.cardId === c.id && p.period === period).reduce((s, p) => s + p.amount, 0);
    const due = dueDate(c, period);
    const daysUntilDue = daysBetween(this.today, due);

    let status: PaymentStatus;
    if (noInterestPayment === 0) status = paid > 0 || previousBalance < 0 ? "paid" : "no_charges";
    else if (paid >= noInterestPayment) status = "paid";
    // A payment before the due date is an advance: the rest can still be paid without interest.
    else if (paid > 0 && daysUntilDue >= 0) status = "advance";
    else if (paid > 0 && paid >= minimumPayment) status = "minimum";
    else if (paid > 0) status = "partial";
    else if (daysUntilDue < 0) status = "overdue";
    else if (daysUntilDue <= 5) status = "due_soon";
    else status = "pending";

    const st: CardStatement = {
      period, cutoffDate: cutoffDate(c, period), dueDate: due, installments, charges, installmentsTotal, chargesTotal,
      previousBalance, calculated, bank, difference: bank ? bank.noInterestPayment - calculated : 0, netCharges, noInterestPayment, minimumPayment, estimatedInterest, paid, remaining: Math.max(0, noInterestPayment - paid), status, daysUntilDue,
    };
    this.statements.set(key, st);
    return st;
  }

  /** Credit used: recorded purchases and charges minus payments, plus interest already accrued. */
  used(c: Card) {
    const charges = this.d.transactions.filter((t) => t.cardId === c.id && t.type === "expense").reduce((s, t) => s + t.amount, 0);
    let purchases = 0;
    for (const p of this.d.purchases.filter((p) => p.cardId === c.id)) {
      purchases += p.amount + this.schedule(p).filter((x) => x.period <= this.current).reduce((s, x) => s + x.interest, 0);
    }
    const payments = this.d.payments.filter((p) => p.cardId === c.id).reduce((s, p) => s + p.amount, 0);
    // What the bank charged above or below what was recorded also takes (or frees) credit.
    const adjustments = this.d.bankStatements.filter((b) => b.cardId === c.id).reduce((s, b) => s + this.statement(c, b.period).difference, 0);
    return Math.max(0, charges + purchases + adjustments - payments);
  }

  available(c: Card) {
    return c.creditLimit - this.used(c);
  }

  purchaseStatus(p: Purchase) {
    const c = this.card(p.cardId);
    const schedule = this.schedule(p);
    // An installment counts as paid once its statement's due date has passed, or earlier if a payment covering that
    // statement was recorded. A credit balance carried from earlier months does not pay future installments ahead.
    const covered = schedule.filter((x) => {
      if (!c) return false;
      if (dueDate(c, x.period) < this.today) return true;
      const st = this.statement(c, x.period);
      return st.paid > 0 && st.paid >= st.noInterestPayment;
    });
    const plan = c ? planSummary(p, c) : null;
    const remaining = schedule.filter((x) => !covered.includes(x)).reduce((s, x) => s + x.amount, 0);
    return {
      card: c,
      schedule,
      installment: plan?.installment ?? 0,
      start: plan?.start ?? this.current,
      end: plan?.end ?? this.current,
      total: plan?.total ?? p.amount,
      interest: plan?.interest ?? 0,
      months: p.settledPeriod ? schedule.length : p.months,
      paidCount: covered.length,
      // Banks number installments by statement: once a cutoff passes, its installment shows as "n of N" before it is paid.
      billedCount: c ? schedule.filter((x) => cutoffDate(c, x.period) <= this.today).length : covered.length,
      remaining,
      active: covered.length < schedule.length,
      settled: !!p.settledPeriod,
    };
  }

  /** Installments of purchases due in `period` (all cards, or one). */
  installmentsIn(period: string, cardId?: string) {
    let s = 0;
    for (const p of this.d.purchases) if (!cardId || p.cardId === cardId) for (const x of this.schedule(p)) if (x.period === period) s += x.amount;
    return s;
  }

  /** Month a transaction counts in: card expenses count when their statement is due, everything else on its date. */
  countingPeriod(t: Pick<Transaction, "type" | "date" | "cardId">) {
    const c = t.type === "expense" ? this.card(t.cardId) : undefined;
    return c ? paymentPeriod(c, t.date) : periodOf(t.date);
  }

  /** Recurring charges not yet recorded as transactions that count in `period` (projection). */
  projected(period: string) {
    const done = new Set(this.d.transactions.filter((t) => t.recurringId && t.period).map((t) => `${t.recurringId}|${t.period}`));
    const out: { recurring: Recurring; amount: number; date: string }[] = [];
    for (const r of this.d.recurring) {
      // A card charge is paid with its statement, up to two months after it is made.
      const charged = r.type === "expense" && this.card(r.cardId) ? [addMonths(period, -2), addMonths(period, -1), period] : [period];
      for (const p of charged) {
        const date = dateInPeriod(p, r.day);
        if (done.has(`${r.id}|${p}`) || date < this.today || this.countingPeriod({ type: r.type, date, cardId: r.cardId }) !== period) continue;
        const amount = chargeInPeriod(r, this.d.prices, p);
        if (amount > 0) out.push({ recurring: r, amount, date });
      }
    }
    return out;
  }

  monthSummary(period: string) {
    const txs = this.d.transactions.filter((t) => this.countingPeriod(t) === period);
    const proj = this.projected(period);
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const projectedIncome = proj.filter((x) => x.recurring.type === "income").reduce((s, x) => s + x.amount, 0);
    const projectedExpenses = proj.filter((x) => x.recurring.type === "expense").reduce((s, x) => s + x.amount, 0);
    const installments = this.installmentsIn(period);
    const byCategory = new Map<string, number>();
    for (const t of txs) if (t.type === "expense") byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    for (const p of this.d.purchases) for (const x of this.schedule(p)) if (x.period === period) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + x.amount);
    return {
      income, expenses, installments, projectedIncome, projectedExpenses,
      total: expenses + installments,
      balance: income - expenses - installments,
      expectedBalance: income + projectedIncome - expenses - projectedExpenses - installments,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }

  accountBalance(a: Account) {
    let s = a.openingBalance;
    for (const t of this.d.transactions) if (t.accountId === a.id) s += t.type === "income" ? t.amount : -t.amount;
    for (const p of this.d.payments) if (p.accountId === a.id) s -= p.amount;
    for (const t of this.d.transfers) { if (t.fromAccountId === a.id) s -= t.amount; if (t.toAccountId === a.id) s += t.amount; }
    for (const c of this.d.contributions) if (c.accountId === a.id) s -= c.amount;
    return s;
  }

  budgets(period: string) {
    const byCategory = new Map(this.monthSummary(period).byCategory);
    return this.d.budgets
      .map((b) => {
        const spent = byCategory.get(b.category) ?? 0;
        const pct = b.amount > 0 ? spent / b.amount : 0;
        return { budget: b, spent, remaining: b.amount - spent, pct, level: pct >= 1 ? "over" : pct >= 0.85 ? "warning" : "ok" } as const;
      })
      .sort((a, b) => b.pct - a.pct);
  }

  goalStatus(g: Goal) {
    const saved = this.d.contributions.filter((c) => c.goalId === g.id).reduce((s, c) => s + c.amount, 0);
    const remaining = Math.max(0, g.target - saved);
    const monthsLeft = g.targetDate ? Math.max(1, monthsBetween(this.current, periodOf(g.targetDate)) + 1) : null;
    return {
      saved, remaining, pct: g.target > 0 ? Math.min(1, saved / g.target) : 0,
      monthsLeft,
      perMonth: monthsLeft ? Math.ceil(remaining / monthsLeft) : null,
      overdue: !!g.targetDate && g.targetDate < this.today && remaining > 0,
    };
  }

  /** Which card to use today: the one that gives the most days to pay, with available credit. */
  bestCardToday() {
    return this.d.cards
      .map((c) => {
        const period = paymentPeriod(c, this.today);
        const due = dueDate(c, period);
        return { card: c, period, dueDate: due, days: daysBetween(this.today, due), available: this.available(c) };
      })
      .sort((a, b) => Number(b.available > 0) - Number(a.available > 0) || b.days - a.days);
  }

  /** Typical monthly income: active recurring income, or the average of the last 3 months. */
  typicalMonthlyIncome() {
    const fixed = this.d.recurring.filter((r) => r.type === "income").reduce((s, r) => s + monthlyEquivalentCost(r, this.d.prices, this.current), 0);
    if (fixed > 0) return fixed;
    const months = [1, 2, 3].map((i) => this.monthSummary(addMonths(this.current, -i)).income);
    return Math.round(months.reduce((a, b) => a + b, 0) / 3);
  }

  // Alert texts are shown in the app, so they stay in Spanish.
  alerts() {
    const out: { level: "critical" | "warning" | "info"; text: string; href: string }[] = [];
    for (const c of this.d.cards) {
      for (const period of [addMonths(this.current, -1), this.current, addMonths(this.current, 1)]) {
        const st = this.statement(c, period);
        const href = `/cards/${c.id}?month=${period}`;
        if (st.status === "overdue") out.push({ level: "critical", text: `${c.name}: el pago de ${shortPeriodLabel(period)} venció hace ${-st.daysUntilDue} días`, href });
        if (st.status === "due_soon") out.push({ level: "warning", text: `${c.name}: paga antes del ${Number(st.dueDate.slice(8))} (en ${st.daysUntilDue} días) para no generar intereses`, href });
        if (st.status === "advance" && st.daysUntilDue <= 5) {
          const when = st.daysUntilDue === 0 ? "hoy" : `antes del ${Number(st.dueDate.slice(8))} (en ${st.daysUntilDue} días)`;
          out.push({ level: "warning", text: `${c.name}: te faltan ${money(st.remaining)}; págalos ${when} para no generar intereses`, href });
        }
      }
      const u = c.creditLimit > 0 ? this.used(c) / c.creditLimit : 0;
      if (u >= 0.9) out.push({ level: "warning", text: `${c.name}: usas el ${Math.round(u * 100)} % de tu límite`, href: "/cards" });
    }
    for (const b of this.budgets(this.current)) {
      if (b.level === "over") out.push({ level: "warning", text: `Te pasaste del presupuesto de ${b.budget.category}`, href: "/budgets" });
      else if (b.level === "warning") out.push({ level: "info", text: `Llevas el ${Math.round(b.pct * 100)} % del presupuesto de ${b.budget.category}`, href: "/budgets" });
    }
    for (const r of this.d.recurring.filter((r) => r.type === "expense")) {
      const next = nextCharge(r, this.d.prices, this.today);
      if (!next) continue;
      const days = daysBetween(this.today, next.date);
      const day = Number(next.date.slice(8));
      // Fixed bills are warned like a card payment; subscriptions charge themselves, so a short notice is enough.
      if (r.isSubscription) {
        if (days <= 3) out.push({ level: "info", text: `${r.description} se cobra el ${day}`, href: "/subscriptions" });
      } else if (days <= 5) {
        const when = days === 0 ? "hoy" : `en ${days} ${days === 1 ? "día" : "días"}`;
        out.push({ level: "warning", text: `${r.description}: ${r.cardId ? "se cobra" : "paga"} el ${day} (${when})`, href: "/subscriptions" });
      }
    }
    const order = { critical: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  /** Simulates a new purchase: how the next months' payments and the available credit change. */
  simulate(purchase: PurchasePlan & { cardId: string }, months = 12) {
    const c = this.card(purchase.cardId);
    if (!c) return null;
    const plan = planSummary(purchase, c);
    const rows = periodRange(this.current, months).map((period) => {
      // Future months assume each statement gets paid in full, so unpaid balances are not carried forever.
      const before = this.d.cards.reduce((s, x) => {
        const st = this.statement(x, period);
        return s + (period > this.current ? st.installmentsTotal + st.chargesTotal : st.noInterestPayment);
      }, 0);
      const extra = plan.schedule.filter((x) => x.period === period).reduce((s, x) => s + x.amount, 0);
      const fixed = this.d.recurring.filter((r) => r.type === "expense" && !r.cardId).reduce((s, r) => s + chargeInPeriod(r, this.d.prices, period), 0);
      return { period, before, extra, after: before + extra, fixed };
    });
    const availableBefore = this.available(c);
    return {
      plan,
      rows,
      card: c,
      availableBefore,
      availableAfter: availableBefore - purchase.amount,
      income: this.typicalMonthlyIncome(),
      peakAfter: Math.max(...rows.map((r) => r.after + r.fixed)),
    };
  }
}

export function shortPeriodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", { month: "short", year: "numeric" }).replace(".", "");
}

/**
 * Payments that settle, in full and in order, every statement of a card that is past due with nothing paid.
 * For when you start using the app with months you already paid at the bank but never recorded.
 */
export function overduePayments(d: Data, today: string, cardId: string) {
  const out: { cardId: string; period: string; amount: number; date: string }[] = [];
  for (let i = 0; i < 240; i++) {
    const f = new Finance({ ...d, payments: [...d.payments, ...out.map((p, k) => ({ ...p, id: `new-${k}`, accountId: null, isSample: false, createdAt: today }))] }, today);
    const c = f.card(cardId);
    const period = c && f.firstOverduePeriod(c);
    if (!c || !period) break;
    const st = f.statement(c, period);
    out.push({ cardId, period, amount: st.noInterestPayment - st.paid, date: st.dueDate });
  }
  return out;
}
