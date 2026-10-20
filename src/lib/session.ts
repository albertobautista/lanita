import { createHmac, timingSafeEqual } from "node:crypto";

/** Single-user login: one password (APP_PASSWORD) and a signed cookie that says "this browser already entered". */

export const SESSION_COOKIE = "lanita_session";
export const SESSION_DAYS = 30;

type AuthEnv = { password?: string; secret?: string };

const env = (): AuthEnv => ({ password: process.env.APP_PASSWORD, secret: process.env.APP_SECRET });

/** No password configured means the app is open (only meant for local use). */
export function isAuthEnabled(e: AuthEnv = env()): boolean {
  return Boolean(e.password);
}

/** The signing key depends on the password too, so changing APP_PASSWORD signs everyone out. */
function sign(value: string, e: AuthEnv): Buffer {
  return createHmac("sha256", `${e.secret ?? ""}:${e.password ?? ""}`).update(value).digest();
}

/** Constant-time comparison, so response time doesn't leak how much of the password was right. */
export function checkPassword(attempt: string, e: AuthEnv = env()): boolean {
  if (!e.password) return false;
  return timingSafeEqual(sign(`password:${attempt}`, e), sign(`password:${e.password}`, e));
}

/** Token = "<expires ms>.<signature>". */
export function createSessionToken(now = Date.now(), e: AuthEnv = env()): string {
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${sign(`session:${expires}`, e).toString("base64url")}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now(), e: AuthEnv = env()): boolean {
  if (!token || !e.password) return false;
  const [expires, signature] = token.split(".");
  if (!/^\d+$/.test(expires ?? "") || !signature || Number(expires) < now) return false;
  const expected = sign(`session:${expires}`, e);
  const given = Buffer.from(signature, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Only same-site paths, so the login can't be used to bounce someone to another website. */
export function safeNextPath(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : "/";
}
