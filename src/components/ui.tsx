import Link from "next/link";
import type { ReactNode } from "react";
import type { Account, Card } from "@/db/schema";
import { COLORS } from "@/lib/catalogs";
import type { CardStatement } from "@/lib/finance";
import { monthName } from "@/lib/format";
import { addMonths } from "@/lib/periods";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function MonthPicker({ path, month, extra = {} }: { path: string; month: string; extra?: Record<string, string> }) {
  const href = (m: string) => `${path}?${new URLSearchParams({ ...extra, month: m })}`;
  return (
    <div className="month">
      <Link className="iconbtn" href={href(addMonths(month, -1))} aria-label="Mes anterior">
        ‹
      </Link>
      <span>{capitalize(monthName(month))}</span>
      <Link className="iconbtn" href={href(addMonths(month, 1))} aria-label="Mes siguiente">
        ›
      </Link>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="top">
      <h1>{title}</h1>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function StatusPill({ st }: { st: CardStatement }) {
  const [tone, label] = (() => {
    switch (st.status) {
      case "paid": return ["good", "Pagado"];
      case "no_charges": return ["neutral", "Sin cargos"];
      case "minimum": return ["warn", "Pagaste el mínimo"];
      case "partial": return ["warn", "Pago parcial"];
      case "overdue": return ["bad", `Venció hace ${-st.daysUntilDue} días`];
      case "due_soon": return ["warn", st.daysUntilDue === 0 ? "Vence hoy" : `Vence en ${st.daysUntilDue} días`];
      default: return ["neutral", "Pendiente"];
    }
  })();
  return <span className={`pill ${tone}`}>{label}</span>;
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar" role="presentation">
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        {label}
        {children}
      </label>
    </div>
  );
}

/** Amount in pesos; the action converts it to cents. */
export function MoneyField({ label, name, value, required = true }: { label: string; name: string; value?: string; required?: boolean }) {
  return (
    <Field label={label}>
      <input name={name} inputMode="decimal" placeholder="0.00" defaultValue={value} required={required} autoComplete="off" />
    </Field>
  );
}

export function SelectField({ label, name, options, value }: { label: string; name: string; options: readonly (string | readonly [string, string])[]; value?: string | null }) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? undefined}>
        {options.map((o) => {
          const [v, t] = typeof o === "string" ? [o, o] : o;
          return (
            <option key={v} value={v}>
              {t}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

/** Account or card, as "account:<id>" / "card:<id>" in the `via` field. */
export function ViaField({ accounts, cards, value, accountsOnly = false, label = "Con qué" }: { accounts: Account[]; cards: Card[]; value?: string; accountsOnly?: boolean; label?: string }) {
  return (
    <Field label={label}>
      <select name="via" defaultValue={value} required>
        <option value="">Elige…</option>
        {accounts.length > 0 && (
          <optgroup label="Cuentas">
            {accounts.map((a) => (
              <option key={a.id} value={`account:${a.id}`}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
        {!accountsOnly && cards.length > 0 && (
          <optgroup label="Tarjetas de crédito">
            {cards.map((c) => (
              <option key={c.id} value={`card:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </Field>
  );
}

export const viaValue = (x: { accountId: string | null; cardId: string | null }) =>
  x.cardId ? `card:${x.cardId}` : x.accountId ? `account:${x.accountId}` : "";

export function AccountField({ accounts, value, label = "Cuenta", name = "accountId", optional = true }: { accounts: Account[]; value?: string | null; label?: string; name?: string; optional?: boolean }) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ""} required={!optional}>
        <option value="">{optional ? "Ninguna" : "Elige…"}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ColorField({ idPrefix, value }: { idPrefix: string; value?: string }) {
  return (
    <div className="field">
      <span className="label">Color</span>
      <div className="swatches">
        {COLORS.map((c, i) => (
          <span key={c}>
            <input type="radio" name="color" id={`${idPrefix}-${i}`} value={c} defaultChecked={(value ?? COLORS[0]) === c} />
            <label htmlFor={`${idPrefix}-${i}`} style={{ background: c }} aria-label={`Color ${i + 1}`} />
          </span>
        ))}
      </div>
    </div>
  );
}

export function Kpi({ label, value, tone, note }: { label: string; value: string; tone?: "pos" | "neg"; note?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className={`v ${tone ?? ""}`}>{value}</span>
      {note && <span className="small muted">{note}</span>}
    </div>
  );
}
