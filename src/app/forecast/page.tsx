import Link from "next/link";
import { EmptyState, Field, Kpi, PageHeader } from "@/components/ui";
import { INSTALLMENT_TERMS } from "@/lib/catalogs";
import { money, shortMonthYear, toCents, toPesos } from "@/lib/format";
import { getFinance, param, type SearchParams } from "@/lib/page-helpers";

export const metadata = { title: "Proyección" };

const HORIZON = 12;

export default async function ForecastPage({ searchParams }: { searchParams: SearchParams }) {
  const [f, sp] = await Promise.all([getFinance(), searchParams]);
  const { cards, accounts, goals } = f.d;

  if (!cards.length && !accounts.length) {
    return (
      <section className="panel">
        <EmptyState title="Primero agrega tus cuentas y tarjetas">
          <Link href="/accounts">Ir a cuentas</Link>
        </EmptyState>
      </section>
    );
  }

  // A plain GET form, like the simulator: the values live in the URL and the page recalculates on the server.
  const variableText = param(sp, "variable") ?? toPesos(f.typicalVariableSpending());
  const variable = Math.max(0, toCents(variableText));
  const amountText = param(sp, "amount") ?? "";
  const amount = toCents(amountText);
  const via = param(sp, "via") ?? "cash";
  const cardId = via.startsWith("card:") ? via.slice(5) : null;
  const months = cardId ? Math.max(1, Number(param(sp, "months") ?? 1) || 1) : 1;

  const flow = f.cashFlow({ months: HORIZON, variable });
  const check = amount > 0 ? f.canAfford({ amount, months, date: f.today, annualRate: 0, cardId }, { months: HORIZON, variable }) : null;
  const rows = check?.flow.rows ?? flow.rows;

  // Savings plan: an emergency fund of three months of what goes out, and the goals with a date.
  const later = flow.rows.slice(1);
  const monthlyOut = later.length ? Math.round(later.reduce((s, r) => s + r.expenses + r.cards, 0) / later.length) : 0;
  const saved = f.savedToday();
  const emergency = monthlyOut * 3;
  const emergencyLeft = Math.max(0, emergency - saved);
  const emergencyMonths = flow.monthlySaving > 0 ? Math.ceil(emergencyLeft / flow.monthlySaving) : null;
  const goalsPerMonth = goals.reduce((s, g) => s + (f.goalStatus(g).perMonth ?? 0), 0);
  // When the installments end, what they take each month is freed.
  const withInstallments = flow.rows.filter((r) => f.installmentsIn(r.period) > 0);
  const lastInstallments = withInstallments.at(-1);
  const freedAfter = lastInstallments && lastInstallments !== flow.rows.at(-1) ? f.installmentsIn(lastInstallments.period) : 0;

  return (
    <>
      <PageHeader title="Proyección" />

      <div className="kpis">
        <Kpi label="Dinero hoy" value={money(flow.start)} tone={flow.start < 0 ? "neg" : undefined} note="En tus cuentas de débito y efectivo" />
        <Kpi
          label="Saldo positivo"
          value={flow.positiveFrom ? (flow.positiveFrom === f.current && flow.start >= 0 ? "Ya lo estás" : `Desde ${shortMonthYear(flow.positiveFrom)}`) : "No en 12 meses"}
          tone={flow.positiveFrom ? "pos" : "neg"}
          note={flow.lowest < 0 ? `Tu punto más bajo: ${money(flow.lowest)}` : "Nunca bajas de cero"}
        />
        <Kpi label="Libre para gastar hoy" value={money(flow.freeToSpend)} note="Sin quedar en negativo ningún mes" />
        <Kpi label="Puedes guardar al mes" value={money(flow.monthlySaving)} tone={flow.monthlySaving > 0 ? "pos" : undefined} note={flow.positiveFrom ? `A partir de ${shortMonthYear(flow.positiveFrom)}` : "Primero hay que salir de números rojos"} />
      </div>

      <section className="panel">
        <h2>¿Puedo hacer esta compra?</h2>
        <form method="get" style={{ display: "grid", gap: 14 }}>
          <div className="fields2">
            <Field label="Monto">
              <input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={amountText} />
            </Field>
            <Field label="Cómo la pagas">
              <select name="via" defaultValue={via}>
                <option value="cash">Débito o efectivo</option>
                {cards.map((c) => (
                  <option key={c.id} value={`card:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="fields2">
            <Field label="Meses (solo con tarjeta)">
              <select name="months" defaultValue={String(months)}>
                <option value="1">De contado</option>
                {INSTALLMENT_TERMS.map((n) => (
                  <option key={n} value={n}>
                    {n} meses sin intereses
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Gasto variable al mes">
              <input name="variable" inputMode="decimal" placeholder="0.00" defaultValue={variableText} />
            </Field>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            El gasto variable es lo que gastas sin que sea fijo (súper, gasolina, salidas). Lo calculamos con el promedio de tus últimos 3 meses; ajústalo si lo sabes mejor.
          </p>
          <div className="actions" style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn primary">Calcular</button>
          </div>
        </form>
        {check &&
          (check.affordable ? (
            <div className="banner good">Sí te alcanza: con esta compra, lo menos que tendrías en los próximos 12 meses es {money(check.flow.lowest)}.</div>
          ) : (
            <div className="banner bad">
              Ahorita no: en algún mes te faltarían {money(check.shortBy)}.{" "}
              {check.fitsFrom ? `Si la haces a partir de ${shortMonthYear(check.fitsFrom)}, ya te alcanza.` : "No te alcanza en los próximos 12 meses con tus gastos actuales."}
            </div>
          ))}
      </section>

      <section className="panel">
        <h2>Mes a mes</h2>
        <div className="tablewrap">
          <table style={{ whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th>Mes</th>
                <th className="r">Ingresos</th>
                <th className="r">Gastos</th>
                <th className="r">Tarjetas</th>
                {check && <th className="r">Esta compra</th>}
                <th className="r">Te queda al final</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period}>
                  <td style={{ textTransform: "capitalize" }}>{shortMonthYear(r.period)}</td>
                  <td className="r num">{money(r.income)}</td>
                  <td className="r num">−&nbsp;{money(r.expenses)}</td>
                  <td className="r num">−&nbsp;{money(r.cards)}</td>
                  {check && <td className="r num">{r.purchase ? `−\u00a0${money(r.purchase)}` : "—"}</td>}
                  <td className={`r num ${r.end < 0 ? "neg" : ""}`}>
                    <b>{money(r.end)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Este mes solo cuenta lo que falta: ingresos y cargos fijos por llegar y lo que aún debes de tus tarjetas. Los siguientes suponen que pagas cada estado de cuenta completo, más tu gasto variable. Las cuentas de ahorro no se cuentan aquí.
        </p>
      </section>

      <section className="panel">
        <h2>Plan para ahorrar</h2>
        <div className="list">
          <p>
            Ya tienes guardado <b>{money(saved)}</b> en cuentas de ahorro y metas.
          </p>
          {emergency > 0 && (
            <p>
              Un fondo de emergencia de 3 meses de gastos serían <b>{money(emergency)}</b>.{" "}
              {emergencyLeft === 0
                ? "Ya lo tienes."
                : emergencyMonths
                  ? `Guardando ${money(flow.monthlySaving)} al mes lo juntas en ${emergencyMonths} ${emergencyMonths === 1 ? "mes" : "meses"}.`
                  : "Primero necesitas que te sobre dinero cada mes."}
            </p>
          )}
          {lastInstallments && freedAfter > 0 && (
            <p>
              Tus mensualidades actuales terminan en <b style={{ textTransform: "capitalize" }}>{shortMonthYear(lastInstallments.period)}</b>; después liberas {money(freedAfter)} al mes. Evitar nuevas compras a meses hasta entonces es la forma más rápida de empezar a ahorrar.
            </p>
          )}
          {goalsPerMonth > 0 && (
            <p>
              Tus metas piden {money(goalsPerMonth)} al mes.{" "}
              {goalsPerMonth <= flow.monthlySaving ? "Te alcanza para cumplirlas a tiempo." : `Hoy puedes apartar ${money(flow.monthlySaving)}; ajusta las fechas o los montos en `}
              {goalsPerMonth > flow.monthlySaving && <Link href="/goals">Metas</Link>}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
