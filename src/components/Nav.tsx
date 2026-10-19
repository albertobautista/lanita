"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  ["/", "Resumen"],
  ["/cards", "Tarjetas"],
  ["/installments", "Meses sin intereses"],
  ["/transactions", "Ingresos y gastos"],
  ["/subscriptions", "Suscripciones"],
  ["/accounts", "Cuentas"],
  ["/budgets", "Presupuestos"],
  ["/goals", "Metas"],
  ["/simulator", "Simulador"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Secciones">
      {SECTIONS.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
