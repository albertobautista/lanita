import Link from "next/link";
import { cancelRecurring, changePrice, deleteRecurring, reactivateRecurring, saveRecurring } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { RowMenu } from "@/components/RowMenu";
import { RecurringFields } from "@/components/forms";
import { EmptyState, Field, Kpi, MoneyField, PageHeader } from "@/components/ui";
import type { Recurring } from "@/db/schema";
import { currentPrice, monthlyEquivalentCost, nextCharge, type Finance } from "@/lib/finance";
import { longDate, money, shortDate, shortMonthYear, toPesos } from "@/lib/format";
import { getFinance } from "@/lib/page-helpers";

export const metadata = { title: "Suscripciones" };

export default async function SubscriptionsPage() {
  const f = await getFinance();
  const { recurring, accounts, cards, prices } = f.d;
  const isActive = (r: Recurring) => !r.endPeriod || r.endPeriod >= f.current;
  const subscriptions = recurring.filter((r) => r.type === "expense" && r.isSubscription && isActive(r));
  const bills = recurring.filter((r) => r.type === "expense" && !r.isSubscription && isActive(r));
  const income = recurring.filter((r) => r.type === "income" && isActive(r));
  const canceled = recurring.filter((r) => !isActive(r));
  const monthly = (list: Recurring[]) => list.reduce((s, r) => s + monthlyEquivalentCost(r, prices, f.current), 0);
  const canRecord = accounts.length + cards.length > 0;

  return (
    <>
      <PageHeader title="Suscripciones y cargos fijos">
        {canRecord && (
          <>
            <Dialog trigger="Agregar gasto fijo" title="Nueva suscripción o cargo fijo" className="btn primary">
              <ActionForm action={saveRecurring}>
                <RecurringFields type="expense" accounts={accounts} cards={cards} current={f.current} />
              </ActionForm>
            </Dialog>
            {accounts.length > 0 && (
              <Dialog trigger="Agregar ingreso fijo" title="Nuevo ingreso fijo" className="btn">
                <ActionForm action={saveRecurring}>
                  <RecurringFields type="income" accounts={accounts} cards={cards} current={f.current} />
                </ActionForm>
              </Dialog>
            )}
          </>
        )}
      </PageHeader>

      {!canRecord && (
        <div className="banner info">
          Primero agrega una <Link href="/accounts">cuenta</Link> o una <Link href="/cards">tarjeta</Link>.
        </div>
      )}

      <div className="kpis">
        <Kpi label="Suscripciones al mes" value={money(monthly(subscriptions))} note={`${money(monthly(subscriptions) * 12)} al año`} />
        <Kpi label="Cargos fijos al mes" value={money(monthly(bills))} />
        <Kpi label="Ingresos fijos al mes" value={money(monthly(income))} tone="pos" />
      </div>

      <Section title="Suscripciones" items={subscriptions} f={f} />
      <Section title="Cargos fijos" items={bills} f={f} />
      <Section title="Ingresos fijos" items={income} f={f} />
      {canceled.length > 0 && <Section title="Canceladas" items={canceled} f={f} />}
      {recurring.length === 0 && (
        <section className="panel">
          <EmptyState title="Sin cargos fijos todavía">
            <p>Agrega tu sueldo, renta y suscripciones: Lanita los registra solos cada mes.</p>
          </EmptyState>
        </section>
      )}
    </>
  );
}

function Section({ title, items, f }: { title: string; items: Recurring[]; f: Finance }) {
  if (!items.length) return null;
  const { prices, accounts, cards } = f.d;
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="list">
        {items.map((r) => {
          const price = currentPrice(prices, r.id, r.endPeriod && r.endPeriod < f.current ? r.endPeriod : f.current);
          const next = nextCharge(r, prices, f.today);
          const history = prices.filter((p) => p.recurringId === r.id).sort((a, b) => b.startPeriod.localeCompare(a.startPeriod));
          const via = f.card(r.cardId)?.name ?? f.account(r.accountId)?.name;
          const canceled = !!r.endPeriod && r.endPeriod < f.current;
          return (
            <div className="item" key={r.id}>
              <div>
                <b>{r.description}</b>
                <div className="small muted">
                  {r.category} · {r.frequency === "yearly" ? "anual" : "mensual"}, día {r.day}
                  {via && ` · ${via}`}
                  {next && !canceled && ` · próximo cobro ${next.date.slice(0, 4) === f.today.slice(0, 4) ? shortDate(next.date) : longDate(next.date)}`}
                  {r.endPeriod && ` · ${canceled ? "último cobro" : "se cobra hasta"} ${shortMonthYear(r.endPeriod)}`}
                </div>
                {history.length > 1 && (
                  <details>
                    <summary>Historial de precios</summary>
                    <ul className="small">
                      {history.map((p) => (
                        <li key={p.id}>
                          Desde {shortMonthYear(p.startPeriod)}: {money(p.amount)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div className="row">
                <b className={`num ${r.type === "income" ? "pos" : ""}`}>{money(price)}</b>
                <RowMenu label={r.description}>
                {canceled ? (
                  <ActionButton action={reactivateRecurring.bind(null, r.id)} className="menuitem">
                    Reactivar
                  </ActionButton>
                ) : (
                  <>
                    <Dialog trigger={r.type === "income" ? "Cambiar monto" : "Cambiar precio"} title={`${r.type === "income" ? "Nuevo monto" : "Nuevo precio"} de ${r.description}`} className="menuitem">
                      <ActionForm action={changePrice}>
                        <input type="hidden" name="id" value={r.id} />
                        <div className="fields2">
                          <MoneyField label={r.type === "income" ? "Monto nuevo" : "Precio nuevo"} name="amount" value={toPesos(price)} />
                          <Field label="Desde">
                            <input name="startPeriod" type="month" defaultValue={f.current} required />
                          </Field>
                        </div>
                      </ActionForm>
                    </Dialog>
                    <Dialog trigger="Editar" title={`Editar ${r.description}`} className="menuitem">
                      <ActionForm action={saveRecurring} resetOnSuccess={false}>
                        <RecurringFields type={r.type} accounts={accounts} cards={cards} item={r} price={price} current={f.current} />
                      </ActionForm>
                    </Dialog>
                    <Dialog trigger="Cancelar" title={`Cancelar ${r.description}`} className="menuitem">
                      <ActionForm action={cancelRecurring} submitLabel="Cancelar">
                        <input type="hidden" name="id" value={r.id} />
                        <Field label="Último mes que se cobra">
                          <input name="endPeriod" type="month" defaultValue={f.current} required />
                        </Field>
                      </ActionForm>
                    </Dialog>
                  </>
                )}
                <ActionButton action={deleteRecurring.bind(null, r.id, false)} confirm={`¿Borrar ${r.description}? Los cobros ya registrados se quedan como movimientos.`} className="menuitem danger">
                  Borrar
                </ActionButton>
                </RowMenu>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
