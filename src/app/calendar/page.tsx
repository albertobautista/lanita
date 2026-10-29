import Link from "next/link";
import { Fragment } from "react";
import { EmptyState, Kpi, MonthPicker, PageHeader, StatusPill } from "@/components/ui";
import { cardBackground } from "@/lib/catalogs";
import type { CalendarEvent } from "@/lib/finance";
import { money } from "@/lib/format";
import { getFinance, monthParam, type SearchParams } from "@/lib/page-helpers";
import { dateInPeriod, daysInMonth } from "@/lib/periods";

export const metadata = { title: "Calendario" };

const KINDS: Record<CalendarEvent["kind"], string> = {
  due: "Pago de tarjeta",
  cutoff: "Corte",
  installment_end: "Último mes",
  bill: "Cargo fijo",
  subscription: "Suscripción",
  income: "Ingreso",
  goal: "Meta",
};
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** "Pago Oro" instead of "Pago de Oro": short enough for a calendar cell. */
const chipText = (e: CalendarEvent) => e.title.replace(/^(Pago|Corte) de /, "$1 ").replace(/^Terminas de pagar /, "Fin ").replace(/^Meta: /, "");

function dayLabel(date: string) {
  const s = new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const f = await getFinance();
  const month = monthParam(await searchParams, f.current);
  const events = f.calendar(month);
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  // Monday-first grid: blanks before the 1st, then every day of the month.
  const first = new Date(`${month}-01T12:00:00`).getDay();
  const blanks = (first + 6) % 7;
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => dateInPeriod(month, i + 1));

  const sum = (kinds: CalendarEvent["kind"][]) => events.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + (e.amount ?? 0), 0);
  const cardPayments = sum(["due"]);
  const fixed = sum(["bill", "subscription"]);
  const income = sum(["income"]);

  return (
    <>
      <PageHeader title="Calendario">
        <MonthPicker path="/calendar" month={month} />
      </PageHeader>

      <div className="kpis">
        <Kpi label="Pagos de tarjetas" value={money(cardPayments)} note="Para no generar intereses" />
        <Kpi label="Cargos fijos y suscripciones" value={money(fixed)} note="Lo que se cobra este mes" />
        <Kpi label="Ingresos fijos" value={money(income)} tone={income > 0 ? "pos" : undefined} note="Sueldo y otros que se repiten" />
      </div>

      <section className="panel">
        <div className="cal" role="grid" aria-label="Días del mes">
          {WEEKDAYS.map((w) => (
            <span key={w} className="cal-wd" role="columnheader">
              {w}
            </span>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <span key={`b${i}`} className="cal-day blank" aria-hidden="true" />
          ))}
          {days.map((date) => {
            const list = byDate.get(date) ?? [];
            const className = `cal-day${date === f.today ? " today" : ""}${date < f.today ? " past" : ""}`;
            const body = (
              <>
                <span className="cal-n">{Number(date.slice(8))}</span>
                <span className="cal-chips">
                  {list.slice(0, 3).map((e, i) => (
                    <span key={i} className={`cal-chip k-${e.kind}`}>
                      {chipText(e)}
                    </span>
                  ))}
                  {list.length > 3 && <span className="cal-more">+{list.length - 3} más</span>}
                </span>
                <span className="cal-dots" aria-hidden="true">
                  {list.slice(0, 4).map((e, i) => (
                    <i key={i} className={`k-${e.kind}`} />
                  ))}
                </span>
              </>
            );
            return list.length ? (
              <a key={date} href={`#d-${date}`} className={className} role="gridcell" aria-label={`${dayLabel(date)}: ${list.map((e) => e.title).join(", ")}`}>
                {body}
              </a>
            ) : (
              <span key={date} className={className} role="gridcell">
                {body}
              </span>
            );
          })}
        </div>
        <div className="legend">
          {Object.entries(KINDS).map(([kind, label]) => (
            <span key={kind}>
              <i className={`dot k-${kind}`} />
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Fechas del mes</h2>
        {events.length === 0 ? (
          <EmptyState title="Nada en este mes">
            <p>Aquí verás los cortes y pagos de tus tarjetas, tus cargos fijos, suscripciones y metas.</p>
          </EmptyState>
        ) : (
          <div className="agenda">
            {[...byDate.entries()].map(([date, list]) => (
              <Fragment key={date}>
                <h3 id={`d-${date}`} className={`agenda-day${date < f.today ? " past" : ""}`}>
                  {dayLabel(date)}
                  {date === f.today && <span className="pill neutral">Hoy</span>}
                </h3>
                {list.map((e, i) => (
                  <div key={i} className={`agenda-row${date < f.today ? " past" : ""}`}>
                    {e.color ? <span className="swatch" style={{ background: cardBackground(e.color) }} /> : <span className={`swatch k-${e.kind}`} />}
                    <div className="agenda-main">
                      <Link href={e.href}>
                        <b>{e.title}</b>
                      </Link>
                      <div className="small muted">
                        <span className={`kind k-${e.kind}`}>{KINDS[e.kind]}</span>
                        {e.detail && ` · ${e.detail}`}
                      </div>
                    </div>
                    <div className="amt">
                      {e.amount != null && <span className={`num${e.kind === "income" ? " pos" : ""}`}>{money(e.amount)}</span>}
                      {e.statement && e.statement.noInterestPayment > 0 && <StatusPill st={e.statement} />}
                    </div>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
