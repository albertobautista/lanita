import Link from "next/link";
import type { ReactNode } from "react";
import { cardBackground } from "@/lib/catalogs";
import type { Alert } from "@/lib/finance";
import { money } from "@/lib/format";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS: Record<Alert["kind"], ReactNode> = {
  card: icon("M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4"),
  limit: icon("M12 9v4M12 17h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"),
  budget: icon("M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z"),
  bill: icon("M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4"),
  subscription: icon("M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"),
};

function when(days: number) {
  if (days < 0) return "Vencido";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

/** The alerts of the home screen, most urgent first, each one a tappable tile. */
export function Alerts({ alerts }: { alerts: Alert[] }) {
  const worst = alerts.some((a) => a.level === "critical") ? "critical" : alerts.some((a) => a.level === "warning") ? "warning" : "info";
  const toPay = alerts.filter((a) => a.kind === "card" && a.level !== "info").reduce((s, a) => s + (a.amount ?? 0), 0);
  return (
    <section className="panel alerts">
      <div className="row between">
        <h2 className="row">
          Avisos <span className={`count ${worst}`}>{alerts.length}</span>
        </h2>
        {toPay > 0 && (
          <span className="small muted">
            Por pagar pronto <b className="num">{money(toPay)}</b>
          </span>
        )}
      </div>
      <div className="alert-grid">
        {alerts.map((a) => (
          <Link key={`${a.kind}|${a.href}|${a.title}|${a.text}`} href={a.href} className={`alert-tile ${a.level}`}>
            <span className="alert-icon">{ICONS[a.kind]}</span>
            <span className="alert-body">
              <span className="alert-title">
                {a.color && <span className="dot" style={{ background: cardBackground(a.color) }} />}
                {a.title}
              </span>
              <span className="alert-text">{a.text}</span>
            </span>
            {(a.amount != null && a.amount > 0) || a.days != null ? (
              <span className="alert-side">
                {a.amount != null && a.amount > 0 && <span className="alert-amount num">{money(a.amount)}</span>}
                {a.days != null && <span className="alert-when">{when(a.days)}</span>}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
