import { deleteBudget, saveBudget } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { EmptyState, Kpi, MoneyField, MonthPicker, PageHeader, ProgressBar, SelectField } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/catalogs";
import { money, toPesos } from "@/lib/format";
import { getFinance, monthParam, type SearchParams } from "@/lib/page-helpers";

export const metadata = { title: "Presupuestos" };

const LEVELS = { over: ["bad", "Te pasaste"], warning: ["warn", "Casi al límite"], ok: ["good", "Vas bien"] } as const;

export default async function BudgetsPage({ searchParams }: { searchParams: SearchParams }) {
  const [f, sp] = await Promise.all([getFinance(), searchParams]);
  const month = monthParam(sp, f.current);
  const rows = f.budgets(month);
  const total = rows.reduce((s, r) => s + r.budget.amount, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);

  return (
    <>
      <PageHeader title="Presupuestos">
        <MonthPicker path="/budgets" month={month} />
        <Dialog trigger="Agregar presupuesto" title="Presupuesto por categoría" className="btn primary">
          <ActionForm action={saveBudget}>
            <SelectField label="Categoría" name="category" options={EXPENSE_CATEGORIES} />
            <MoneyField label="Monto al mes" name="amount" />
          </ActionForm>
        </Dialog>
      </PageHeader>

      {rows.length === 0 ? (
        <section className="panel">
          <EmptyState title="Sin presupuestos">
            <p>Ponle un tope mensual a categorías como Súper o Comida y Lanita te avisa cuando te acerques.</p>
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="kpis">
            <Kpi label="Presupuesto" value={money(total)} />
            <Kpi label="Gastado" value={money(spent)} />
            <Kpi label="Disponible" value={money(total - spent)} tone={total - spent >= 0 ? "pos" : "neg"} />
          </div>
          <section className="panel">
            <p className="small muted">Incluye los gastos del mes y las mensualidades de compras a meses de cada categoría.</p>
            <div className="list">
              {rows.map((r) => {
                const [tone, label] = LEVELS[r.level];
                return (
                  <div className="item" key={r.budget.id} style={{ display: "grid", gap: 6 }}>
                    <div className="row between">
                      <b>{r.budget.category}</b>
                      <span className="row">
                        <span className={`pill ${tone}`}>{label}</span>
                        <span className="num small">
                          {money(r.spent)} de {money(r.budget.amount)}
                        </span>
                      </span>
                    </div>
                    <ProgressBar value={r.pct} color={r.level === "over" ? "var(--bad)" : r.level === "warning" ? "var(--warn)" : undefined} />
                    <div className="row between small muted">
                      <span>{r.remaining >= 0 ? `Te quedan ${money(r.remaining)}` : `Te pasaste por ${money(-r.remaining)}`}</span>
                      <span className="row">
                        <Dialog trigger="Cambiar" title={`Presupuesto de ${r.budget.category}`} className="btn ghost sm">
                          <ActionForm action={saveBudget} resetOnSuccess={false}>
                            <input type="hidden" name="category" value={r.budget.category} />
                            <MoneyField label="Monto al mes" name="amount" value={toPesos(r.budget.amount)} />
                          </ActionForm>
                        </Dialog>
                        <ActionButton action={deleteBudget.bind(null, r.budget.id)} confirm={`¿Borrar el presupuesto de ${r.budget.category}?`} className="btn ghost sm danger">
                          Borrar
                        </ActionButton>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}
