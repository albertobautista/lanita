import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, isAuthEnabled, safeNextPath, SESSION_DAYS, verifySessionToken } from "./session";

const env = { password: "lana-segura", secret: "un-secreto-largo" };
const now = Date.UTC(2026, 9, 20);

describe("login", () => {
  it("is off without a password", () => {
    expect(isAuthEnabled({ password: "", secret: "x" })).toBe(false);
    expect(isAuthEnabled(env)).toBe(true);
  });

  it("checks the password", () => {
    expect(checkPassword("lana-segura", env)).toBe(true);
    expect(checkPassword("lana-segur", env)).toBe(false);
    expect(checkPassword("", { password: "" })).toBe(false);
  });

  it("accepts its own session until it expires", () => {
    const token = createSessionToken(now, env);
    expect(verifySessionToken(token, now, env)).toBe(true);
    expect(verifySessionToken(token, now + SESSION_DAYS * 86_400_000 + 1, env)).toBe(false);
  });

  it("rejects forged or tampered sessions", () => {
    const [, signature] = createSessionToken(now, env).split(".");
    expect(verifySessionToken(`${now + 10 ** 12}.${signature}`, now, env)).toBe(false);
    expect(verifySessionToken("9999999999999.abc", now, env)).toBe(false);
    expect(verifySessionToken(undefined, now, env)).toBe(false);
  });

  it("signs everyone out when the password or secret changes", () => {
    const token = createSessionToken(now, env);
    expect(verifySessionToken(token, now, { ...env, password: "otra" })).toBe(false);
    expect(verifySessionToken(token, now, { ...env, secret: "otro" })).toBe(false);
  });

  it("only redirects within the app after login", () => {
    expect(safeNextPath("/cards?x=1")).toBe("/cards?x=1");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
