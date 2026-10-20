import "server-only";
import { db, schema } from "@/db";
import { Finance, pendingOccurrences, type Data } from "./finance";
import { todayISO } from "./periods";

async function readAll(): Promise<Data> {
  const [accounts, cards, purchases, recurring, prices, transactions, payments, bankStatements, transfers, budgets, goals, contributions] =
    await Promise.all([
      db.select().from(schema.accounts).orderBy(schema.accounts.createdAt),
      db.select().from(schema.cards).orderBy(schema.cards.createdAt),
      db.select().from(schema.purchases),
      db.select().from(schema.recurring).orderBy(schema.recurring.description),
      db.select().from(schema.recurringPrices),
      db.select().from(schema.transactions),
      db.select().from(schema.cardPayments),
      db.select().from(schema.bankStatements),
      db.select().from(schema.transfers),
      db.select().from(schema.budgets).orderBy(schema.budgets.category),
      db.select().from(schema.goals).orderBy(schema.goals.createdAt),
      db.select().from(schema.contributions),
    ]);
  return { accounts, cards, purchases, recurring, prices, transactions, payments, bankStatements, transfers, budgets, goals, contributions };
}

/** Records the recurring charges that were already due (salary, subscriptions...) as real transactions. */
async function syncRecurring(d: Data, today: string) {
  const pending = pendingOccurrences(d, today);
  if (!pending.length) return false;
  await db
    .insert(schema.transactions)
    .values(
      pending.map((p) => ({
        type: p.recurring.type,
        date: p.date,
        amount: p.amount,
        category: p.recurring.category,
        description: p.recurring.description,
        accountId: p.recurring.accountId,
        cardId: p.recurring.cardId,
        recurringId: p.recurring.id,
        period: p.period,
        source: "recurring" as const,
        isSample: p.recurring.isSample,
      })),
    )
    .onConflictDoNothing();
  return true;
}

export async function loadFinance(today = todayISO()) {
  let d = await readAll();
  if (await syncRecurring(d, today)) d = await readAll();
  return new Finance(d, today);
}
