const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const mxn0 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** Centavos → "$1,234.50". */
export const dinero = (centavos: number) => mxn.format((centavos || 0) / 100);
export const dinero0 = (centavos: number) => mxn0.format((centavos || 0) / 100);
export const dineroCorto = (centavos: number) => {
  const v = centavos / 100;
  return Math.abs(v) >= 1000 ? `$${(v / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${Math.round(v)}`;
};

/** "1,234.50" o "$1234" → centavos. Devuelve NaN si no es un número. */
export function aCentavos(texto: string | number | null | undefined) {
  if (typeof texto === "number") return Math.round(texto * 100);
  const limpio = String(texto ?? "").replace(/[$\s,]/g, "");
  if (!limpio) return NaN;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Centavos → "1234.50" para inputs. */
export const aPesos = (centavos: number | null | undefined) => (centavos == null ? "" : (centavos / 100).toFixed(2));

export function nombreMes(periodo: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", opts);
}
export const mesCorto = (periodo: string) => nombreMes(periodo, { month: "short" }).replace(".", "");

export function fechaLarga(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}
export function fechaCorta(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
}

export const pct = (x: number) => `${Math.round(x * 100)} %`;
