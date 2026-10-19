import Link from "next/link";
import { recordPayment } from "@/app/actions";
import { deleteSampleData, loadSampleData } from "@/app/sample-actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { PaymentFields } from "@/components/forms";
import { EmptyState, Kpi, MonthPicker, PageHeader, ProgressBar, StatusPill } from "@/components/ui";
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
  const alerts = month === f.current ? f.alerts() : [];
  const maxCategory = s.byCategory[0]?.[1] ?? 0;
  const hasSamples = [...cards, ...accounts].some((x) => x.isSample);
  const best = f.bestCardToday()[0];

  return (
    <>
      <PageHeader title="Resumen">
        <MonthPicker path="/" month={month} />
      </PageHeader>

      {hasSamples && (
        <div className="banner info row between">
          <span>Estás viendo datos de ejemplo.</span>
          <ActionButton action={deleteSampleData} confirm="¿Borrar todos los datos de ejemplo?" className="btn sm">
            Borrar ejemplos
          </ActionButton>
        </div>
      )}

      <div className="kpis">
        <Kpi label="Ingresos" value={money(s.income)} note={s.projectedIncome > 0 ? `+ ${money(s.projectedIncome)} por llegar` : undefined} />
        <Kpi label="Gastos" value={money(s.expenses)} note={s.projectedExpenses > 0 ? `+ ${money(s.projectedExpenses)} por cobrar` : undefined} />
        <Kpi label="Mensualidades" value={money(s.installments)} note="Compras a meses" />
        <Kpi label="Te queda" value={money(s.expectedBalance)} tone={s.expectedBalance >= 0 ? "pos" : "neg"} note="Contando lo que falta del mes" />
      </div>

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
          <h2>Pagos de tarjetas</h2>
          <span className="small muted">Estados de cuenta que vencen en este mes</span>
        </div>
        {cards.length === 0 ? (
          <EmptyState title="Aún no tienes tarjetas">
            <Link href="/cards">Agregar una tarjeta</Link>
          </EmptyState>
        ) : (
          <div className="pays">
            {cards.map((c) => {
              const st = f.statement(c, month);
              const owed = Math.max(0, st.noInterestPayment - st.paid);
              return (
                <div className="pay" key={c.id}>
                  <span className="swatch" style={{ background: c.color }} />
                  <div>
                    <Link href={`/cards/${c.id}?month=${month}`}>
                      <b>{c.name}</b>
                    </Link>
                    <div className="small muted">
                      Pagar antes del {shortDate(st.dueDate)} · mínimo {money(st.minimumPayment)}
                      {st.paid > 0 && ` · pagaste ${money(st.paid)}`}
                    </div>
                  </div>
                  <div className="amt">
                    <span className="num">{money(st.noInterestPayment)}</span>
                    <div className="row">
                      <StatusPill st={st} />
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
              );
            })}
          </div>
        )}
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
