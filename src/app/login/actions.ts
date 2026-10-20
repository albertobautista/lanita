"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, isAuthEnabled, safeNextPath, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

export type LoginState = { error?: string } | null;

// Brute-force brake: after MAX_FAILURES wrong passwords from the same address, wait LOCK_MINUTES.
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const failures = new Map<string, { count: number; since: number }>();

export async function login(_prev: LoginState, fd: FormData): Promise<LoginState> {
  if (!isAuthEnabled()) return { error: "Falta configurar APP_PASSWORD en el servidor." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const record = failures.get(ip);
  if (record && now - record.since > LOCK_MINUTES * 60_000) failures.delete(ip);
  if ((failures.get(ip)?.count ?? 0) >= MAX_FAILURES) {
    return { error: `Demasiados intentos. Espera ${LOCK_MINUTES} minutos y vuelve a intentarlo.` };
  }

  if (!checkPassword(String(fd.get("password") ?? ""))) {
    const current = failures.get(ip) ?? { count: 0, since: now };
    failures.set(ip, { count: current.count + 1, since: current.since });
    await new Promise((r) => setTimeout(r, 800));
    return { error: "Contraseña incorrecta" };
  }

  failures.delete(ip);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect(safeNextPath(fd.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
