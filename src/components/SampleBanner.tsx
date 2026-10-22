import "server-only";
import { eq } from "drizzle-orm";
import { deleteSampleData } from "@/app/sample-actions";
import { db, schema } from "@/db";
import { canSeeData } from "@/lib/viewer";
import { ActionButton } from "./ActionButton";
import { HideOnLogin } from "./HideOnLogin";

/** One notice on every screen while sample data is loaded, instead of tagging each row. */
export async function SampleBanner() {
  if (!(await canSeeData())) return null;
  const [card, account] = await Promise.all([
    db.select({ id: schema.cards.id }).from(schema.cards).where(eq(schema.cards.isSample, true)).limit(1),
    db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.isSample, true)).limit(1),
  ]);
  if (!card.length && !account.length) return null;
  return (
    <HideOnLogin>
      <div className="banner info row between">
        <span>Estás viendo datos de ejemplo.</span>
        <ActionButton action={deleteSampleData} confirm="¿Borrar todos los datos de ejemplo?" className="btn sm">
          Borrar ejemplos
        </ActionButton>
      </div>
    </HideOnLogin>
  );
}
