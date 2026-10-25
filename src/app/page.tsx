import Link from "next/link";
import { recordPayment, settleOverdue } from "@/app/actions";
import { loadSampleData } from "@/app/sample-actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { MonthsAhead } from "@/components/MonthsAhead";
import { PaymentFields } from "@/components/forms";
import { Amount, EmptyState, MonthPicker, PageHeader, ProgressBar, StatusPill } from "@/components/ui";
import { cardBackground } from "@/lib/catalogs";
import { money, shortDate, shortMonth } from "@/lib/format";
import { getFinance, monthParam, type SearchParams } from "@/lib/page-helpers";
import { addMonths, periodRange } from "@/lib/periods";

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const f = await getFinance();
  const month = monthParam(await searchParams, f.current);
  const { cards, accounts } = f.d;

  if (!cards.length && !accounts.length) {
    return (
      <section className="panel">
        <EmptyState title="Bienvenido a Lanita">
          <p>Empieza agregando tus tarjetas y cuentas, o carga datos de ejemplo para ver cómo funciona.</p>
          <div className="row">
            <Link className="btn primary" href="/cards">
              Agregar una tarjeta
            </Link>
            <ActionButton action={loadSampleData} className="btn">
              Cargar ejemplo
            </ActionButton>
          </div>
        </EmptyState>
      </section>
    );
  }

  const s = f.monthSummary(month);
  // Alerts about a statement shown in "Pagos de tarjetas" already show up there as its status.
  const shownStatements = new Set(cards.map((c) => `/cards/${c.id}?month=${month}`));
  const alerts = month === f.current ? f.alerts().filter((a) => !shownStatements.has(a.href)) : [];
  const payments = cards
    .map((c) => {
      const st = f.statement(c, month);
      return { c, st, owed: st.remaining };
    })
    // Still to pay first, then by due date.
    .sort((a, b) => Number(b.owed > 0) - Number(a.owed > 0) || a.st.dueDate.localeCompare(b.st.dueDate));
  const toPay = payments.reduce((sum, x) => sum + x.owed, 0);
  const maxCategory = s.byCategory[0]?.[1] ?? 0;
  const best = f.bestCardToday()[0];
  const ahead = periodRange(month, 6).map((p) => {
    const m = f.monthSummary(p);
    return { period: p, left: m.expectedBalance, income: m.income + m.projectedIncome, expenses: m.expenses + m.projectedExpenses, installments: m.installments };
  });

  return (
    <>
      <PageHeader title="Resumen">
        <MonthPicker path="/" month={month} />
      </PageHeader>

      <section className="panel hero">
        <div className="hero-main">
          <span className="label">Te queda este mes</span>
          <span className={`hero-v ${s.expectedBalance >= 0 ? "pos" : "neg"}`}>
            <Amount value={money(s.expectedBalance)} />
          </span>
          <span className="small muted">Contando lo que falta por llegar y por cobrar</span>
        </div>
        <dl className="hero-parts">
          <div>
            <dt>Ingresos</dt>
            <dd className="num">{money(s.income + s.projectedIncome)}</dd>
            {s.projectedIncome > 0 && <span className="small muted">{money(s.projectedIncome)} por llegar</span>}
          </div>
          <div>
            <dt>Gastos del mes</dt>
            <dd className="num">− {money(s.expenses + s.projectedExpenses)}</dd>
            <span className="small muted">{s.projectedExpenses > 0 ? `${money(s.projectedExpenses)} por cobrar · ` : ""}tarjetas por mes de pago</span>
          </div>
          <div>
            <dt>Mensualidades</dt>
            <dd className="num">− {money(s.installments)}</dd>
            <Link className="small" href="/installments">
              Ver compras a meses
            </Link>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="row between">
          <h2>Pagos de tarjetas</h2>
          {toPay > 0 && (
            <span className="small muted">
              Te falta pagar <b className="num">{money(toPay)}</b>
            </span>
          )}
        </div>
        {cards.length === 0 ? (
          <EmptyState title="Aún no tienes tarjetas">
            <Link href="/cards">Agregar una tarjeta</Link>
          </EmptyState>
        ) : (
          <div className="pays">
            {payments.map(({ c, st, owed }) => (
              <div className="pay" key={c.id}>
                <span className="swatch" style={{ background: cardBackground(c.color) }} />
                <div>
                  <Link href={`/cards/${c.id}?month=${month}`}>
                    <b>{c.name}</b>
                  </Link>
                  <div className="small muted">
                    Pagar antes del {shortDate(st.dueDate)} · mínimo {money(st.minimumPayment)}
                    {st.paid > 0 && st.paid >= st.minimumPayment && st.remaining > 0 && " (cubierto)"}
                    {st.paid > 0 && ` · pagaste ${money(st.paid)}`}
                  </div>
                </div>
                <div className="amt">
                  <span className="num">{money(st.noInterestPayment)}</span>
                  <div className="row">
                    <StatusPill st={st} />
                    {f.firstOverduePeriod(c) && (
                      <ActionButton action={settleOverdue.bind(null, c.id)} confirm={`¿Marcar como pagados todos los meses vencidos de ${c.name}?`} className="btn sm">
                        Ya lo pagué
                      </ActionButton>
                    )}
                    {owed > 0 && (
                      <Dialog trigger="Registrar pago" title={`Pago de ${c.name}`} className="btn sm">
                        <ActionForm action={recordPayment}>
                          <PaymentFields cardId={c.id} period={month} amount={owed} accounts={accounts} today={f.today} />
                        </ActionForm>
                      </Dialog>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {alerts.length > 0 && (
        <section className="panel">
          <h2>Avisos</h2>
          <div className="list">
            {alerts.map((a) => (
              <Link key={a.text} href={a.href} className="alert">
                <span className={`pill ${a.level === "critical" ? "bad" : a.level === "warning" ? "warn" : "neutral"}`}>{a.level === "critical" ? "Urgente" : a.level === "warning" ? "Atención" : "Aviso"}</span>
                <span>{a.text}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="row between">
          <h2>Los próximos meses</h2>
          <span className="small muted">Cuánto te queda cada mes</span>
        </div>
        <MonthsAhead months={ahead} selected={month} />
        <p className="small muted">Cuenta tus ingresos y gastos fijos, lo que ya cargaste a tus tarjetas y las mensualidades. No incluye gastos que todavía no haces.</p>
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>En qué se va el dinero</h2>
          {s.byCategory.length === 0 ? (
            <p className="muted">Sin gastos este mes.</p>
          ) : (
            s.byCategory.map(([category, amount]) => (
              <div className="catrow" key={category}>
                <span>{category}</span>
                <ProgressBar value={maxCategory ? amount / maxCategory : 0} />
                <span className="num small">{money(amount)}</span>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <h2>Mensualidades que vienen</h2>
          <div className="tablewrap">
            <table>
              <tbody>
                {periodRange(addMonths(month, 1), 6).map((p) => (
                  <tr key={p}>
                    <td style={{ textTransform: "capitalize" }}>{shortMonth(p)}</td>
                    <td className="r num">{money(f.installmentsIn(p))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best && (
            <p className="hint">
              <b>Para comprar hoy:</b> usa la {best.card.name}; lo pagas hasta el {shortDate(best.dueDate)} ({best.days} días).
            </p>
          )}
        </section>
      </div>
    </>
  );
}
