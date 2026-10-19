import Link from "next/link";
import { deletePurchase, savePurchase, settlePurchase, undoSettlement } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { PurchaseFields } from "@/components/forms";
import { EmptyState, Field, Kpi, PageHeader, ProgressBar, SampleTag } from "@/components/ui";
import type { Card, Purchase } from "@/db/schema";
import type { Finance } from "@/lib/finance";
import { longDate, money, shortMonthYear } from "@/lib/format";
import { getFinance } from "@/lib/page-helpers";
import { addMonths } from "@/lib/periods";

export const metadata = { title: "Meses sin intereses" };

export default async function InstallmentsPage() {
  const f = await getFinance();
  const { cards, purchases } = f.d;
  const rows = purchases.map((p) => ({ p, s: f.purchaseStatus(p) })).sort((a, b) => b.p.date.localeCompare(a.p.date));
  const active = rows.filter((r) => r.s.active);
  const finished = rows.filter((r) => !r.s.active);
  const pending = active.reduce((s, r) => s + r.s.remaining, 0);

  return (
    <>
      <PageHeader title="Compras a meses">
        {cards.length > 0 && (
          <Dialog trigger="Agregar compra" title="Nueva compra a meses" className="btn primary">
            <ActionForm action={savePurchase}>
              <PurchaseFields cards={cards} today={f.today} />
            </ActionForm>
          </Dialog>
        )}
      </PageHeader>

      {cards.length === 0 ? (
        <section className="panel">
          <EmptyState title="Primero agrega una tarjeta">
            <Link href="/cards">Ir a tarjetas</Link>
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="kpis">
            <Kpi label="Este mes pagas" value={money(f.installmentsIn(f.current))} />
            <Kpi label="El próximo mes" value={money(f.installmentsIn(addMonths(f.current, 1)))} />
            <Kpi label="Te falta pagar" value={money(pending)} note={`${active.length} compra${active.length === 1 ? "" : "s"} activa${active.length === 1 ? "" : "s"}`} />
          </div>

          {active.length === 0 ? (
            <section className="panel">
              <p className="muted">No tienes compras a meses activas.</p>
            </section>
          ) : (
            byCard(active, cards).map(({ card, rows: cardRows }) => (
              <section className="panel" key={card.id}>
                <div className="row between">
                  <h2 className="row">
                    <span className="swatch" style={{ background: card.color, width: 30, height: 20, borderRadius: 4, display: "inline-block" }} />
                    {card.name}
                  </h2>
                  <span className="small muted">
                    Este mes <b className="num">{money(f.installmentsIn(f.current, card.id))}</b> · Falta{" "}
                    <b className="num">{money(cardRows.reduce((s, r) => s + r.s.remaining, 0))}</b>
                  </span>
                </div>
                <PurchaseTable rows={cardRows} f={f} />
              </section>
            ))
          )}

          {finished.length > 0 && (
            <section className="panel">
              <h2>Terminadas</h2>
              {byCard(finished, cards).map(({ card, rows: cardRows }) => (
                <div key={card.id} style={{ display: "grid", gap: 8 }}>
                  <h3 className="row">
                    <span className="dot" style={{ background: card.color }} />
                    {card.name}
                  </h3>
                  <PurchaseTable rows={cardRows} f={f} />
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}

type Row = { p: Purchase; s: ReturnType<Finance["purchaseStatus"]> };

/** Groups purchases by card, in the same order as the cards list. */
function byCard(rows: Row[], cards: Card[]) {
  return cards.map((card) => ({ card, rows: rows.filter((r) => r.p.cardId === card.id) })).filter((g) => g.rows.length > 0);
}

function PurchaseTable({ rows, f }: { rows: Row[]; f: Finance }) {
  return (
    <div className="tablewrap">
      <table style={{ tableLayout: "fixed", minWidth: 760 }}>
        {/* Same column widths in every card group so the tables line up. */}
        <colgroup>
          <col style={{ width: "32%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "19%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "24%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Compra</th>
            <th className="r">Mensualidad</th>
            <th>Avance</th>
            <th className="r">Falta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, s }) => (
            <tr key={p.id}>
              <td>
                <b>{p.description}</b>
                <SampleTag show={p.isSample} />
                <div className="small muted">
                  {money(p.amount)} a {p.months} meses{p.annualRate > 0 && ` · ${p.annualRate / 100} % anual`} · {longDate(p.date)}
                </div>
                <details>
                  <summary>Calendario</summary>
                  <table>
                    <tbody>
                      {s.schedule.map((x, i) => (
                        <tr key={x.period}>
                          <td style={{ textTransform: "capitalize" }}>
                            {x.settlement ? "Liquidación" : `${i + 1}/${s.months}`} · {shortMonthYear(x.period)}
                          </td>
                          <td className="r num">{money(x.amount)}</td>
                          {x.interest > 0 && <td className="r num small muted">int. {money(x.interest)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </td>
              <td className="r num">{money(s.installment)}</td>
              <td style={{ minWidth: 120 }}>
                <ProgressBar value={s.months ? s.paidCount / s.months : 0} color={s.card?.color} />
                <span className="small muted">
                  {s.paidCount} de {s.months} · termina {shortMonthYear(s.end)}
                </span>
                {s.settled && <span className="pill good">Liquidada</span>}
              </td>
              <td className="r num">{money(s.remaining)}</td>
              <td>
                <div className="row">
                  <Dialog trigger="Editar" title={`Editar ${p.description}`} className="btn ghost sm">
                    <ActionForm action={savePurchase} resetOnSuccess={false}>
                      <PurchaseFields cards={f.d.cards} purchase={p} today={f.today} />
                    </ActionForm>
                  </Dialog>
                  {s.settled ? (
                    <ActionButton action={undoSettlement.bind(null, p.id)}>Deshacer liquidación</ActionButton>
                  ) : (
                    s.active && (
                      <Dialog trigger="Liquidar" title={`Liquidar ${p.description}`} className="btn ghost sm">
                        <ActionForm action={settlePurchase} submitLabel="Liquidar">
                          <input type="hidden" name="id" value={p.id} />
                          <Field label="¿En qué estado de cuenta pagas el resto?">
                            <input name="period" type="month" defaultValue={f.current} required />
                          </Field>
                          <p className="hint">El saldo que falta se suma completo a ese estado de cuenta y ya no hay más mensualidades.</p>
                        </ActionForm>
                      </Dialog>
                    )
                  )}
                  <ActionButton action={deletePurchase.bind(null, p.id)} confirm={`¿Borrar la compra ${p.description}?`} className="btn ghost sm danger">
                    Borrar
                  </ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
