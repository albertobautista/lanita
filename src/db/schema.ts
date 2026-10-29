import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// All amounts are stored in cents (integers). Periods are "YYYY-MM" and dates "YYYY-MM-DD".

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => text("created_at").notNull().default(sql`(datetime('now'))`);
const isSample = () => integer("is_sample", { mode: "boolean" }).notNull().default(false);

export const accounts = sqliteTable("accounts", {
  id: id(),
  name: text("name").notNull(),
  type: text("type", { enum: ["debit", "cash", "savings"] }).notNull(),
  openingBalance: integer("opening_balance").notNull().default(0),
  color: text("color").notNull(),
  isSample: isSample(),
  createdAt: createdAt(),
});

export const cards = sqliteTable("cards", {
  id: id(),
  name: text("name").notNull(),
  bank: text("bank").notNull().default(""),
  last4: text("last4").notNull().default(""),
  creditLimit: integer("credit_limit").notNull(),
  cutoffDay: integer("cutoff_day").notNull(),
  dueDay: integer("due_day").notNull(),
  color: text("color").notNull(),
  // Minimum payment: percentage of the revolving balance and of the limit, in basis points (150 = 1.5 %).
  minPctBalance: integer("min_pct_balance").notNull().default(150),
  minPctLimit: integer("min_pct_limit").notNull().default(125),
  // Ordinary annual rate (basis points), used to estimate interest when not paid in full.
  annualRate: integer("annual_rate").notNull().default(0),
  isSample: isSample(),
  createdAt: createdAt(),
});

// Installment purchases: interest-free (annualRate = 0) or with interest.
export const purchases = sqliteTable(
  "purchases",
  {
    id: id(),
    cardId: text("card_id").notNull().references(() => cards.id),
    description: text("description").notNull(),
    category: text("category").notNull().default("Otros"),
    amount: integer("amount").notNull(),
    months: integer("months").notNull(),
    date: text("date").notNull(),
    annualRate: integer("annual_rate").notNull().default(0),
    withVat: integer("with_vat", { mode: "boolean" }).notNull().default(true),
    // If paid off early: the period whose statement includes the remaining balance.
    settledPeriod: text("settled_period"),
    isSample: isSample(),
    createdAt: createdAt(),
  },
  (t) => [index("purchases_card").on(t.cardId)],
);

// Recurring charges: subscriptions, bills and repeating income.
export const recurring = sqliteTable("recurring", {
  id: id(),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  isSubscription: integer("is_subscription", { mode: "boolean" }).notNull().default(false),
  description: text("description").notNull(),
  category: text("category").notNull(),
  frequency: text("frequency", { enum: ["monthly", "yearly"] }).notNull().default("monthly"),
  day: integer("day").notNull(),
  // For yearly frequency: month of the charge (1-12).
  yearlyMonth: integer("yearly_month"),
  accountId: text("account_id").references(() => accounts.id),
  cardId: text("card_id").references(() => cards.id),
  startPeriod: text("start_period").notNull(),
  // Last period charged; null = still active. Set when canceling.
  endPeriod: text("end_period"),
  canceledOn: text("canceled_on"),
  isSample: isSample(),
  createdAt: createdAt(),
});

// Price history of each recurring charge: the current price is the latest with startPeriod <= period.
export const recurringPrices = sqliteTable(
  "recurring_prices",
  {
    id: id(),
    recurringId: text("recurring_id").notNull().references(() => recurring.id, { onDelete: "cascade" }),
    startPeriod: text("start_period").notNull(),
    amount: integer("amount").notNull(),
  },
  (t) => [uniqueIndex("price_per_period").on(t.recurringId, t.startPeriod)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    type: text("type", { enum: ["income", "expense"] }).notNull(),
    date: text("date").notNull(),
    amount: integer("amount").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    accountId: text("account_id").references(() => accounts.id),
    cardId: text("card_id").references(() => cards.id),
    recurringId: text("recurring_id").references(() => recurring.id, { onDelete: "set null" }),
    period: text("period"),
    source: text("source", { enum: ["manual", "imported", "chat", "recurring"] }).notNull().default("manual"),
    isSample: isSample(),
    createdAt: createdAt(),
  },
  (t) => [index("transactions_date").on(t.date), uniqueIndex("transactions_recurring_period").on(t.recurringId, t.period)],
);

export const cardPayments = sqliteTable(
  "card_payments",
  {
    id: id(),
    cardId: text("card_id").notNull().references(() => cards.id),
    period: text("period").notNull(),
    amount: integer("amount").notNull(),
    date: text("date").notNull(),
    accountId: text("account_id").references(() => accounts.id),
    isSample: isSample(),
    createdAt: createdAt(),
  },
  (t) => [index("card_payments_card_period").on(t.cardId, t.period)],
);

// Real figures from the bank statement. When present, they override what the app calculates.
export const bankStatements = sqliteTable(
  "bank_statements",
  {
    id: id(),
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    noInterestPayment: integer("no_interest_payment").notNull(),
    minimumPayment: integer("minimum_payment"),
    notes: text("notes").notNull().default(""),
    isSample: isSample(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("bank_statements_card_period").on(t.cardId, t.period)],
);

// Banks move the due date a day or two some months (weekends, holidays). When present, it overrides the card's usual
// due day for that statement. The cutoff day never moves.
export const dueDates = sqliteTable(
  "due_dates",
  {
    id: id(),
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    dueDate: text("due_date").notNull(),
  },
  (t) => [uniqueIndex("due_dates_card_period").on(t.cardId, t.period)],
);

export const transfers = sqliteTable("transfers", {
  id: id(),
  fromAccountId: text("from_account_id").notNull().references(() => accounts.id),
  toAccountId: text("to_account_id").notNull().references(() => accounts.id),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull().default(""),
  isSample: isSample(),
  createdAt: createdAt(),
});

export const budgets = sqliteTable("budgets", {
  id: id(),
  category: text("category").notNull().unique(),
  amount: integer("amount").notNull(),
  isSample: isSample(),
});

export const goals = sqliteTable("goals", {
  id: id(),
  name: text("name").notNull(),
  target: integer("target").notNull(),
  targetDate: text("target_date"),
  color: text("color").notNull(),
  isSample: isSample(),
  createdAt: createdAt(),
});

// Contributions (positive) and withdrawals (negative) to a goal. With an account, money leaves or enters it.
export const contributions = sqliteTable("contributions", {
  id: id(),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  amount: integer("amount").notNull(),
  accountId: text("account_id").references(() => accounts.id),
  isSample: isSample(),
});

export type Account = typeof accounts.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Recurring = typeof recurring.$inferSelect;
export type RecurringPrice = typeof recurringPrices.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type CardPayment = typeof cardPayments.$inferSelect;
export type BankStatement = typeof bankStatements.$inferSelect;
export type DueDate = typeof dueDates.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
