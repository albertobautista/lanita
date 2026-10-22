import Link from "next/link";
import { money, shortMonth } from "@/lib/format";

export type MonthAhead = { period: string; left: number; income: number; expenses: number; installments: number };

/** One bar per month for "Te queda": above the line if money is left, below it if the month falls short. */
export function MonthsAhead({ months, selected }: { months: MonthAhead[]; selected: string }) {
  // With nothing left or owed anywhere, the zero line sits at the bottom.
  const top = Math.max(0, ...months.map((m) => m.left)) || (months.some((m) => m.left < 0) ? 0 : 1);
  const bottom = Math.max(0, ...months.map((m) => -m.left));
  const range = top + bottom || 1;
  return (
    <div className="ahead" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
      {months.map((m) => {
        const height = `${(Math.abs(m.left) / range) * 100}%`;
        const tip = `${shortMonth(m.period)}: te queda ${money(m.left)} · ingresos ${money(m.income)} · gastos ${money(m.expenses)} · mensualidades ${money(m.installments)}`;
        return (
          <Link key={m.period} href={`/?month=${m.period}`} className="ahead-col" title={tip} aria-label={tip} aria-current={m.period === selected ? "true" : undefined}>
            <span className={`ahead-v num ${m.left < 0 ? "neg" : ""}`}>{label(m.left)}</span>
            <span className="ahead-plot" style={{ gridTemplateRows: `${top}fr ${bottom}fr` }}>
              <span className="ahead-up">{m.left > 0 && <i style={{ height }} />}</span>
              <span className="ahead-down">{m.left < 0 && <i style={{ height }} />}</span>
            </span>
            <span className="ahead-m">{shortMonth(m.period)}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** "$4.9k", "$15k", "−$800": short enough for six columns on a phone. */
function label(cents: number) {
  const v = Math.abs(cents) / 100;
  const text = v >= 1000 ? `$${(v / 1000).toLocaleString("es-MX", { maximumFractionDigits: v >= 10_000 ? 0 : 1 })}k` : `$${Math.round(v)}`;
  return (cents < 0 ? "−" : "") + text;
}
