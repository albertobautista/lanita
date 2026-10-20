const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const mxn0 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** Cents → "$1,234.50". */
export const money = (cents: number) => mxn.format((cents || 0) / 100);
export const money0 = (cents: number) => mxn0.format((cents || 0) / 100);
export const moneyShort = (cents: number) => {
  const v = cents / 100;
  return Math.abs(v) >= 1000 ? `$${(v / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${Math.round(v)}`;
};

/** "1,234.50" or "$1234" → cents. Returns NaN when it is not a number. */
export function toCents(text: string | number | null | undefined) {
  if (typeof text === "number") return Math.round(text * 100);
  const clean = String(text ?? "").replace(/[$\s,]/g, "");
  if (!clean) return NaN;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Cents → "1234.50" for inputs. */
export const toPesos = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2));

export function monthName(period: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", opts);
}
export const shortMonth = (period: string) => monthName(period, { month: "short" }).replace(".", "");
export const shortMonthYear = (period: string) => monthName(period, { month: "short", year: "numeric" }).replace(".", "");

export function longDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}
export function shortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
}

export const pct = (x: number) => `${Math.round(x * 100)} %`;
