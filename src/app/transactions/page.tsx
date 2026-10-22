import Link from "next/link";
import { deleteTransaction, saveTransaction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { RowMenu } from "@/components/RowMenu";
import { TransactionFields } from "@/components/forms";
import { EmptyState, Kpi, MonthPicker, PageHeader } from "@/components/ui";
import { money, shortDate } from "@/lib/format";
import { getFinance, monthParam, param, type SearchParams } from "@/lib/page-helpers";
import { periodOf } from "@/lib/periods";

export const metadata = { title: "Ingresos y gastos" };

const FILTERS = [
  ["all", "Todos"],
  ["expense", "Gastos"],
  ["income", "Ingresos"],
] as const;

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const [f, sp] = await Promise.all([getFinance(), searchParams]);
  const month = monthParam(sp, f.current);
  const filter = param(sp, "type") === "income" || param(sp, "type") === "expense" ? param(sp, "type")! : "all";
  const { accounts, cards } = f.d;
  const inMonth = f.d.transactions.filter((t) => periodOf(t.date) === month);
  const list = inMonth
    .filter((t) => filter === "all" || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const income = inMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = inMonth.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const canRecord = accounts.length + cards.length > 0;

  return (
    <>
      <PageHeader title="Ingresos y gastos">
        <MonthPicker path="/transactions" month={month} extra={filter === "all" ? {} : { type: filter }} />
        {accounts.length > 0 && (
          <Dialog trigger="Nuevo ingreso" title="Nuevo ingreso" className="btn">
            <ActionForm action={saveTransaction}>
              <TransactionFields type="income" accounts={accounts} cards={cards} today={f.today} />
            </ActionForm>
          </Dialog>
        )}
        {canRecord && (
          <Dialog trigger="Nuevo gasto" title="Nuevo gasto" className="btn primary">
            <ActionForm action={saveTransaction}>
              <TransactionFields type="expense" accounts={accounts} cards={cards} today={f.today} />
            </ActionForm>
          </Dialog>
        )}
      </PageHeader>

      {!canRecord && (
        <div className="banner info">
          Primero agrega una <Link href="/accounts">cuenta</Link> o una <Link href="/cards">tarjeta</Link> para registrar movimientos.
        </div>
      )}

      <div className="kpis">
        <Kpi label="Ingresos" value={money(income)} tone="pos" />
        <Kpi label="Gastos" value={money(expenses)} note="Por fecha de compra" />
        <Kpi label="Diferencia" value={money(income - expenses)} tone={income - expenses >= 0 ? "pos" : "neg"} note="Sin contar mensualidades" />
      </div>

      <section className="panel">
        <div className="seg" role="group" aria-label="Filtrar">
          {FILTERS.map(([value, label]) => (
            <Link
              key={value}
              href={`/transactions?${new URLSearchParams(value === "all" ? { month } : { month, type: value })}`}
              className="btn ghost sm"
              aria-pressed={filter === value}
              style={filter === value ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
        {list.length === 0 ? (
          <EmptyState title="Sin movimientos en este mes" />
        ) : (
          <div className="tablewrap">
            <table className="stack">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Con qué</th>
                  <th className="r">Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="small wide-only">{shortDate(t.date)}</td>
                    <td className="grow span2">
                      {t.description || "—"}
                      {t.recurringId && <span className="pill neutral" style={{ marginLeft: 6 }}>fijo</span>}
                      <div className="small muted narrow-only">
                        {shortDate(t.date)} · {t.category} · {f.card(t.cardId)?.name ?? f.account(t.accountId)?.name ?? "—"}
                      </div>
                    </td>
                    <td className="small wide-only">{t.category}</td>
                    <td className="small muted wide-only">{f.card(t.cardId)?.name ?? f.account(t.accountId)?.name ?? "—"}</td>
                    <td className={`r num ${t.type === "income" ? "pos" : ""}`}>
                      {t.type === "income" ? "+" : "−"}
                      {money(t.amount)}
                    </td>
                    <td className="r">
                      <RowMenu label={t.description || t.category}>
                        <Dialog trigger="Editar" title={t.type === "income" ? "Editar ingreso" : "Editar gasto"} className="menuitem">
                          <ActionForm action={saveTransaction} resetOnSuccess={false}>
                            <TransactionFields type={t.type} accounts={accounts} cards={cards} tx={t} today={f.today} />
                          </ActionForm>
                        </Dialog>
                        <ActionButton action={deleteTransaction.bind(null, t.id)} confirm="¿Borrar este movimiento?" className="menuitem danger">
                          Borrar
                        </ActionButton>
                      </RowMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
