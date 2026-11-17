import Link from "next/link";
import { deletePurchase, savePurchase, settlePurchase, undoSettlement } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { RowMenu } from "@/components/RowMenu";
import { PurchaseFields } from "@/components/forms";
import { EmptyState, Field, Kpi, PageHeader, ProgressBar } from "@/components/ui";
import type { CSSProperties } from "react";
import type { Card, Purchase } from "@/db/schema";
import { cardBackground, cardInk } from "@/lib/catalogs";
import type { Finance } from "@/lib/finance";
import { longDate, money, shortDate, shortMonthYear } from "@/lib/format";
import { getFinance } from "@/lib/page-helpers";
import { addMonths } from "@/lib/periods";

export const metadata = { title: "Meses sin intereses" };

export default async function InstallmentsPage() {
  const f = await getFinance();
  const { cards } = f.d;
  const rows = f.allPurchases().map((p) => ({ p, s: f.purchaseStatus(p) })).sort((a, b) => b.p.date.localeCompare(a.p.date));
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
                    <span className="swatch" style={{ background: cardBackground(card.color), width: 30, height: 20, borderRadius: 4, display: "inline-block" }} />
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
      <table className="stack fixed">
        {/* Same column widths in every card group so the tables line up. */}
        <colgroup>
          <col style={{ width: "36%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "29%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "8%" }} />
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
              <td className="full">
                <b>{p.description}</b>
                <div className="small muted">
                  {money(p.amount)} a {p.months} meses{p.annualRate > 0 && ` · ${p.annualRate / 100} % anual`} · {f.deferredBy.has(p.id) ? `corte del ${longDate(p.date)}` : longDate(p.date)}
                </div>
                {f.deferredBy.has(p.id) && (
                  <details>
                    <summary>
                      {f.deferredBy.get(p.id)!.length} compra{f.deferredBy.get(p.id)!.length === 1 ? "" : "s"} diferida{f.deferredBy.get(p.id)!.length === 1 ? "" : "s"} en automático
                    </summary>
                    <table>
                      <tbody>
                        {f.deferredBy.get(p.id)!.map((t) => (
                          <tr key={t.id}>
                            <td>
                              {t.description || t.category} · {shortDate(t.date)}
                            </td>
                            <td className="r num">{money(t.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
                <InstallmentCalendar s={s} />
              </td>
              <td className="r num" data-label="Mensualidad">
                {money(s.installment)}
              </td>
              <td className="full" style={{ minWidth: 120 }}>
                <SegmentedProgress s={s} />
                <span className="small muted">
                  {s.paidCount} de {s.months} pagadas · termina {shortMonthYear(s.end)}
                </span>
                {billed(s) && s.active && (
                  <span className="small muted" style={{ display: "block" }}>
                    Tu estado de cuenta ya trae la {billed(s)!.n} de {s.months}
                    {billed(s)!.dueDate && ` · vence ${shortDate(billed(s)!.dueDate!)}`}
                  </span>
                )}
                {s.settled && <span className="pill good">Liquidada</span>}
              </td>
              <td className="r num" data-label="Falta">
                {money(s.remaining)}
              </td>
              <td className="full r">
                {f.deferredBy.has(p.id) ? (
                  <span className="small muted" title="La tarjeta las difiere sola. Para cambiarlas edita las compras en Ingresos y gastos o la regla de la tarjeta.">
                    Auto
                  </span>
                ) : (
                <RowMenu label={p.description}>
                  <Dialog trigger="Editar" title={`Editar ${p.description}`} className="menuitem">
                    <ActionForm action={savePurchase} resetOnSuccess={false}>
                      <PurchaseFields cards={f.d.cards} purchase={p} today={f.today} />
                    </ActionForm>
                  </Dialog>
                  {s.settled ? (
                    <ActionButton action={undoSettlement.bind(null, p.id)} className="menuitem">
                      Deshacer liquidación
                    </ActionButton>
                  ) : (
                    s.active && (
                      <Dialog trigger="Liquidar" title={`Liquidar ${p.description}`} className="menuitem">
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
                  <ActionButton action={deletePurchase.bind(null, p.id)} confirm={`¿Borrar la compra ${p.description}?`} className="menuitem danger">
                    Borrar
                  </ActionButton>
                </RowMenu>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Status = Row["s"];

/** Latest installment already on a bank statement but not paid yet, numbered 1..N. */
function billed(s: Status) {
  const i = s.installments.findLastIndex((x) => x.state === "billed");
  return i < 0 ? null : { ...s.installments[i], n: i + 1 };
}

/** One segment per installment: paid filled, on a statement half-filled, still to come empty. */
function SegmentedProgress({ s }: { s: Status }) {
  // Long plans would turn into hairlines; a plain bar reads better there.
  if (s.installments.length > 24) return <ProgressBar value={s.months ? s.paidCount / s.months : 0} color={s.card?.color} />;
  return (
    <div className="segbar" role="img" aria-label={`${s.paidCount} de ${s.months} mensualidades pagadas`} style={{ "--plan": s.card?.color } as CSSProperties}>
      {s.installments.map((x) => (
        <i key={x.period} className={x.state} />
      ))}
    </div>
  );
}

/** The month-by-month plan, as a timeline: what is paid, what to pay now and what is still to come. */
function InstallmentCalendar({ s }: { s: Status }) {
  // The installment that needs attention: the one on a statement, or else the next one to be charged.
  const focus = s.installments.findIndex((x) => x.state === "billed") >= 0 ? s.installments.findIndex((x) => x.state === "billed") : s.installments.findIndex((x) => x.state === "upcoming");
  const next = focus >= 0 ? s.installments[focus] : null;
  return (
    <details className="plan">
      <summary>
        Calendario
        {next ? (
          <span className="plan-next">
            {" · "}
            {next.state === "billed" ? "por pagar" : "siguiente"} <b className="num">{money(next.amount)}</b>
            {next.state === "billed" && next.dueDate ? ` el ${shortDate(next.dueDate)}` : ` en ${shortMonthYear(next.period)}`}
          </span>
        ) : (
          <span className="plan-next"> · todo pagado</span>
        )}
      </summary>
      <ol className="plan-steps" style={{ "--plan": s.card?.color, "--plan-ink": s.card ? cardInk(s.card.color) : undefined } as CSSProperties}>
        {s.installments.map((x, i) => (
          <li key={x.period} className={`plan-step ${x.state}${i === focus ? " focus" : ""}`}>
            <span className="plan-mark" aria-hidden>
              {x.state === "paid" ? "✓" : x.settlement ? "L" : i + 1}
            </span>
            <span className="plan-text">
              <span className="plan-title">
                {x.settlement ? "Liquidación" : `${i + 1} de ${s.months}`} · <span style={{ textTransform: "capitalize" }}>{shortMonthYear(x.period)}</span>
              </span>
              <span className="plan-sub">
                {x.state === "paid"
                  ? "Pagada"
                  : x.state === "billed"
                    ? `Ya en tu estado de cuenta${x.dueDate ? ` · vence ${shortDate(x.dueDate)}` : ""}`
                    : x.cutoffDate
                      ? `Se carga en el corte del ${shortDate(x.cutoffDate)}`
                      : "Por venir"}
                {x.interest > 0 && ` · incluye ${money(x.interest)} de interés`}
              </span>
            </span>
            <span className="plan-amount num">{money(x.amount)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
