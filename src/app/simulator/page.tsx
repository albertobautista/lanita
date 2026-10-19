import Link from "next/link";
import { EmptyState, Field, Kpi, PageHeader, SelectField } from "@/components/ui";
import { INSTALLMENT_TERMS } from "@/lib/catalogs";
import { money, shortDate, shortMonthYear, toCents } from "@/lib/format";
import { getFinance, param, type SearchParams } from "@/lib/page-helpers";

export const metadata = { title: "Simulador" };

export default async function SimulatorPage({ searchParams }: { searchParams: SearchParams }) {
  const [f, sp] = await Promise.all([getFinance(), searchParams]);
  const { cards } = f.d;
  const best = f.bestCardToday();

  if (!cards.length) {
    return (
      <section className="panel">
        <EmptyState title="Primero agrega una tarjeta">
          <Link href="/cards">Ir a tarjetas</Link>
        </EmptyState>
      </section>
    );
  }

  // The simulator is a plain GET form: the values live in the URL and the page recalculates on the server.
  const cardId = param(sp, "card") ?? best[0]?.card.id ?? cards[0].id;
  const amountText = param(sp, "amount") ?? "";
  const months = Number(param(sp, "months") ?? 12);
  const date = param(sp, "date") ?? f.today;
  const rate = Number(param(sp, "rate") ?? 0);
  const amount = toCents(amountText);
  const sim =
    amount > 0 && Number.isFinite(months) && months >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(date) && rate >= 0
      ? f.simulate({ cardId, amount, months, date, annualRate: Math.round(rate * 100), withVat: true, settledPeriod: null })
      : null;

  return (
    <>
      <PageHeader title="¿Me alcanza?" />

      <section className="panel">
        <h2>Simula una compra</h2>
        <form method="get" style={{ display: "grid", gap: 14 }}>
          <div className="fields2">
            <SelectField label="Tarjeta" name="card" value={cardId} options={cards.map((c) => [c.id, c.name] as const)} />
            <Field label="Monto">
              <input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={amountText} required />
            </Field>
          </div>
          <div className="fields2">
            <SelectField label="Meses" name="months" value={String(months)} options={[["1", "De contado"], ...INSTALLMENT_TERMS.map((n) => [String(n), `${n} meses`] as const)]} />
            <Field label="Fecha de compra">
              <input name="date" type="date" defaultValue={date} />
            </Field>
          </div>
          <Field label="Tasa anual (0 = sin intereses)">
            <input name="rate" type="number" step="0.01" min={0} defaultValue={rate} />
          </Field>
          <div className="actions" style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn primary">Simular</button>
          </div>
        </form>
      </section>

      {sim && (
        <>
          <div className="kpis">
            <Kpi label={months > 1 ? "Mensualidad" : "Pagas"} value={money(sim.plan.installment)} note={`De ${shortMonthYear(sim.plan.start)} a ${shortMonthYear(sim.plan.end)}`} />
            <Kpi label="Total a pagar" value={money(sim.plan.total)} note={sim.plan.interest > 0 ? `${money(sim.plan.interest)} de intereses` : "Sin intereses"} />
            <Kpi label={`Disponible en ${sim.card.name}`} value={money(sim.availableAfter)} tone={sim.availableAfter < 0 ? "neg" : "pos"} note={`Hoy: ${money(sim.availableBefore)}`} />
          </div>
          {sim.availableAfter < 0 && <div className="banner">No te alcanza el crédito disponible de esta tarjeta.</div>}
          {sim.income > 0 && sim.peakAfter > sim.income && (
            <div className="banner">
              En algún mes tus pagos de tarjetas y cargos fijos ({money(sim.peakAfter)}) superarían tu ingreso típico ({money(sim.income)}).
            </div>
          )}
          <section className="panel">
            <h2>Cómo quedan tus pagos</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="r">Tarjetas hoy</th>
                    <th className="r">Esta compra</th>
                    <th className="r">Tarjetas después</th>
                    <th className="r">Cargos fijos</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.rows.map((r) => (
                    <tr key={r.period}>
                      <td style={{ textTransform: "capitalize" }}>{shortMonthYear(r.period)}</td>
                      <td className="r num">{money(r.before)}</td>
                      <td className="r num">{r.extra ? money(r.extra) : "—"}</td>
                      <td className="r num">
                        <b>{money(r.after)}</b>
                      </td>
                      <td className="r num muted">{money(r.fixed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="panel">
        <h2>Mejor tarjeta para comprar hoy</h2>
        <div className="pays">
          {best.map((b) => (
            <div className="pay" key={b.card.id}>
              <span className="swatch" style={{ background: b.card.color }} />
              <div>
                <b>{b.card.name}</b>
                <div className="small muted">
                  Lo pagas hasta el {shortDate(b.dueDate)} · {b.days} días
                </div>
              </div>
              <div className="amt">
                <span className="num">{money(b.available)}</span>
                <span className="small muted">disponible</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
