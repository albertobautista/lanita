import { contributeToGoal, deleteContribution, deleteGoal, saveGoal } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { RowMenu } from "@/components/RowMenu";
import { GoalFields } from "@/components/forms";
import { AccountField, EmptyState, Field, MoneyField, PageHeader, ProgressBar, SelectField } from "@/components/ui";
import { longDate, money, pct } from "@/lib/format";
import { getFinance } from "@/lib/page-helpers";

export const metadata = { title: "Metas de ahorro" };

export default async function GoalsPage() {
  const f = await getFinance();
  const { goals, contributions, accounts } = f.d;

  return (
    <>
      <PageHeader title="Metas de ahorro">
        <Dialog trigger="Nueva meta" title="Nueva meta" className="btn primary">
          <ActionForm action={saveGoal}>
            <GoalFields />
          </ActionForm>
        </Dialog>
      </PageHeader>

      {goals.length === 0 ? (
        <section className="panel">
          <EmptyState title="Sin metas todavía">
            <p>Un fondo de emergencia, un viaje, el enganche de un coche… Lanita te dice cuánto apartar cada mes.</p>
          </EmptyState>
        </section>
      ) : (
        <div className="grid2">
          {goals.map((g) => {
            const s = f.goalStatus(g);
            const history = contributions.filter((c) => c.goalId === g.id).sort((a, b) => b.date.localeCompare(a.date));
            return (
              <section className="panel" key={g.id}>
                <div className="row between">
                  <h2 className="row">
                    <span className="dot" style={{ background: g.color }} />
                    {g.name}
                  </h2>
                  {s.remaining === 0 ? <span className="pill good">¡Lograda!</span> : s.overdue && <span className="pill bad">Se pasó la fecha</span>}
                </div>
                <div className="row between">
                  <span className="num" style={{ fontSize: 22 }}>
                    {money(s.saved)}
                  </span>
                  <span className="muted small">
                    de {money(g.target)} · {pct(s.pct)}
                  </span>
                </div>
                <ProgressBar value={s.pct} color={g.color} />
                <p className="small muted">
                  {s.remaining > 0 ? `Te faltan ${money(s.remaining)}` : "Ya juntaste todo"}
                  {g.targetDate && ` · para el ${longDate(g.targetDate)}`}
                  {s.perMonth != null && s.remaining > 0 && ` · aparta ${money(s.perMonth)} al mes`}
                </p>
                <div className="row between">
                  <Dialog trigger="Aportar" title={`Aportar a ${g.name}`} className="btn primary sm">
                    <ActionForm action={contributeToGoal}>
                      <input type="hidden" name="goalId" value={g.id} />
                      <div className="fields2">
                        <SelectField label="Movimiento" name="direction" options={[["deposit", "Aportar"], ["withdraw", "Retirar"]]} />
                        <MoneyField label="Monto" name="amount" />
                      </div>
                      <div className="fields2">
                        <Field label="Fecha">
                          <input name="date" type="date" defaultValue={f.today} required />
                        </Field>
                        <AccountField accounts={accounts} label="Cuenta (opcional)" />
                      </div>
                      <p className="hint">Si eliges una cuenta, el dinero sale de ella (o regresa, si retiras).</p>
                    </ActionForm>
                  </Dialog>
                  <RowMenu label={g.name}>
                  <Dialog trigger="Editar" title={`Editar ${g.name}`} className="menuitem">
                    <ActionForm action={saveGoal} resetOnSuccess={false}>
                      <GoalFields goal={g} />
                    </ActionForm>
                  </Dialog>
                  <ActionButton action={deleteGoal.bind(null, g.id)} confirm={`¿Borrar la meta ${g.name} y sus aportaciones?`} className="menuitem danger">
                    Borrar
                  </ActionButton>
                  </RowMenu>
                </div>
                {history.length > 0 && (
                  <details>
                    <summary>Aportaciones ({history.length})</summary>
                    <div className="list">
                      {history.map((c) => (
                        <div className="item" key={c.id}>
                          <span className="small">
                            {longDate(c.date)}
                            {c.accountId && ` · ${f.account(c.accountId)?.name}`}
                          </span>
                          <span className="row">
                            <span className={`num ${c.amount < 0 ? "neg" : "pos"}`}>{money(c.amount)}</span>
                            <ActionButton action={deleteContribution.bind(null, c.id)} confirm="¿Borrar este movimiento?" className="btn ghost sm danger">
                              Borrar
                            </ActionButton>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
