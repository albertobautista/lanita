"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Section = { href: string; label: string; short?: string; icon?: ReactNode };

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** What gets used every day: always in reach (bottom bar on phones). */
const PRIMARY: Section[] = [
  { href: "/", label: "Resumen", icon: icon("M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z") },
  { href: "/cards", label: "Tarjetas", icon: icon("M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4") },
  { href: "/installments", label: "Meses sin intereses", short: "Meses", icon: icon("M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2") },
  { href: "/transactions", label: "Ingresos y gastos", short: "Movimientos", icon: icon("M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3") },
];

/** Monthly or occasional: behind "Más" on phones. */
const SECONDARY: Section[] = [
  { href: "/calendar", label: "Calendario" },
  { href: "/subscriptions", label: "Suscripciones" },
  { href: "/accounts", label: "Cuentas" },
  { href: "/budgets", label: "Presupuestos" },
  { href: "/goals", label: "Metas" },
  { href: "/simulator", label: "Simulador" },
];

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Nav() {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [path]);
  if (path === "/login") return null;
  const current = (href: string) => (isActive(href, path) ? "page" : undefined);
  const inSecondary = SECONDARY.some((s) => isActive(s.href, path));

  return (
    <>
      <nav className="tabs" aria-label="Secciones">
        {PRIMARY.map((s) => (
          <Link key={s.href} href={s.href} aria-current={current(s.href)}>
            {s.label}
          </Link>
        ))}
        <span className="tabs-sep" aria-hidden="true" />
        {SECONDARY.map((s) => (
          <Link key={s.href} href={s.href} aria-current={current(s.href)} className="secondary">
            {s.label}
          </Link>
        ))}
      </nav>

      <nav className="bottombar" aria-label="Secciones">
        {PRIMARY.map((s) => (
          <Link key={s.href} href={s.href} aria-current={current(s.href)}>
            {s.icon}
            <span>{s.short ?? s.label}</span>
          </Link>
        ))}
        <button type="button" aria-expanded={moreOpen} aria-current={inSecondary ? "page" : undefined} onClick={() => setMoreOpen((o) => !o)}>
          {icon("M5 12h.01M12 12h.01M19 12h.01")}
          <span>Más</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="moresheet" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {SECONDARY.map((s) => (
              <Link key={s.href} href={s.href} aria-current={current(s.href)}>
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
