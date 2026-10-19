import "server-only";
import { db, schema } from "@/db";
import { Finanzas, ocurrenciasPendientes, type Datos } from "./finanzas";
import { hoyISO } from "./periodos";

async function leerTodo(): Promise<Datos> {
  const [cuentas, tarjetas, compras, recurrentes, precios, movimientos, pagos, estadosReales, transferencias, presupuestos, metas, aportaciones] =
    await Promise.all([
      db.select().from(schema.cuentas).orderBy(schema.cuentas.creadoEn),
      db.select().from(schema.tarjetas).orderBy(schema.tarjetas.creadoEn),
      db.select().from(schema.compras),
      db.select().from(schema.recurrentes).orderBy(schema.recurrentes.descripcion),
      db.select().from(schema.recurrentePrecios),
      db.select().from(schema.movimientos),
      db.select().from(schema.pagosTarjeta),
      db.select().from(schema.estadosCuenta),
      db.select().from(schema.transferencias),
      db.select().from(schema.presupuestos).orderBy(schema.presupuestos.categoria),
      db.select().from(schema.metas).orderBy(schema.metas.creadoEn),
      db.select().from(schema.aportaciones),
    ]);
  return { cuentas, tarjetas, compras, recurrentes, precios, movimientos, pagos, estadosReales, transferencias, presupuestos, metas, aportaciones };
}

/** Registra los cargos fijos que ya tocaban (sueldo, suscripciones...) como movimientos reales. */
async function sincronizarRecurrentes(d: Datos, hoy: string) {
  const pend = ocurrenciasPendientes(d, hoy);
  if (!pend.length) return false;
  await db
    .insert(schema.movimientos)
    .values(
      pend.map((p) => ({
        tipo: p.recurrente.tipo,
        fecha: p.fecha,
        monto: p.monto,
        categoria: p.recurrente.categoria,
        descripcion: p.recurrente.descripcion,
        cuentaId: p.recurrente.cuentaId,
        tarjetaId: p.recurrente.tarjetaId,
        recurrenteId: p.recurrente.id,
        periodo: p.periodo,
        origen: "recurrente" as const,
        ejemplo: p.recurrente.ejemplo,
      })),
    )
    .onConflictDoNothing();
  return true;
}

export async function cargarFinanzas(hoy = hoyISO()) {
  let d = await leerTodo();
  if (await sincronizarRecurrentes(d, hoy)) d = await leerTodo();
  return new Finanzas(d, hoy);
}
