// Date helpers. Period = "YYYY-MM", date = "YYYY-MM-DD". No time zones: everything is a local date.

export const pad = (n: number) => String(n).padStart(2, "0");

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const periodOf = (date: string) => date.slice(0, 7);
export const dayOf = (date: string) => Number(date.slice(8, 10));

export function addMonths(period: string, n: number) {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function monthsBetween(from: string, to: string) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function daysInMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** The date of `day` in `period`, clamped when the month is shorter (31 → 30 or 28). */
export function dateInPeriod(period: string, day: number) {
  return `${period}-${pad(Math.min(day, daysInMonth(period)))}`;
}

export function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function periodRange(from: string, n: number) {
  return Array.from({ length: n }, (_, i) => addMonths(from, i));
}

export function isPeriod(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
