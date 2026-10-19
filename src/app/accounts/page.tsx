import { deleteAccount, deleteTransfer, saveAccount, saveTransfer } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { AccountFields } from "@/components/forms";
import { AccountField, EmptyState, Field, Kpi, MoneyField, PageHeader, SampleTag } from "@/components/ui";
import { longDate, money } from "@/lib/format";
import { getFinance } from "@/lib/page-helpers";

export const metadata = { title: "Cuentas" };

const TYPE_LABELS = { debit: "Débito", cash: "Efectivo", savings: "Ahorro" } as const;

export default async function AccountsPage() {
  const f = await getFinance();
  const { accounts, transfers } = f.d;
  const total = accounts.reduce((s, a) => s + f.accountBalance(a), 0);
  const recent = [...transfers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  return (
    <>
      <PageHeader title="Cuentas">
        <Dialog trigger="Agregar cuenta" title="Nueva cuenta" className="btn primary">
          <ActionForm action={saveAccount}>
            <AccountFields />
          </ActionForm>
        </Dialog>
        {accounts.length > 1 && (
          <Dialog trigger="Transferir" title="Transferencia entre cuentas" className="btn">
            <ActionForm action={saveTransfer}>
              <div className="fields2">
                <AccountField accounts={accounts} name="fromAccountId" label="De" optional={false} />
                <AccountField accounts={accounts} name="toAccountId" label="A" optional={false} />
              </div>
              <div className="fields2">
                <MoneyField label="Monto" name="amount" />
                <Field label="Fecha">
                  <input name="date" type="date" defaultValue={f.today} required />
                </Field>
              </div>
              <Field label="Descripción">
                <input name="description" placeholder="Retiro en cajero…" />
              </Field>
            </ActionForm>
          </Dialog>
        )}
      </PageHeader>

      {accounts.length === 0 ? (
        <section className="panel">
          <EmptyState title="Agrega tus cuentas">
            <p>Débito, efectivo o ahorro: así sabes cuánto tienes y de dónde salen tus pagos.</p>
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="kpis">
            <Kpi label="Total en cuentas" value={money(total)} tone={total >= 0 ? "pos" : "neg"} />
            {accounts.map((a) => (
              <Kpi key={a.id} label={a.name} value={money(f.accountBalance(a))} note={TYPE_LABELS[a.type]} />
            ))}
          </div>
          <section className="panel">
            <div className="list">
              {accounts.map((a) => (
                <div className="item" key={a.id}>
                  <span className="row">
                    <span className="dot" style={{ background: a.color }} />
                    <b>{a.name}</b>
                    <span className="small muted">{TYPE_LABELS[a.type]}</span>
                    <SampleTag show={a.isSample} />
                  </span>
                  <span className="row">
                    <b className="num">{money(f.accountBalance(a))}</b>
                    <Dialog trigger="Editar" title={`Editar ${a.name}`} className="btn ghost sm">
                      <ActionForm action={saveAccount} resetOnSuccess={false}>
                        <AccountFields account={a} />
                      </ActionForm>
                    </Dialog>
                    <ActionButton action={deleteAccount.bind(null, a.id)} confirm={`¿Borrar la cuenta ${a.name}?`} className="btn ghost sm danger">
                      Borrar
                    </ActionButton>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {recent.length > 0 && (
        <section className="panel">
          <h2>Transferencias</h2>
          <div className="list">
            {recent.map((t) => (
              <div className="item" key={t.id}>
                <span>
                  {f.account(t.fromAccountId)?.name} → {f.account(t.toAccountId)?.name}
                  <div className="small muted">
                    {longDate(t.date)}
                    {t.description && ` · ${t.description}`}
                  </div>
                </span>
                <span className="row">
                  <b className="num">{money(t.amount)}</b>
                  <ActionButton action={deleteTransfer.bind(null, t.id)} confirm="¿Borrar esta transferencia?" className="btn ghost sm danger">
                    Borrar
                  </ActionButton>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
