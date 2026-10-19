"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { COLORES } from "@/lib/catalogos";
import { fechaEnPeriodo, hoyISO, periodoDe, sumarMeses } from "@/lib/periodos";
import type { Resultado } from "./acciones";

const $ = (pesos: number) => Math.round(pesos * 100);

export async function cargarEjemplo(): Promise<Resultado> {
  const hoy = hoyISO();
  const actual = periodoDe(hoy);
  const f = (meses: number, dia: number) => fechaEnPeriodo(sumarMeses(actual, meses), dia);
  const ej = { ejemplo: true };

  const [nomina, efectivo, ahorro] = await db
    .insert(schema.cuentas)
    .values([
      { nombre: "Nómina", tipo: "debito", saldoInicial: $(8_500), color: COLORES[2], ...ej },
      { nombre: "Cartera", tipo: "efectivo", saldoInicial: $(1_200), color: COLORES[4], ...ej },
      { nombre: "Ahorro", tipo: "ahorro", saldoInicial: $(15_000), color: COLORES[6], ...ej },
    ])
    .returning();
  const [oro, clasica] = await db
    .insert(schema.tarjetas)
    .values([
      { nombre: "Oro", banco: "Banco Azul", ultimos4: "4821", limite: $(45_000), corte: 5, pago: 25, color: COLORES[0], tasaAnual: 4500, ...ej },
      { nombre: "Clásica", banco: "Banco Rojo", ultimos4: "1307", limite: $(28_000), corte: 20, pago: 10, color: COLORES[1], tasaAnual: 6200, ...ej },
    ])
    .returning();

  await db.insert(schema.compras).values([
    { tarjetaId: oro.id, descripcion: "Refrigerador", categoria: "Casa", monto: $(14_400), meses: 12, fecha: f(-4, 12), ...ej },
    { tarjetaId: clasica.id, descripcion: "Laptop", categoria: "Electrónica", monto: $(21_600), meses: 18, fecha: f(-2, 22), ...ej },
    { tarjetaId: oro.id, descripcion: "Vuelos a Cancún", categoria: "Viajes", monto: $(7_800), meses: 6, fecha: f(-1, 3), ...ej },
    { tarjetaId: clasica.id, descripcion: "Celular", categoria: "Electrónica", monto: $(9_000), meses: 9, fecha: f(-9, 15), ...ej },
    { tarjetaId: oro.id, descripcion: "Colchón (con intereses)", categoria: "Casa", monto: $(8_000), meses: 12, fecha: f(-3, 2), tasaAnual: 3200, conIva: true, ...ej },
  ]);

  const inicio = sumarMeses(actual, -5);
  const recurrentes = [
    { tipo: "ingreso" as const, descripcion: "Quincena", categoria: "Sueldo", dia: 15, cuentaId: nomina.id, monto: $(14_500) },
    { tipo: "ingreso" as const, descripcion: "Quincena", categoria: "Sueldo", dia: 30, cuentaId: nomina.id, monto: $(14_500) },
    { tipo: "gasto" as const, descripcion: "Renta", categoria: "Casa", dia: 1, cuentaId: nomina.id, monto: $(9_500) },
    { tipo: "gasto" as const, descripcion: "Internet", categoria: "Servicios", dia: 8, cuentaId: nomina.id, monto: $(599) },
    { tipo: "gasto" as const, descripcion: "Netflix", categoria: "Suscripciones", dia: 12, tarjetaId: oro.id, monto: $(249), esSuscripcion: true, subeA: $(299) },
    { tipo: "gasto" as const, descripcion: "Spotify", categoria: "Suscripciones", dia: 3, tarjetaId: clasica.id, monto: $(129), esSuscripcion: true },
    { tipo: "gasto" as const, descripcion: "Gimnasio", categoria: "Salud", dia: 1, tarjetaId: oro.id, monto: $(650), esSuscripcion: true, cancelar: true },
    { tipo: "gasto" as const, descripcion: "Amazon Prime", categoria: "Suscripciones", dia: 20, tarjetaId: clasica.id, monto: $(899), esSuscripcion: true, anual: true },
  ];
  for (const r of recurrentes) {
    const [nuevo] = await db
      .insert(schema.recurrentes)
      .values({
        tipo: r.tipo, descripcion: r.descripcion, categoria: r.categoria, dia: r.dia, desde: inicio,
        cuentaId: "cuentaId" in r ? r.cuentaId : null, tarjetaId: "tarjetaId" in r ? r.tarjetaId : null,
        esSuscripcion: "esSuscripcion" in r, frecuencia: "anual" in r ? "anual" : "mensual", mesAnual: "anual" in r ? Number(sumarMeses(actual, -2).slice(5)) : null,
        hasta: "cancelar" in r ? sumarMeses(actual, -1) : null, canceladaEn: "cancelar" in r ? f(-1, 20) : null, ...ej,
      })
      .returning();
    await db.insert(schema.recurrentePrecios).values({ recurrenteId: nuevo.id, desde: inicio, monto: r.monto });
    if ("subeA" in r && r.subeA) await db.insert(schema.recurrentePrecios).values({ recurrenteId: nuevo.id, desde: sumarMeses(actual, -1), monto: r.subeA });
  }

  const movs: (typeof schema.movimientos.$inferInsert)[] = [];
  for (let k = -5; k <= 0; k++) {
    const v = ((k * 37) % 5 + 5) % 5;
    movs.push(
      { tipo: "gasto", descripcion: "Súper", monto: $(3_200 + v * 180), fecha: f(k, 9), categoria: "Súper", tarjetaId: oro.id, ...ej },
      { tipo: "gasto", descripcion: "Gasolina", monto: $(1_800), fecha: f(k, 18), categoria: "Transporte", tarjetaId: clasica.id, ...ej },
      { tipo: "gasto", descripcion: "Comidas fuera", monto: $(2_100 + v * 250), fecha: f(k, 21), categoria: "Comida", cuentaId: efectivo.id, ...ej },
      { tipo: "gasto", descripcion: "Luz", monto: $(420), fecha: f(k, 6), categoria: "Servicios", cuentaId: nomina.id, ...ej },
    );
  }
  await db.insert(schema.movimientos).values(movs.filter((m) => m.fecha <= hoy));

  // Pagos de meses anteriores: completos en la Oro, y en la Clásica un mes solo el mínimo.
  const pagos: (typeof schema.pagosTarjeta.$inferInsert)[] = [];
  for (let k = -4; k <= -1; k++) {
    pagos.push({ tarjetaId: oro.id, periodo: sumarMeses(actual, k), monto: 0, fecha: f(k, 22), cuentaId: nomina.id, ...ej });
    pagos.push({ tarjetaId: clasica.id, periodo: sumarMeses(actual, k), monto: 0, fecha: f(k, 8), cuentaId: nomina.id, ...ej });
  }
  // Los montos se calculan después con la app para que cuadren con cada estado de cuenta.
  const { cargarFinanzas } = await import("@/lib/datos");
  let fin = await cargarFinanzas(hoy);
  for (const p of pagos) {
    const t = p.tarjetaId === oro.id ? oro : clasica;
    const ec = fin.estadoCuenta(t, p.periodo);
    const monto = t.id === clasica.id && p.periodo === sumarMeses(actual, -2) ? ec.pagoMinimo : ec.pagoNoIntereses;
    if (monto > 0) {
      await db.insert(schema.pagosTarjeta).values({ ...p, monto });
      fin = await cargarFinanzas(hoy);
    }
  }
  // El banco cobró $386 más de lo capturado en el último corte de la Oro.
  const ultimo = fin.estadoCuenta(oro, actual);
  await db.insert(schema.estadosCuenta).values({ tarjetaId: oro.id, periodo: actual, pagoNoIntereses: ultimo.calculado + $(386), pagoMinimo: null, notas: "Ejemplo", ...ej });

  await db.insert(schema.presupuestos).values([
    { categoria: "Súper", monto: $(3_800), ...ej },
    { categoria: "Comida", monto: $(2_500), ...ej },
    { categoria: "Transporte", monto: $(2_000), ...ej },
    { categoria: "Suscripciones", monto: $(1_000), ...ej },
  ]);

  const [fondo, viaje] = await db
    .insert(schema.metas)
    .values([
      { nombre: "Fondo de emergencia", objetivo: $(60_000), fechaObjetivo: f(10, 28), color: COLORES[6], ...ej },
      { nombre: "Viaje a Japón", objetivo: $(45_000), fechaObjetivo: f(14, 1), color: COLORES[3], ...ej },
    ])
    .returning();
  await db.insert(schema.aportaciones).values([
    { metaId: fondo.id, monto: $(15_000), fecha: f(-5, 1), ...ej },
    { metaId: fondo.id, monto: $(3_000), fecha: f(-1, 16), cuentaId: nomina.id, ...ej },
    { metaId: viaje.id, monto: $(6_500), fecha: f(-2, 16), cuentaId: nomina.id, ...ej },
  ]);
  await db.insert(schema.transferencias).values({ origenId: nomina.id, destinoId: efectivo.id, monto: $(3_000), fecha: f(0, 1), descripcion: "Retiro en cajero", ...ej });

  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Datos de ejemplo cargados" };
}

export async function borrarEjemplos(): Promise<Resultado> {
  // Orden inverso a las dependencias.
  await db.delete(schema.aportaciones).where(eq(schema.aportaciones.ejemplo, true));
  await db.delete(schema.metas).where(eq(schema.metas.ejemplo, true));
  await db.delete(schema.presupuestos).where(eq(schema.presupuestos.ejemplo, true));
  await db.delete(schema.estadosCuenta).where(eq(schema.estadosCuenta.ejemplo, true));
  await db.delete(schema.pagosTarjeta).where(eq(schema.pagosTarjeta.ejemplo, true));
  await db.delete(schema.movimientos).where(eq(schema.movimientos.ejemplo, true));
  await db.delete(schema.transferencias).where(eq(schema.transferencias.ejemplo, true));
  await db.delete(schema.compras).where(eq(schema.compras.ejemplo, true));
  const recs = await db.select({ id: schema.recurrentes.id }).from(schema.recurrentes).where(eq(schema.recurrentes.ejemplo, true));
  if (recs.length) await db.delete(schema.recurrentePrecios).where(inArray(schema.recurrentePrecios.recurrenteId, recs.map((r) => r.id)));
  await db.delete(schema.recurrentes).where(eq(schema.recurrentes.ejemplo, true));
  await db.delete(schema.tarjetas).where(eq(schema.tarjetas.ejemplo, true));
  await db.delete(schema.cuentas).where(eq(schema.cuentas.ejemplo, true));
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Ejemplos borrados" };
}
