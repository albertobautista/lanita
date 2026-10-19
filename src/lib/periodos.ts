// Utilidades de fechas. Periodo = "YYYY-MM", fecha = "YYYY-MM-DD". Sin zonas horarias: todo es fecha local.

export const pad = (n: number) => String(n).padStart(2, "0");

export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const periodoDe = (fecha: string) => fecha.slice(0, 7);
export const diaDe = (fecha: string) => Number(fecha.slice(8, 10));

export function sumarMeses(periodo: string, n: number) {
  const [y, m] = periodo.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function mesesEntre(desde: string, hasta: string) {
  const [y1, m1] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function diasDelMes(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** La fecha del día `dia` en `periodo`, ajustada si el mes es más corto (31 → 30 o 28). */
export function fechaEnPeriodo(periodo: string, dia: number) {
  return `${periodo}-${pad(Math.min(dia, diasDelMes(periodo)))}`;
}

export function diasEntre(desde: string, hasta: string) {
  const a = new Date(`${desde}T12:00:00`);
  const b = new Date(`${hasta}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function rangoPeriodos(desde: string, n: number) {
  return Array.from({ length: n }, (_, i) => sumarMeses(desde, i));
}

export function esPeriodo(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
