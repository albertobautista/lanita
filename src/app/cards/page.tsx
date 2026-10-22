import Link from "next/link";
import { deleteCard, saveCard } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { Dialog } from "@/components/Dialog";
import { RowMenu } from "@/components/RowMenu";
import { CardFields } from "@/components/forms";
import { EmptyState, PageHeader, ProgressBar, StatusPill } from "@/components/ui";
import { money, money0, shortDate } from "@/lib/format";
import { getFinance } from "@/lib/page-helpers";

export const metadata = { title: "Tarjetas" };

export default async function CardsPage() {
  const f = await getFinance();
  const { cards } = f.d;
  const totalLimit = cards.reduce((s, c) => s + c.creditLimit, 0);
  const totalUsed = cards.reduce((s, c) => s + f.used(c), 0);

  return (
    <>
      <PageHeader title="Tarjetas de crédito">
        <Dialog trigger="Agregar tarjeta" title="Nueva tarjeta" className="btn primary">
          <ActionForm action={saveCard}>
            <CardFields />
          </ActionForm>
        </Dialog>
      </PageHeader>

      {cards.length === 0 ? (
        <section className="panel">
          <EmptyState title="Agrega tu primera tarjeta">
            <p>Con el límite, el día de corte y el día de pago, Lanita calcula cuánto pagar cada mes.</p>
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="label">Límite total</span>
              <span className="v">{money0(totalLimit)}</span>
            </div>
            <div className="kpi">
              <span className="label">Usado</span>
              <span className="v">{money0(totalUsed)}</span>
              <ProgressBar value={totalLimit ? totalUsed / totalLimit : 0} />
            </div>
            <div className="kpi">
              <span className="label">Disponible</span>
              <span className="v pos">{money0(totalLimit - totalUsed)}</span>
            </div>
          </div>

          <div className="cards">
            {cards.map((c) => {
              const used = f.used(c);
              const st = f.statement(c, f.current);
              return (
                <article className="cardbox" key={c.id}>
                  <Link href={`/cards/${c.id}`} className="plastic" style={{ background: c.color, textDecoration: "none" }}>
                    <div className="row between">
                      <span className="bank">{c.bank || c.name}</span>
                      <span className="chip" />
                    </div>
                    <span className="digits">•••• {c.last4 || "····"}</span>
                    <div className="meta">
                      <span>{c.name}</span>
                      <span>
                        Corte {c.cutoffDay} · Pago {c.dueDay}
                      </span>
                    </div>
                  </Link>
                  <div className="stats">
                    <div>
                      <span className="label">Usado</span>
                      <b>{money0(used)}</b>
                    </div>
                    <div>
                      <span className="label">Disponible</span>
                      <b className={f.available(c) < 0 ? "neg" : "pos"}>{money0(f.available(c))}</b>
                    </div>
                    <div>
                      <span className="label">Límite</span>
                      <b>{money0(c.creditLimit)}</b>
                    </div>
                  </div>
                  <ProgressBar value={c.creditLimit ? used / c.creditLimit : 0} color={c.color} />
                  <div className="row between small">
                    <span>
                      Este mes: <b className="num">{money(st.noInterestPayment)}</b> antes del {shortDate(st.dueDate)}
                    </span>
                    <StatusPill st={st} />
                  </div>
                  <div className="row between">
                    <Link className="btn sm" href={`/cards/${c.id}`}>
                      Estado de cuenta
                    </Link>
                    <RowMenu label={c.name}>
                    <Dialog trigger="Editar" title={`Editar ${c.name}`} className="menuitem">
                      <ActionForm action={saveCard} resetOnSuccess={false}>
                        <CardFields card={c} />
                      </ActionForm>
                    </Dialog>
                    <ActionButton action={deleteCard.bind(null, c.id)} confirm={`¿Borrar la tarjeta ${c.name}?`} className="menuitem danger">
                      Borrar
                    </ActionButton>
                    </RowMenu>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
