// Shared form fields. Each set goes inside an <ActionForm> with its matching Server Action.
import type { Account, Card, Goal, Purchase, Recurring, Transaction } from "@/db/schema";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, INSTALLMENT_TERMS } from "@/lib/catalogs";
import { toPesos } from "@/lib/format";
import { AccountField, ColorField, Field, MoneyField, SelectField, ViaField, viaValue } from "./ui";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function CardFields({ card }: { card?: Card }) {
  return (
    <>
      {card && <input type="hidden" name="id" value={card.id} />}
      <Field label="Nombre">
        <input name="name" defaultValue={card?.name} placeholder="Oro, Clásica…" required />
      </Field>
      <div className="fields2">
        <Field label="Banco">
          <input name="bank" defaultValue={card?.bank} />
        </Field>
        <Field label="Últimos 4 dígitos">
          <input name="last4" defaultValue={card?.last4} inputMode="numeric" maxLength={4} pattern="\d{4}" />
        </Field>
      </div>
      <MoneyField label="Límite de crédito" name="creditLimit" value={toPesos(card?.creditLimit)} />
      <div className="fields2">
        <Field label="Día de corte">
          <input name="cutoffDay" type="number" min={1} max={31} defaultValue={card?.cutoffDay} required />
        </Field>
        <Field label="Día límite de pago">
          <input name="dueDay" type="number" min={1} max={31} defaultValue={card?.dueDay} required />
        </Field>
      </div>
      <details>
        <summary>Pago mínimo e intereses</summary>
        <div className="fields2" style={{ marginTop: 10 }}>
          <Field label="% del saldo">
            <input name="minPctBalance" type="number" step="0.01" min={0} defaultValue={card ? card.minPctBalance / 100 : 1.5} />
          </Field>
          <Field label="% del límite">
            <input name="minPctLimit" type="number" step="0.01" min={0} defaultValue={card ? card.minPctLimit / 100 : 1.25} />
          </Field>
        </div>
        <Field label="Tasa anual (%)">
          <input name="annualRate" type="number" step="0.01" min={0} defaultValue={card ? card.annualRate / 100 : 0} />
        </Field>
      </details>
      <ColorField idPrefix={`card-${card?.id ?? "new"}`} value={card?.color} />
    </>
  );
}

export function AccountFields({ account }: { account?: Account }) {
  return (
    <>
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field label="Nombre">
        <input name="name" defaultValue={account?.name} placeholder="Nómina, Cartera…" required />
      </Field>
      <div className="fields2">
        <SelectField label="Tipo" name="type" value={account?.type} options={[["debit", "Débito"], ["cash", "Efectivo"], ["savings", "Ahorro"]]} />
        <MoneyField label="Saldo inicial" name="openingBalance" value={toPesos(account?.openingBalance ?? 0)} />
      </div>
      <ColorField idPrefix={`account-${account?.id ?? "new"}`} value={account?.color} />
    </>
  );
}

export function PurchaseFields({ cards, purchase, today }: { cards: Card[]; purchase?: Purchase; today: string }) {
  return (
    <>
      {purchase && <input type="hidden" name="id" value={purchase.id} />}
      <Field label="¿Qué compraste?">
        <input name="description" defaultValue={purchase?.description} required />
      </Field>
      <div className="fields2">
        <SelectField label="Tarjeta" name="cardId" value={purchase?.cardId} options={cards.map((c) => [c.id, c.name] as const)} />
        <SelectField label="Categoría" name="category" value={purchase?.category ?? "Otros"} options={EXPENSE_CATEGORIES} />
      </div>
      <div className="fields2">
        <MoneyField label="Monto total" name="amount" value={toPesos(purchase?.amount)} />
        <SelectField label="Meses" name="months" value={String(purchase?.months ?? 12)} options={INSTALLMENT_TERMS.map((n) => [String(n), `${n} meses`] as const)} />
      </div>
      <div className="fields2">
        <Field label="Fecha de compra">
          <input name="date" type="date" defaultValue={purchase?.date ?? today} required />
        </Field>
        <Field label="Tasa anual (0 = sin intereses)">
          <input name="annualRate" type="number" step="0.01" min={0} defaultValue={purchase ? purchase.annualRate / 100 : 0} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" name="withVat" defaultChecked={purchase?.withVat ?? true} /> Los intereses llevan IVA (16 %)
      </label>
      <p className="hint">La primera mensualidad cae en el estado de cuenta siguiente a la compra.</p>
    </>
  );
}

export function TransactionFields({ type, accounts, cards, tx, today }: { type: "income" | "expense"; accounts: Account[]; cards: Card[]; tx?: Transaction; today: string }) {
  return (
    <>
      {tx && <input type="hidden" name="id" value={tx.id} />}
      <input type="hidden" name="type" value={type} />
      <Field label="Descripción">
        <input name="description" defaultValue={tx?.description} placeholder={type === "income" ? "Quincena, venta…" : "Súper, gasolina…"} />
      </Field>
      <div className="fields2">
        <MoneyField label="Monto" name="amount" value={toPesos(tx?.amount)} />
        <Field label="Fecha">
          <input name="date" type="date" defaultValue={tx?.date ?? today} required />
        </Field>
      </div>
      <div className="fields2">
        <SelectField label="Categoría" name="category" value={tx?.category} options={type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES} />
        <ViaField accounts={accounts} cards={cards} value={tx ? viaValue(tx) : undefined} accountsOnly={type === "income"} label={type === "income" ? "Entró a" : "Pagaste con"} />
      </div>
    </>
  );
}

export function RecurringFields({ type, accounts, cards, item, price, current }: { type: "income" | "expense"; accounts: Account[]; cards: Card[]; item?: Recurring; price?: number; current: string }) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="type" value={type} />
      <Field label="Nombre">
        <input name="description" defaultValue={item?.description} placeholder={type === "income" ? "Quincena" : "Netflix, renta, internet…"} required />
      </Field>
      <div className="fields2">
        <SelectField label="Categoría" name="category" value={item?.category ?? (type === "expense" ? "Suscripciones" : "Sueldo")} options={type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES} />
        <ViaField accounts={accounts} cards={cards} value={item ? viaValue(item) : undefined} accountsOnly={type === "income"} label={type === "income" ? "Entra a" : "Se paga con"} />
      </div>
      {item ? (
        <input type="hidden" name="amount" value={toPesos(price)} />
      ) : (
        <MoneyField label="Monto" name="amount" />
      )}
      <div className="fields2">
        <SelectField label="Frecuencia" name="frequency" value={item?.frequency} options={[["monthly", "Mensual"], ["yearly", "Anual"]]} />
        <Field label="Día del cobro">
          <input name="day" type="number" min={1} max={31} defaultValue={item?.day} required />
        </Field>
      </div>
      <div className="fields2">
        <Field label="Desde">
          <input name="startPeriod" type="month" defaultValue={item?.startPeriod ?? current} required />
        </Field>
        <SelectField label="Mes del cobro (si es anual)" name="yearlyMonth" value={item?.yearlyMonth ? String(item.yearlyMonth) : ""} options={[["", "El mes de inicio"], ...MONTHS.map((m, i) => [String(i + 1), m] as const)]} />
      </div>
      {type === "expense" && (
        <label className="check">
          <input type="checkbox" name="isSubscription" defaultChecked={item?.isSubscription ?? true} /> Es una suscripción
        </label>
      )}
      {item && <p className="hint">Para cambiar el monto usa “Cambiar precio”, así se guarda el historial.</p>}
    </>
  );
}

export function GoalFields({ goal }: { goal?: Goal }) {
  return (
    <>
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <Field label="Nombre">
        <input name="name" defaultValue={goal?.name} placeholder="Fondo de emergencia" required />
      </Field>
      <div className="fields2">
        <MoneyField label="Quiero juntar" name="target" value={toPesos(goal?.target)} />
        <Field label="Para cuándo (opcional)">
          <input name="targetDate" type="date" defaultValue={goal?.targetDate ?? ""} />
        </Field>
      </div>
      <ColorField idPrefix={`goal-${goal?.id ?? "new"}`} value={goal?.color} />
    </>
  );
}

export function PaymentFields({ cardId, period, amount, accounts, today }: { cardId: string; period: string; amount: number; accounts: Account[]; today: string }) {
  return (
    <>
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="period" value={period} />
      <div className="fields2">
        <MoneyField label="Monto pagado" name="amount" value={amount > 0 ? toPesos(amount) : ""} />
        <Field label="Fecha">
          <input name="date" type="date" defaultValue={today} required />
        </Field>
      </div>
      <AccountField accounts={accounts} label="Desde la cuenta" />
    </>
  );
}
