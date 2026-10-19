"use server";

import { and, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { COLORS, UNIDENTIFIED_CATEGORY } from "@/lib/catalogs";
import { loadFinance } from "@/lib/data";
import { cutoffDate } from "@/lib/finance";
import { toCents } from "@/lib/format";
import { addMonths, isPeriod, periodOf, todayISO } from "@/lib/periods";

export type Result = { ok: boolean; message?: string; error?: string };

// ---------- validation (messages are shown in the app, so they are in Spanish) ----------

const text = z.string().trim();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const period = z.string().refine(isPeriod, "Mes inválido");
const money = (msg = "Escribe un monto válido") => z.preprocess((v) => toCents(v as string), z.number({ error: msg }).int().refine((n) => !Number.isNaN(n), msg));
const positive = (msg?: string) => money(msg).refine((n) => n > 0, "El monto debe ser mayor a cero");
const optional = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().nullable());
const day = z.coerce.number().int().min(1, "Día entre 1 y 31").max(31, "Día entre 1 y 31");
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

function parse<T extends z.ZodType>(s: T, fd: FormData): { data: z.infer<T> } | { error: string } {
  const r = s.safeParse(Object.fromEntries(fd));
  if (r.success) return { data: r.data };
  return { error: r.error.issues[0]?.message ?? "Revisa los datos" };
}

/** Form field "via": "account:<id>" | "card:<id>" → columns. */
function parseVia(value: string | null | undefined) {
  const [kind, id] = String(value ?? "").split(":");
  return { accountId: kind === "account" ? id : null, cardId: kind === "card" ? id : null };
}

function done(message: string): Result {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

async function attempt(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

// ---------- cards ----------

const cardSchema = z.object({
  id: optional,
  name: text.min(1, "Ponle nombre a la tarjeta"),
  bank: text.default(""),
  last4: text.regex(/^(\d{4})?$/, "Los últimos 4 dígitos deben ser 4 números").default(""),
  creditLimit: positive("Escribe el límite de crédito"),
  cutoffDay: day,
  dueDay: day,
  color: text.default(COLORS[0]),
  minPctBalance: z.coerce.number().min(0).max(100).default(1.5),
  minPctLimit: z.coerce.number().min(0).max(100).default(1.25),
  annualRate: z.coerce.number().min(0).max(300).default(0),
});

export async function saveCard(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(cardSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, minPctBalance, minPctLimit, annualRate, ...v } = r.data;
  const values = { ...v, minPctBalance: Math.round(minPctBalance * 100), minPctLimit: Math.round(minPctLimit * 100), annualRate: Math.round(annualRate * 100) };
  return attempt(async () => {
    if (id) await db.update(schema.cards).set(values).where(eq(schema.cards.id, id));
    else await db.insert(schema.cards).values(values);
    return done(id ? "Tarjeta actualizada" : "Tarjeta agregada");
  });
}

export async function deleteCard(id: string): Promise<Result> {
  const [use] = await db
    .select({ n: sql<number>`(select count(*) from purchases where card_id = ${id}) + (select count(*) from transactions where card_id = ${id}) + (select count(*) from card_payments where card_id = ${id}) + (select count(*) from recurring where card_id = ${id})` })
    .from(sql`(select 1)`);
  if (use.n > 0) return { ok: false, error: "Esta tarjeta tiene compras, pagos o cargos registrados. Bórralos primero." };
  await db.delete(schema.cards).where(eq(schema.cards.id, id));
  return done("Tarjeta borrada");
}

// ---------- accounts ----------

const accountSchema = z.object({
  id: optional,
  name: text.min(1, "Ponle nombre a la cuenta"),
  type: z.enum(["debit", "cash", "savings"]),
  openingBalance: money(),
  color: text.default(COLORS[2]),
});

export async function saveAccount(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(accountSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, ...v } = r.data;
  return attempt(async () => {
    if (id) await db.update(schema.accounts).set(v).where(eq(schema.accounts.id, id));
    else await db.insert(schema.accounts).values(v);
    return done(id ? "Cuenta actualizada" : "Cuenta agregada");
  });
}

export async function deleteAccount(id: string): Promise<Result> {
  const [use] = await db
    .select({ n: sql<number>`(select count(*) from transactions where account_id = ${id}) + (select count(*) from card_payments where account_id = ${id}) + (select count(*) from transfers where from_account_id = ${id} or to_account_id = ${id}) + (select count(*) from contributions where account_id = ${id})` })
    .from(sql`(select 1)`);
  if (use.n > 0) return { ok: false, error: "Esta cuenta tiene movimientos. Bórralos primero o déjala sin usar." };
  await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
  return done("Cuenta borrada");
}

const transferSchema = z.object({
  fromAccountId: text.min(1, "Elige la cuenta de origen"),
  toAccountId: text.min(1, "Elige la cuenta de destino"),
  amount: positive(),
  date,
  description: text.default(""),
});

export async function saveTransfer(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(transferSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.data.fromAccountId === r.data.toAccountId) return { ok: false, error: "El origen y el destino deben ser distintos" };
  return attempt(async () => {
    await db.insert(schema.transfers).values(r.data);
    return done("Transferencia registrada");
  });
}

export async function deleteTransfer(id: string): Promise<Result> {
  await db.delete(schema.transfers).where(eq(schema.transfers.id, id));
  return done("Transferencia borrada");
}

// ---------- installment purchases ----------

const purchaseSchema = z.object({
  id: optional,
  cardId: text.min(1, "Elige la tarjeta"),
  description: text.min(1, "¿Qué compraste?"),
  category: text.default("Otros"),
  amount: positive(),
  months: z.coerce.number().int().min(2, "Al menos 2 meses").max(60),
  date,
  annualRate: z.coerce.number().min(0).max(300).default(0),
  withVat: checkbox,
});

export async function savePurchase(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(purchaseSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, annualRate, ...v } = r.data;
  const values = { ...v, annualRate: Math.round(annualRate * 100) };
  return attempt(async () => {
    if (id) await db.update(schema.purchases).set(values).where(eq(schema.purchases.id, id));
    else await db.insert(schema.purchases).values(values);
    return done(id ? "Compra actualizada" : "Compra a meses agregada");
  });
}

export async function deletePurchase(id: string): Promise<Result> {
  await db.delete(schema.purchases).where(eq(schema.purchases.id, id));
  return done("Compra borrada");
}

export async function settlePurchase(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(z.object({ id: text.min(1), period }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  await db.update(schema.purchases).set({ settledPeriod: r.data.period }).where(eq(schema.purchases.id, r.data.id));
  return done("Compra liquidada: el saldo restante se suma a ese estado de cuenta");
}

export async function undoSettlement(id: string): Promise<Result> {
  await db.update(schema.purchases).set({ settledPeriod: null }).where(eq(schema.purchases.id, id));
  return done("Liquidación deshecha");
}

// ---------- transactions ----------

const transactionSchema = z.object({
  id: optional,
  type: z.enum(["income", "expense"]),
  description: text.default(""),
  amount: positive(),
  date,
  category: text.min(1),
  via: text.min(1, "Elige cómo pagaste o a qué cuenta entró"),
});

export async function saveTransaction(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(transactionSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, via, ...v } = r.data;
  const target = parseVia(via);
  if (v.type === "income" && target.cardId) return { ok: false, error: "Un ingreso debe entrar a una cuenta" };
  return attempt(async () => {
    if (id) await db.update(schema.transactions).set({ ...v, ...target }).where(eq(schema.transactions.id, id));
    else await db.insert(schema.transactions).values({ ...v, ...target });
    return done(v.type === "income" ? "Ingreso guardado" : "Gasto guardado");
  });
}

export async function deleteTransaction(id: string): Promise<Result> {
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  return done("Movimiento borrado");
}

const rowsSchema = z.array(
  z.object({
    type: z.enum(["income", "expense"]),
    date,
    amount: z.number().int().positive(),
    category: z.string().min(1),
    description: z.string().default(""),
    via: z.string().min(1),
  }),
);

/** Saves transactions coming from an imported statement or from the quick capture. */
export async function saveMany(rows: unknown, origin: "imported" | "chat"): Promise<Result> {
  const r = rowsSchema.safeParse(rows);
  if (!r.success) return { ok: false, error: "Hay filas con datos incompletos" };
  if (!r.data.length) return { ok: false, error: "No hay movimientos seleccionados" };
  return attempt(async () => {
    await db.insert(schema.transactions).values(r.data.map(({ via, ...row }) => ({ ...row, ...parseVia(via), source: origin })));
    return done(`${r.data.length} movimiento${r.data.length === 1 ? "" : "s"} guardado${r.data.length === 1 ? "" : "s"}`);
  });
}

// ---------- payments and bank statements ----------

const paymentSchema = z.object({
  cardId: text.min(1),
  period,
  amount: positive(),
  date,
  accountId: optional,
});

export async function recordPayment(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(paymentSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  return attempt(async () => {
    await db.insert(schema.cardPayments).values(r.data);
    return done("Pago registrado");
  });
}

export async function deletePayment(id: string): Promise<Result> {
  await db.delete(schema.cardPayments).where(eq(schema.cardPayments.id, id));
  return done("Pago borrado");
}

const bankStatementSchema = z.object({
  cardId: text.min(1),
  period,
  noInterestPayment: money("Escribe el pago para no generar intereses").refine((n) => n >= 0, "No puede ser negativo"),
  minimumPayment: z.preprocess((v) => (v === "" || v == null ? null : toCents(v as string)), z.number().int().nonnegative("No puede ser negativo").nullable()),
  notes: text.default(""),
});

export async function saveBankStatement(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(bankStatementSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.data.minimumPayment != null && Number.isNaN(r.data.minimumPayment)) return { ok: false, error: "Escribe un pago mínimo válido" };
  return attempt(async () => {
    await db
      .insert(schema.bankStatements)
      .values(r.data)
      .onConflictDoUpdate({
        target: [schema.bankStatements.cardId, schema.bankStatements.period],
        set: { noInterestPayment: r.data.noInterestPayment, minimumPayment: r.data.minimumPayment, notes: r.data.notes },
      });
    return done("Estado de cuenta guardado: ahora se usan las cifras del banco");
  });
}

export async function deleteBankStatement(cardId: string, p: string): Promise<Result> {
  await db.delete(schema.bankStatements).where(and(eq(schema.bankStatements.cardId, cardId), eq(schema.bankStatements.period, p)));
  return done("Se volvió a usar el cálculo de la app");
}

/** Records the difference against the bank as an "unidentified" expense within that statement. */
export async function recordDifference(cardId: string, p: string): Promise<Result> {
  const f = await loadFinance();
  const c = f.card(cardId);
  if (!c) return { ok: false, error: "No encontré la tarjeta" };
  const st = f.statement(c, p);
  if (st.difference <= 0) return { ok: false, error: "No hay gastos faltantes que registrar en este corte" };
  await db.insert(schema.transactions).values({
    type: "expense",
    date: cutoffDate(c, p),
    amount: st.difference,
    category: UNIDENTIFIED_CATEGORY,
    description: "Diferencia con el estado de cuenta",
    cardId,
  });
  return done("Diferencia registrada como gasto sin identificar. Puedes editarlo cuando recuerdes qué fue.");
}

// ---------- recurring charges and subscriptions ----------

const recurringSchema = z.object({
  id: optional,
  type: z.enum(["income", "expense"]),
  isSubscription: checkbox,
  description: text.min(1, "Ponle nombre"),
  category: text.min(1),
  frequency: z.enum(["monthly", "yearly"]).default("monthly"),
  day,
  yearlyMonth: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(12).nullable()),
  via: text.min(1, "Elige con qué se paga o a qué cuenta entra"),
  startPeriod: period,
  amount: positive(),
});

export async function saveRecurring(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(recurringSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, amount, via, ...v } = r.data;
  const target = parseVia(via);
  if (v.type === "income" && target.cardId) return { ok: false, error: "Un ingreso debe entrar a una cuenta" };
  const values = { ...v, ...target, yearlyMonth: v.frequency === "yearly" ? (v.yearlyMonth ?? Number(v.startPeriod.slice(5))) : null };
  return attempt(async () => {
    if (id) {
      // Editing does not change the price: "Cambiar precio" does that and keeps the history.
      await db.update(schema.recurring).set(values).where(eq(schema.recurring.id, id));
      await db.update(schema.transactions).set({ category: v.category, description: v.description, ...target }).where(eq(schema.transactions.recurringId, id));
      return done("Cambios guardados");
    }
    const [created] = await db.insert(schema.recurring).values(values).returning({ id: schema.recurring.id });
    await db.insert(schema.recurringPrices).values({ recurringId: created.id, startPeriod: v.startPeriod, amount });
    return done(v.isSubscription ? "Suscripción agregada" : "Cargo fijo agregado");
  });
}

export async function changePrice(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(z.object({ id: text.min(1), startPeriod: period, amount: positive() }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, startPeriod, amount } = r.data;
  return attempt(async () => {
    await db
      .insert(schema.recurringPrices)
      .values({ recurringId: id, startPeriod, amount })
      .onConflictDoUpdate({ target: [schema.recurringPrices.recurringId, schema.recurringPrices.startPeriod], set: { amount } });
    // Charges already recorded from that month on take the new price (until the next change).
    const later = await db.select().from(schema.recurringPrices).where(and(eq(schema.recurringPrices.recurringId, id), gt(schema.recurringPrices.startPeriod, startPeriod)));
    const until = later.map((p) => p.startPeriod).sort()[0];
    const txs = await db.select().from(schema.transactions).where(and(eq(schema.transactions.recurringId, id), gte(schema.transactions.period, startPeriod)));
    const ids = txs.filter((t) => !until || (t.period ?? "") < until).map((t) => t.id);
    if (ids.length) await db.update(schema.transactions).set({ amount }).where(inArray(schema.transactions.id, ids));
    return done("Precio actualizado");
  });
}

export async function cancelRecurring(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(z.object({ id: text.min(1), endPeriod: period }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, endPeriod } = r.data;
  return attempt(async () => {
    await db.update(schema.recurring).set({ endPeriod, canceledOn: todayISO() }).where(eq(schema.recurring.id, id));
    await db.delete(schema.transactions).where(and(eq(schema.transactions.recurringId, id), gt(schema.transactions.period, endPeriod)));
    return done("Cancelada. Ya no se contará después de ese mes.");
  });
}

export async function reactivateRecurring(id: string): Promise<Result> {
  const [r] = await db.select().from(schema.recurring).where(eq(schema.recurring.id, id));
  if (!r) return { ok: false, error: "No encontré el cargo" };
  // If time has passed since canceling, it resumes this month to avoid back charges.
  const current = periodOf(todayISO());
  const resume = r.endPeriod && addMonths(r.endPeriod, 1) < current;
  await db.update(schema.recurring).set({ endPeriod: null, canceledOn: null, startPeriod: resume ? current : r.startPeriod }).where(eq(schema.recurring.id, id));
  if (resume) {
    const prices = await db.select().from(schema.recurringPrices).where(eq(schema.recurringPrices.recurringId, id));
    const last = prices.sort((a, b) => b.startPeriod.localeCompare(a.startPeriod))[0];
    if (last && last.startPeriod < current) await db.insert(schema.recurringPrices).values({ recurringId: id, startPeriod: current, amount: last.amount }).onConflictDoNothing();
  }
  return done("Reactivada");
}

export async function deleteRecurring(id: string, withHistory: boolean): Promise<Result> {
  if (withHistory) await db.delete(schema.transactions).where(eq(schema.transactions.recurringId, id));
  else await db.update(schema.transactions).set({ recurringId: null }).where(eq(schema.transactions.recurringId, id));
  await db.delete(schema.recurringPrices).where(eq(schema.recurringPrices.recurringId, id));
  await db.delete(schema.recurring).where(eq(schema.recurring.id, id));
  return done("Borrado");
}

// ---------- budgets and goals ----------

export async function saveBudget(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(z.object({ category: text.min(1), amount: positive() }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  return attempt(async () => {
    await db.insert(schema.budgets).values(r.data).onConflictDoUpdate({ target: schema.budgets.category, set: { amount: r.data.amount } });
    return done("Presupuesto guardado");
  });
}

export async function deleteBudget(id: string): Promise<Result> {
  await db.delete(schema.budgets).where(eq(schema.budgets.id, id));
  return done("Presupuesto borrado");
}

const goalSchema = z.object({
  id: optional,
  name: text.min(1, "Ponle nombre a la meta"),
  target: positive("¿Cuánto quieres juntar?"),
  targetDate: optional,
  color: text.default(COLORS[6]),
});

export async function saveGoal(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(goalSchema, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, ...v } = r.data;
  return attempt(async () => {
    if (id) await db.update(schema.goals).set(v).where(eq(schema.goals.id, id));
    else await db.insert(schema.goals).values(v);
    return done(id ? "Meta actualizada" : "Meta creada");
  });
}

export async function deleteGoal(id: string): Promise<Result> {
  await db.delete(schema.contributions).where(eq(schema.contributions.goalId, id));
  await db.delete(schema.goals).where(eq(schema.goals.id, id));
  return done("Meta borrada");
}

export async function contributeToGoal(_: Result | null, fd: FormData): Promise<Result> {
  const r = parse(z.object({ goalId: text.min(1), amount: positive(), date, accountId: optional, direction: z.enum(["deposit", "withdraw"]) }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { direction, amount, ...v } = r.data;
  return attempt(async () => {
    await db.insert(schema.contributions).values({ ...v, amount: direction === "withdraw" ? -amount : amount });
    return done(direction === "withdraw" ? "Retiro registrado" : "Aportación registrada");
  });
}

export async function deleteContribution(id: string): Promise<Result> {
  await db.delete(schema.contributions).where(eq(schema.contributions.id, id));
  return done("Movimiento de la meta borrado");
}
