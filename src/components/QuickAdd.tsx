import "server-only";
import { cookies } from "next/headers";
import { saveTransaction } from "@/app/actions";
import { db, schema } from "@/db";
import { isAuthEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { todayISO } from "@/lib/periods";
import { ActionForm } from "./ActionForm";
import { Dialog } from "./Dialog";
import { TransactionFields } from "./forms";
import { HideOnLogin } from "./HideOnLogin";

/** Same rule as proxy.ts: without a session the layout must not load (or send) any data. */
async function canSeeData() {
  if (!isAuthEnabled()) return process.env.NODE_ENV !== "production";
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

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
