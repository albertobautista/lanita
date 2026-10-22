import "server-only";
import { saveTransaction } from "@/app/actions";
import { db, schema } from "@/db";
import { todayISO } from "@/lib/periods";
import { canSeeData } from "@/lib/viewer";
import { ActionForm } from "./ActionForm";
import { Dialog } from "./Dialog";
import { TransactionFields } from "./forms";
import { HideOnLogin } from "./HideOnLogin";

/** "+ Gasto" from any screen: a button in the header, floating above the bottom bar on phones. */
export async function QuickAdd() {
  if (!(await canSeeData())) return null;
  const [accounts, cards] = await Promise.all([
    db.select().from(schema.accounts).orderBy(schema.accounts.createdAt),
    db.select().from(schema.cards).orderBy(schema.cards.createdAt),
  ]);
  if (!accounts.length && !cards.length) return null;
  return (
    <HideOnLogin>
      <Dialog trigger="+ Gasto" title="Nuevo gasto" className="btn primary quickadd">
        <ActionForm action={saveTransaction}>
          <TransactionFields type="expense" accounts={accounts} cards={cards} today={todayISO()} />
        </ActionForm>
      </Dialog>
    </HideOnLogin>
  );
}
