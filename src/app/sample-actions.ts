"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { COLORS } from "@/lib/catalogs";
import { addMonths, dateInPeriod, periodOf, todayISO } from "@/lib/periods";
import type { Result } from "./actions";

const $ = (pesos: number) => Math.round(pesos * 100);

export async function loadSampleData(): Promise<Result> {
  const today = todayISO();
  const current = periodOf(today);
  const on = (months: number, day: number) => dateInPeriod(addMonths(current, months), day);
  const sample = { isSample: true };

  const [payroll, cash] = await db
    .insert(schema.accounts)
    .values([
      { name: "Nómina", type: "debit", openingBalance: $(8_500), color: COLORS[2], ...sample },
      { name: "Cartera", type: "cash", openingBalance: $(1_200), color: COLORS[4], ...sample },
      { name: "Ahorro", type: "savings", openingBalance: $(15_000), color: COLORS[6], ...sample },
    ])
    .returning();
  const [gold, classic] = await db
    .insert(schema.cards)
    .values([
      { name: "Oro", bank: "Banco Azul", last4: "4821", creditLimit: $(45_000), cutoffDay: 5, dueDay: 25, color: COLORS[0], annualRate: 4500, ...sample },
      { name: "Clásica", bank: "Banco Rojo", last4: "1307", creditLimit: $(28_000), cutoffDay: 20, dueDay: 10, color: COLORS[1], annualRate: 6200, ...sample },
    ])
    .returning();

  await db.insert(schema.purchases).values([
    { cardId: gold.id, description: "Refrigerador", category: "Casa", amount: $(14_400), months: 12, date: on(-4, 12), ...sample },
    { cardId: classic.id, description: "Laptop", category: "Electrónica", amount: $(21_600), months: 18, date: on(-2, 22), ...sample },
    { cardId: gold.id, description: "Vuelos a Cancún", category: "Viajes", amount: $(7_800), months: 6, date: on(-1, 3), ...sample },
    { cardId: classic.id, description: "Celular", category: "Electrónica", amount: $(9_000), months: 9, date: on(-9, 15), ...sample },
    { cardId: gold.id, description: "Colchón (con intereses)", category: "Casa", amount: $(8_000), months: 12, date: on(-3, 2), annualRate: 3200, withVat: true, ...sample },
  ]);

  const start = addMonths(current, -5);
  const recurring = [
    { type: "income" as const, description: "Quincena", category: "Sueldo", day: 15, accountId: payroll.id, amount: $(14_500) },
    { type: "income" as const, description: "Quincena", category: "Sueldo", day: 30, accountId: payroll.id, amount: $(14_500) },
    { type: "expense" as const, description: "Renta", category: "Casa", day: 1, accountId: payroll.id, amount: $(9_500) },
    { type: "expense" as const, description: "Internet", category: "Servicios", day: 8, accountId: payroll.id, amount: $(599) },
    { type: "expense" as const, description: "Netflix", category: "Suscripciones", day: 12, cardId: gold.id, amount: $(249), isSubscription: true, raisesTo: $(299) },
    { type: "expense" as const, description: "Spotify", category: "Suscripciones", day: 3, cardId: classic.id, amount: $(129), isSubscription: true },
    { type: "expense" as const, description: "Gimnasio", category: "Salud", day: 1, cardId: gold.id, amount: $(650), isSubscription: true, cancel: true },
    { type: "expense" as const, description: "Amazon Prime", category: "Suscripciones", day: 20, cardId: classic.id, amount: $(899), isSubscription: true, yearly: true },
  ];
  for (const r of recurring) {
    const [created] = await db
      .insert(schema.recurring)
      .values({
        type: r.type, description: r.description, category: r.category, day: r.day, startPeriod: start,
        accountId: "accountId" in r ? r.accountId : null, cardId: "cardId" in r ? r.cardId : null,
        isSubscription: "isSubscription" in r, frequency: "yearly" in r ? "yearly" : "monthly", yearlyMonth: "yearly" in r ? Number(addMonths(current, -2).slice(5)) : null,
        endPeriod: "cancel" in r ? addMonths(current, -1) : null, canceledOn: "cancel" in r ? on(-1, 20) : null, ...sample,
      })
      .returning();
    await db.insert(schema.recurringPrices).values({ recurringId: created.id, startPeriod: start, amount: r.amount });
    if ("raisesTo" in r && r.raisesTo) await db.insert(schema.recurringPrices).values({ recurringId: created.id, startPeriod: addMonths(current, -1), amount: r.raisesTo });
  }

  const txs: (typeof schema.transactions.$inferInsert)[] = [];
  for (let k = -5; k <= 0; k++) {
    const v = ((k * 37) % 5 + 5) % 5;
    txs.push(
      { type: "expense", description: "Súper", amount: $(3_200 + v * 180), date: on(k, 9), category: "Súper", cardId: gold.id, ...sample },
      { type: "expense", description: "Gasolina", amount: $(1_800), date: on(k, 18), category: "Transporte", cardId: classic.id, ...sample },
      { type: "expense", description: "Comidas fuera", amount: $(2_100 + v * 250), date: on(k, 21), category: "Comida", accountId: cash.id, ...sample },
      { type: "expense", description: "Luz", amount: $(420), date: on(k, 6), category: "Servicios", accountId: payroll.id, ...sample },
    );
  }
  await db.insert(schema.transactions).values(txs.filter((t) => t.date <= today));

  // Payments from previous months: in full on the Oro, and on the Clásica only the minimum one month.
  const payments: (typeof schema.cardPayments.$inferInsert)[] = [];
  for (let k = -5; k <= -1; k++) {
    payments.push({ cardId: gold.id, period: addMonths(current, k), amount: 0, date: on(k, 22), accountId: payroll.id, ...sample });
    payments.push({ cardId: classic.id, period: addMonths(current, k), amount: 0, date: on(k, 8), accountId: payroll.id, ...sample });
  }
  // Amounts are calculated afterwards with the app so they match each statement.
  const { loadFinance } = await import("@/lib/data");
  let fin = await loadFinance(today);
  for (const p of payments) {
    const c = p.cardId === gold.id ? gold : classic;
    const st = fin.statement(c, p.period);
    const amount = c.id === classic.id && p.period === addMonths(current, -2) ? st.minimumPayment : st.noInterestPayment;
    if (amount > 0) {
      await db.insert(schema.cardPayments).values({ ...p, amount });
      fin = await loadFinance(today);
    }
  }
  // The bank charged $386 more than recorded on the Oro's latest statement.
  const latest = fin.statement(gold, current);
  await db.insert(schema.bankStatements).values({ cardId: gold.id, period: current, noInterestPayment: latest.calculated + $(386), minimumPayment: null, notes: "Ejemplo", ...sample });

  await db.insert(schema.budgets).values([
    { category: "Súper", amount: $(3_800), ...sample },
    { category: "Comida", amount: $(2_500), ...sample },
    { category: "Transporte", amount: $(2_000), ...sample },
    { category: "Suscripciones", amount: $(1_000), ...sample },
  ]);

  const [emergency, trip] = await db
    .insert(schema.goals)
    .values([
      { name: "Fondo de emergencia", target: $(60_000), targetDate: on(10, 28), color: COLORS[6], ...sample },
      { name: "Viaje a Japón", target: $(45_000), targetDate: on(14, 1), color: COLORS[3], ...sample },
    ])
    .returning();
  await db.insert(schema.contributions).values([
    { goalId: emergency.id, amount: $(15_000), date: on(-5, 1), ...sample },
    { goalId: emergency.id, amount: $(3_000), date: on(-1, 16), accountId: payroll.id, ...sample },
    { goalId: trip.id, amount: $(6_500), date: on(-2, 16), accountId: payroll.id, ...sample },
  ]);
  await db.insert(schema.transfers).values({ fromAccountId: payroll.id, toAccountId: cash.id, amount: $(3_000), date: on(0, 1), description: "Retiro en cajero", ...sample });

  revalidatePath("/", "layout");
  return { ok: true, message: "Datos de ejemplo cargados" };
}

export async function deleteSampleData(): Promise<Result> {
  // Reverse dependency order.
  await db.delete(schema.contributions).where(eq(schema.contributions.isSample, true));
  await db.delete(schema.goals).where(eq(schema.goals.isSample, true));
  await db.delete(schema.budgets).where(eq(schema.budgets.isSample, true));
  await db.delete(schema.bankStatements).where(eq(schema.bankStatements.isSample, true));
  await db.delete(schema.cardPayments).where(eq(schema.cardPayments.isSample, true));
  await db.delete(schema.transactions).where(eq(schema.transactions.isSample, true));
  await db.delete(schema.transfers).where(eq(schema.transfers.isSample, true));
  await db.delete(schema.purchases).where(eq(schema.purchases.isSample, true));
  const recs = await db.select({ id: schema.recurring.id }).from(schema.recurring).where(eq(schema.recurring.isSample, true));
  if (recs.length) await db.delete(schema.recurringPrices).where(inArray(schema.recurringPrices.recurringId, recs.map((r) => r.id)));
  await db.delete(schema.recurring).where(eq(schema.recurring.isSample, true));
  const sampleCards = await db.select({ id: schema.cards.id }).from(schema.cards).where(eq(schema.cards.isSample, true));
  if (sampleCards.length) await db.delete(schema.dueDates).where(inArray(schema.dueDates.cardId, sampleCards.map((c) => c.id)));
  await db.delete(schema.cards).where(eq(schema.cards.isSample, true));
  await db.delete(schema.accounts).where(eq(schema.accounts.isSample, true));
  revalidatePath("/", "layout");
  return { ok: true, message: "Ejemplos borrados" };
}
