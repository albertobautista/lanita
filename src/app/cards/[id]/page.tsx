import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteBankStatement, deleteDueDate, deletePayment, recordDifference, recordPayment, saveBankStatement, saveDueDate, settleOverdue,
} from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { PaymentFields } from "@/components/forms";
import { EmptyState, Field, Kpi, MoneyField, MonthPicker, PageHeader, StatusPill } from "@/components/ui";
import { longDate, money, shortDate, shortMonthYear, toPesos } from "@/lib/format";
import { getFinance, monthParam, type SearchParams } from "@/lib/page-helpers";
import { addMonths, periodRange } from "@/lib/periods";

export default async function CardStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const [{ id }, sp, f] = await Promise.all([params, searchParams, getFinance()]);
  const card = f.card(id);
  if (!card) notFound();
  const month = monthParam(sp, f.current);
  const st = f.statement(card, month);
  const payments = f.d.payments.filter((p) => p.cardId === card.id && p.period === month);
  const owed = st.remaining;
  const movedDue = f.d.dueDates.some((x) => x.cardId === card.id && x.period === month);

  return (
    <>
      <PageHeader title={card.name}>
        <MonthPicker path={`/cards/${card.id}`} month={month} />
      </PageHeader>
      <div className="row">
        <p className="muted">
          <Link href="/cards">← Tarjetas</Link> · Corte el {longDate(st.cutoffDate)} · Pagar antes del {longDate(st.dueDate)}
          {movedDue && " (fecha del banco)"}
        </p>
        <Dialog trigger="Cambiar fecha de pago" title={`Fecha límite de ${shortMonthYear(month)}`} className="btn ghost sm">
          <p className="muted small">Si el banco movió la fecha límite este mes, captura la de tu estado de cuenta. Solo cambia este mes.</p>
          <ActionForm action={saveDueDate} resetOnSuccess={false}>
            <input type="hidden" name="cardId" value={card.id} />
            <input type="hidden" name="period" value={month} />
            <Field label="Fecha límite de pago">
              <input name="dueDate" type="date" defaultValue={st.dueDate} required />
            </Field>
          </ActionForm>
          {movedDue && (
            <ActionButton action={deleteDueDate.bind(null, card.id, month)} className="btn ghost sm">
              Usar el día de siempre ({card.dueDay})
            </ActionButton>
          )}
        </Dialog>
      </div>

      <div className="kpis">
        <Kpi label="Para no generar intereses" value={money(st.noInterestPayment)} note={st.bank ? "Cifra del banco" : "Calculado por Lanita"} />
        <Kpi label="Pago mínimo" value={money(st.minimumPayment)} note={st.paid > 0 && st.paid >= st.minimumPayment && st.remaining > 0 ? "Ya lo cubriste" : undefined} />
        <Kpi label="Pagado" value={money(st.paid)} tone={st.paid >= st.noInterestPayment && st.paid > 0 ? "pos" : undefined} note={<StatusPill st={st} />} />
        <Kpi label="Disponible" value={money(f.available(card))} note={`de ${money(card.creditLimit)}`} />
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Qué incluye</h2>
          <div className="tablewrap">
            <table>
              <tbody>
                {st.previousBalance !== 0 && (
                  <tr>
                    <td>{st.previousBalance > 0 ? "Saldo anterior sin pagar" : "Saldo a favor"}</td>
                    <td className="r num">{money(st.previousBalance)}</td>
                  </tr>
                )}
                {st.installments.map(({ purchase, payment }) => (
                  <tr key={purchase.id}>
                    <td>
                      {purchase.description}
                      <div className="small muted">{payment.settlement ? "Liquidación del saldo" : "Mensualidad"}</div>
                    </td>
                    <td className="r num">{money(payment.amount)}</td>
                  </tr>
                ))}
                {st.charges.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.description || t.category}
                      <div className="small muted">{shortDate(t.date)} · {t.category}</div>
                    </td>
                    <td className="r num">{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Calculado por Lanita</td>
                  <td className="r num">{money(st.calculated)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {st.installments.length + st.charges.length === 0 && st.previousBalance === 0 && <p className="muted">Sin cargos en este estado de cuenta.</p>}
          {st.estimatedInterest > 0 && <p className="hint">Si no liquidas el saldo anterior, el banco podría cobrarte unos {money(st.estimatedInterest)} de intereses.</p>}
        </section>

        <section className="panel">
          <h2>Estado de cuenta del banco</h2>
          {st.bank ? (
            <>
              <p>
                El banco pide <b className="num">{money(st.bank.noInterestPayment)}</b>
                {st.bank.minimumPayment != null && <> (mínimo {money(st.bank.minimumPayment)})</>}.
              </p>
              {st.difference !== 0 && (
                <div className="banner">
                  {st.difference > 0
                    ? `El banco cobra ${money(st.difference)} más de lo que registraste. Puede ser un gasto que olvidaste capturar.`
                    : `El banco cobra ${money(-st.difference)} menos de lo que registraste.`}
                </div>
              )}
              <div className="row">
                {st.difference > 0 && (
                  <ActionButton action={recordDifference.bind(null, card.id, month)} className="btn sm">
                    Registrar como gasto sin identificar
                  </ActionButton>
                )}
                <ActionButton action={deleteBankStatement.bind(null, card.id, month)} confirm="¿Volver a usar el cálculo de Lanita?">
                  Usar el cálculo de Lanita
                </ActionButton>
              </div>
            </>
          ) : (
            <p className="muted">Si ya te llegó el estado de cuenta, captura sus cifras: mandan sobre el cálculo.</p>
          )}
          <div className="row">
            <Dialog trigger={st.bank ? "Corregir cifras" : "Capturar cifras del banco"} title={`Estado de cuenta de ${shortMonthYear(month)}`} className="btn sm">
              <ActionForm action={saveBankStatement} resetOnSuccess={false}>
                <input type="hidden" name="cardId" value={card.id} />
                <input type="hidden" name="period" value={month} />
                <MoneyField label="Pago para no generar intereses" name="noInterestPayment" value={toPesos(st.bank?.noInterestPayment ?? st.calculated)} />
                <MoneyField label="Pago mínimo (opcional)" name="minimumPayment" value={toPesos(st.bank?.minimumPayment)} required={false} />
                <Field label="Notas">
                  <input name="notes" defaultValue={st.bank?.notes} />
                </Field>
              </ActionForm>
            </Dialog>
          </div>
        </section>
      </div>

      {f.firstOverduePeriod(card) && (
        <div className="banner row between">
          <span>Hay meses vencidos sin pago registrado y su saldo se va sumando a los siguientes. Si ya los pagaste en el banco, márcalos como pagados.</span>
          <ActionButton action={settleOverdue.bind(null, card.id)} confirm={`¿Marcar como pagados todos los meses vencidos de ${card.name}?`} className="btn sm">
            Marcar como pagados
          </ActionButton>
        </div>
      )}

      <section className="panel">
        <div className="row between">
          <h2>Pagos</h2>
          <Dialog trigger="Registrar pago" title={`Pago de ${card.name}`} className="btn primary sm">
            <ActionForm action={recordPayment}>
              <PaymentFields cardId={card.id} period={month} amount={owed} accounts={f.d.accounts} today={f.today} />
            </ActionForm>
          </Dialog>
        </div>
        {payments.length === 0 ? (
          <p className="muted">Aún no registras pagos para este estado de cuenta.</p>
        ) : (
          <div className="list">
            {payments.map((p) => (
              <div className="item" key={p.id}>
                <span>
                  {longDate(p.date)}
                  {p.accountId && <span className="small muted"> · desde {f.account(p.accountId)?.name}</span>}
                </span>
                <span className="row">
                  <b className="num">{money(p.amount)}</b>
                  <ActionButton action={deletePayment.bind(null, p.id)} confirm="¿Borrar este pago?" className="btn ghost sm danger">
                    Borrar
                  </ActionButton>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Últimos meses</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th className="r">A pagar</th>
                <th className="r">Pagado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {periodRange(addMonths(month, -5), 6)
                .reverse()
                .map((p) => {
                  const x = f.statement(card, p);
                  return (
                    <tr key={p}>
                      <td>
                        <Link href={`/cards/${card.id}?month=${p}`} style={{ textTransform: "capitalize" }}>
                          {shortMonthYear(p)}
                        </Link>
                      </td>
                      <td className="r num">{money(x.noInterestPayment)}</td>
                      <td className="r num">{money(x.paid)}</td>
                      <td>
                        <StatusPill st={x} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
      {f.d.accounts.length === 0 && (
        <EmptyState title="Tip">
          <p>
            Agrega tus <Link href="/accounts">cuentas</Link> para saber de dónde sale cada pago.
          </p>
        </EmptyState>
      )}
    </>
  );
}
