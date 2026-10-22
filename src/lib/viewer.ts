import "server-only";
import { cookies } from "next/headers";
import { isAuthEnabled, SESSION_COOKIE, verifySessionToken } from "./session";

/** Same rule as proxy.ts. The layout also renders on /login, so it must not load (or send) any data without a session. */
export async function canSeeData() {
  if (!isAuthEnabled()) return process.env.NODE_ENV !== "production";
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
