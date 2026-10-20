import "server-only";
import { connection } from "next/server";
import { loadFinance } from "./data";
import { isPeriod } from "./periods";

/** Fresh data on every visit (screens are never prerendered against the database). */
export async function getFinance() {
  await connection();
  return loadFinance();
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** `?month=YYYY-MM` or the current month. */
export function monthParam(sp: Record<string, string | string[] | undefined>, current: string) {
  const m = param(sp, "month");
  return isPeriod(m) ? m : current;
}
