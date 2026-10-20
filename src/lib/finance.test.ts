import { describe, expect, it } from "vitest";
import type { Card, CardPayment, Purchase, Recurring, RecurringPrice, Transaction } from "@/db/schema";
import { chargeInPeriod, Finance, nextCharge, overduePayments, paymentPeriod, pendingOccurrences, purchaseSchedule, type Data } from "./finance";
import { addMonths } from "./periods";

const base = { isSample: false, createdAt: "2026-01-01" };
const card = (x: Partial<Card> = {}): Card => ({
  id: "t1", name: "Oro", bank: "", last4: "", creditLimit: 5_000_000, cutoffDay: 5, dueDay: 25, color: "#000",
  minPctBalance: 150, minPctLimit: 125, annualRate: 0, ...base, ...x,
});
const purchase = (x: Partial<Purchase> = {}): Purchase => ({
  id: "c1", cardId: "t1", description: "Refri", category: "Casa", amount: 1_200_000, months: 12, date: "2026-03-10",
  annualRate: 0, withVat: false, settledPeriod: null, ...base, ...x,
});
const expense = (x: Partial<Transaction> = {}): Transaction => ({
  id: crypto.randomUUID(), type: "expense", date: "2026-03-10", amount: 100_000, category: "Súper", description: "", accountId: null,
  cardId: "t1", recurringId: null, period: null, source: "manual", ...base, ...x,
});
const payment = (x: Partial<CardPayment>): CardPayment => ({ id: crypto.randomUUID(), cardId: "t1", period: "2026-04", amount: 0, date: "2026-04-20", accountId: null, ...base, ...x });
const empty = (): Data => ({
  accounts: [], cards: [card()], purchases: [], recurring: [], prices: [], transactions: [], payments: [], bankStatements: [],
  transfers: [], budgets: [], goals: [], contributions: [],
});

describe("paymentPeriod", () => {
  it("on or before the cutoff day falls in that month's statement", () => {
    expect(paymentPeriod({ cutoffDay: 5, dueDay: 25 }, "2026-03-05")).toBe("2026-03");
    expect(paymentPeriod({ cutoffDay: 5, dueDay: 25 }, "2026-03-06")).toBe("2026-04");
  });
  it("if the due day is before the cutoff, it is paid the following month", () => {
    expect(paymentPeriod({ cutoffDay: 20, dueDay: 10 }, "2026-03-15")).toBe("2026-04");
    expect(paymentPeriod({ cutoffDay: 20, dueDay: 10 }, "2026-12-21")).toBe("2027-02");
  });
});

describe("purchaseSchedule", () => {
  it("interest-free installments split the exact amount in cents", () => {
    const s = purchaseSchedule(purchase({ amount: 1_000_000, months: 3 }), card());
    expect(s.map((p) => p.amount)).toEqual([333_333, 333_333, 333_334]);
    expect(s[0].period).toBe("2026-04");
    expect(s.at(-1)!.period).toBe("2026-06");
  });
  it("with interest uses a fixed amortization payment", () => {
    const s = purchaseSchedule(purchase({ annualRate: 3600, withVat: false }), card());
    expect(s[0].amount).toBe(120_555);
    expect(s[0].interest).toBe(36_000);
    expect(s.reduce((t, p) => t + p.principal, 0)).toBe(1_200_000);
  });
  it("settling early cuts the plan and charges the remaining balance", () => {
    const s = purchaseSchedule(purchase({ settledPeriod: "2026-07" }), card());
    expect(s).toHaveLength(4);
    expect(s.at(-1)).toMatchObject({ period: "2026-07", amount: 900_000, settlement: true });
  });
});

describe("card statement", () => {
  it("adds installments and charges, and calculates the minimum", () => {
    const d = empty();
    d.purchases.push(purchase());
    d.transactions.push(expense({ amount: 200_000 }));
    const st = new Finance(d, "2026-04-01").statement(d.cards[0], "2026-04");
    expect(st.noInterestPayment).toBe(300_000);
    // installment + max(1.5 % of 2,000, 1.25 % of 50,000)
    expect(st.minimumPayment).toBe(100_000 + 62_500);
    expect(st.status).toBe("pending");
  });
  it("what is not paid carries over as previous balance", () => {
    const d = empty();
    d.transactions.push(expense({ amount: 200_000 }));
    d.payments.push(payment({ amount: 50_000 }));
    const f = new Finance(d, "2026-05-01");
    expect(f.statement(d.cards[0], "2026-04").status).toBe("partial");
    expect(f.statement(d.cards[0], "2026-05").previousBalance).toBe(150_000);
  });
  it("the real bank statement overrides and shows the difference", () => {
    const d = empty();
    d.transactions.push(expense({ amount: 200_000 }));
    d.bankStatements.push({ id: "e1", cardId: "t1", period: "2026-04", noInterestPayment: 245_000, minimumPayment: 70_000, notes: "", ...base });
    const f = new Finance(d, "2026-04-01");
    const st = f.statement(d.cards[0], "2026-04");
    expect(st).toMatchObject({ noInterestPayment: 245_000, minimumPayment: 70_000, calculated: 200_000, difference: 45_000 });
    expect(f.used(d.cards[0])).toBe(245_000);
    d.payments.push(payment({ amount: 245_000 }));
    const f2 = new Finance(d, "2026-05-01");
    expect(f2.statement(d.cards[0], "2026-04").status).toBe("paid");
    expect(f2.statement(d.cards[0], "2026-05").previousBalance).toBe(0);
    expect(f2.used(d.cards[0])).toBe(0);
  });
  it("a paid installment counts toward progress", () => {
    const d = empty();
    d.purchases.push(purchase());
    d.payments.push(payment({ period: "2026-04", amount: 100_000 }), payment({ period: "2026-05", amount: 100_000 }));
    const st = new Finance(d, "2026-05-10").purchaseStatus(d.purchases[0]);
    expect(st.paidCount).toBe(2);
    expect(st.remaining).toBe(1_000_000);
  });
  it("an installment whose due date already passed counts as paid", () => {
    const d = empty();
    d.cards[0] = card({ cutoffDay: 12, dueDay: 2 });
    d.purchases.push(purchase({ amount: 1_100_000, months: 11, date: "2026-01-01" }));
    const st = new Finance(d, "2026-10-19").purchaseStatus(d.purchases[0]);
    expect(st.schedule[0].period).toBe("2026-02");
    expect(st.end).toBe("2026-12");
    // Feb–Oct are due by Oct 2; Nov (due Nov 2) is still pending.
    expect(st.paidCount).toBe(9);
    expect(st.remaining).toBe(200_000);
  });
  it("counts installments already on a bank statement apart from the paid ones", () => {
    const d = empty();
    d.cards[0] = card({ cutoffDay: 12, dueDay: 2 });
    d.purchases.push(purchase({ amount: 600_000, months: 6, date: "2026-08-31" }));
    const st = new Finance(d, "2026-10-20").purchaseStatus(d.purchases[0]);
    // 1st installment: Sep 12 statement, due Oct 2 (paid). 2nd: Oct 12 statement, due Nov 2 (billed, not due yet).
    expect(st.paidCount).toBe(1);
    expect(st.billedCount).toBe(2);
  });
  it("a credit balance does not mark future installments as paid", () => {
    const d = empty();
    d.purchases.push(purchase({ amount: 600_000, months: 6, date: "2026-06-03" }));
    // Paid much more than June's statement: the extra is carried as credit to the next months.
    d.payments.push(payment({ period: "2026-06", amount: 700_000, date: "2026-06-20" }));
    const f = new Finance(d, "2026-06-21");
    expect(f.statement(d.cards[0], "2026-07").status).toBe("paid");
    const st = f.purchaseStatus(d.purchases[0]);
    expect(st.paidCount).toBe(1);
    expect(st.active).toBe(true);
  });
  it("settles past-due months that were paid at the bank but never recorded", () => {
    const d = empty();
    d.cards[0] = card({ cutoffDay: 12, dueDay: 2 });
    d.purchases.push(purchase({ amount: 1_100_000, months: 11, date: "2026-01-01" }));
    const today = "2026-10-19";
    // Without payments, every unpaid month piles up into October's statement.
    expect(new Finance(d, today).statement(d.cards[0], "2026-10").noInterestPayment).toBe(900_000);
    const payments = overduePayments(d, today, "t1");
    expect(payments.map((p) => p.period)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(payments.every((p) => p.amount === 100_000)).toBe(true);
    expect(payments[0].date).toBe("2026-02-02");
    d.payments.push(...payments.map((p, i) => ({ ...p, id: `p${i}`, accountId: null, ...base })));
    const f = new Finance(d, today);
    expect(f.statement(d.cards[0], "2026-10").status).toBe("paid");
    expect(f.statement(d.cards[0], "2026-11").noInterestPayment).toBe(100_000);
    expect(f.used(d.cards[0])).toBe(200_000);
    expect(overduePayments(d, today, "t1")).toEqual([]);
  });
});

describe("recurring charges and subscriptions", () => {
  const r: Recurring = {
    id: "r1", type: "expense", isSubscription: true, description: "Streaming", category: "Entretenimiento", frequency: "monthly", day: 15,
    yearlyMonth: null, accountId: null, cardId: "t1", startPeriod: "2026-01", endPeriod: null, canceledOn: null, ...base,
  };
  const prices: RecurringPrice[] = [
    { id: "p1", recurringId: "r1", startPeriod: "2026-01", amount: 19_900 },
    { id: "p2", recurringId: "r1", startPeriod: "2026-04", amount: 21_900 },
  ];
  it("uses the price in effect each month", () => {
    expect(chargeInPeriod(r, prices, "2026-03")).toBe(19_900);
    expect(chargeInPeriod(r, prices, "2026-04")).toBe(21_900);
  });
  it("once canceled it no longer charges after its last month", () => {
    const c = { ...r, endPeriod: "2026-05" };
    expect(chargeInPeriod(c, prices, "2026-05")).toBe(21_900);
    expect(chargeInPeriod(c, prices, "2026-06")).toBe(0);
    expect(nextCharge(c, prices, "2026-05-20")).toBeNull();
  });
  it("yearly only charges in its month", () => {
    const a = { ...r, frequency: "yearly" as const, yearlyMonth: 3 };
    expect(chargeInPeriod(a, prices, "2026-03")).toBe(19_900);
    expect(chargeInPeriod(a, prices, "2026-04")).toBe(0);
    expect(chargeInPeriod(a, prices, "2027-03")).toBe(21_900);
  });
  it("generates the missing occurrences up to today, only once", () => {
    const pending = pendingOccurrences({ recurring: [r], prices, transactions: [] }, "2026-03-14");
    expect(pending.map((p) => p.period)).toEqual(["2026-01", "2026-02"]);
    const done = expense({ recurringId: "r1", period: "2026-01" });
    expect(pendingOccurrences({ recurring: [r], prices, transactions: [done] }, "2026-03-15").map((p) => p.period)).toEqual(["2026-02", "2026-03"]);
  });
});

describe("month summary", () => {
  it("a card expense after the cutoff counts in the month its statement is due", () => {
    const d = empty();
    d.cards[0] = card({ cutoffDay: 12, dueDay: 2 });
    // Oct 20 is after the Oct 12 cutoff: Nov 12 statement, due Dec 2.
    d.transactions.push(expense({ date: "2026-10-20", amount: 50_000 }), expense({ date: "2026-10-10", amount: 30_000 }));
    const f = new Finance(d, "2026-10-20");
    expect(f.monthSummary("2026-10").expenses).toBe(0);
    expect(f.monthSummary("2026-11").expenses).toBe(30_000);
    expect(f.monthSummary("2026-12").expenses).toBe(50_000);
  });
  it("expenses paid from an account and income count on their date", () => {
    const d = empty();
    d.transactions.push(expense({ date: "2026-10-20", cardId: null, accountId: "a1" }), expense({ type: "income", date: "2026-10-20", cardId: null, accountId: "a1" }));
    const s = new Finance(d, "2026-10-20").monthSummary("2026-10");
    expect(s.expenses).toBe(100_000);
    expect(s.income).toBe(100_000);
  });
  it("projects a card subscription in the month its statement is due, only once", () => {
    const d = empty();
    d.cards[0] = card({ cutoffDay: 12, dueDay: 2 });
    d.recurring.push({
      id: "r1", type: "expense", isSubscription: true, description: "Streaming", category: "Entretenimiento", frequency: "monthly", day: 15,
      yearlyMonth: null, accountId: null, cardId: "t1", startPeriod: "2026-01", endPeriod: null, canceledOn: null, ...base,
    });
    d.prices.push({ id: "p1", recurringId: "r1", startPeriod: "2026-01", amount: 19_900 });
    const f = new Finance(d, "2026-10-14");
    // Charged Oct 15 → Nov 12 statement, due Dec 2.
    expect(f.monthSummary("2026-11").projectedExpenses).toBe(0);
    expect(f.projected("2026-12").map((x) => x.date)).toEqual(["2026-10-15"]);
    d.transactions.push(expense({ date: "2026-10-15", amount: 19_900, recurringId: "r1", period: "2026-10" }));
    const g = new Finance(d, "2026-10-16");
    expect(g.projected("2026-12")).toEqual([]);
    expect(g.monthSummary("2026-12").expenses).toBe(19_900);
  });
});

describe("alerts", () => {
  it("warns about a fixed bill paid from an account like a card payment", () => {
    const d = empty();
    d.recurring.push({
      id: "r1", type: "expense", isSubscription: false, description: "Renta", category: "Casa", frequency: "monthly", day: 22,
      yearlyMonth: null, accountId: "a1", cardId: null, startPeriod: "2026-01", endPeriod: null, canceledOn: null, ...base,
    });
    d.prices.push({ id: "p1", recurringId: "r1", startPeriod: "2026-01", amount: 800_000 });
    const f = new Finance(d, "2026-10-20");
    expect(f.alerts()).toContainEqual({ level: "warning", text: "Renta: paga el 22 (en 2 días)", href: "/subscriptions" });
    expect(new Finance(d, "2026-10-16").alerts()).toEqual([]);
    expect(f.monthSummary("2026-10").projectedExpenses).toBe(800_000);
  });
});

describe("simulator and best card", () => {
  it("a new purchase lowers available credit and adds to upcoming payments", () => {
    const d = empty();
    const sim = new Finance(d, "2026-04-02").simulate({ cardId: "t1", amount: 600_000, months: 6, date: "2026-04-02", annualRate: 0, withVat: false, settledPeriod: null })!;
    expect(sim.availableAfter).toBe(4_400_000);
    expect(sim.rows[0]).toMatchObject({ period: "2026-04", extra: 100_000 });
    expect(sim.rows[6].extra).toBe(0);
  });
  it("future months assume earlier statements were paid in full", () => {
    const d = empty();
    d.purchases.push(purchase({ date: "2026-03-10", months: 12 }));
    d.transactions.push(expense({ date: "2026-03-10", amount: 500_000 }));
    const sim = new Finance(d, "2026-04-02").simulate({ cardId: "t1", amount: 600_000, months: 6, date: "2026-04-02", annualRate: 0, withVat: false, settledPeriod: null })!;
    expect(sim.rows[0].before).toBe(600_000);
    expect(sim.rows[1].before).toBe(100_000);
  });
  it("recommends the card that gives the most days to pay", () => {
    const d = empty();
    d.cards.push(card({ id: "t2", name: "Clásica", cutoffDay: 20, dueDay: 10 }));
    const [best] = new Finance(d, "2026-04-06").bestCardToday();
    expect(best.card.name).toBe("Oro");
    expect(best.dueDate).toBe("2026-05-25");
  });
});

it("addMonths crosses years", () => {
  expect(addMonths("2026-11", 3)).toBe("2027-02");
  expect(addMonths("2026-01", -1)).toBe("2025-12");
});
