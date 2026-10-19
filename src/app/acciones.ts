"use server";

import { and, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { COLORES } from "@/lib/catalogos";
import { cargarFinanzas } from "@/lib/datos";
import { fechaCorte } from "@/lib/finanzas";
import { aCentavos } from "@/lib/formato";
import { esPeriodo, hoyISO, periodoDe, sumarMeses } from "@/lib/periodos";

export type Resultado = { ok: boolean; mensaje?: string; error?: string };

// ---------- validación ----------

const texto = z.string().trim();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const periodo = z.string().refine(esPeriodo, "Mes inválido");
const dinero = (msg = "Escribe un monto válido") => z.preprocess((v) => aCentavos(v as string), z.number({ error: msg }).int().refine((n) => !Number.isNaN(n), msg));
const positivo = (msg?: string) => dinero(msg).refine((n) => n > 0, "El monto debe ser mayor a cero");
const opcional = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().nullable());
const dia = z.coerce.number().int().min(1, "Día entre 1 y 31").max(31, "Día entre 1 y 31");
const casilla = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

function leer<T extends z.ZodType>(esquema: T, fd: FormData): { datos: z.infer<T> } | { error: string } {
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (r.success) return { datos: r.data };
  return { error: r.error.issues[0]?.message ?? "Revisa los datos" };
}

/** "cuenta:<id>" | "tarjeta:<id>" → columnas. */
function metodo(valor: string | null | undefined) {
  const [tipo, id] = String(valor ?? "").split(":");
  return { cuentaId: tipo === "cuenta" ? id : null, tarjetaId: tipo === "tarjeta" ? id : null };
}

function listo(mensaje: string): Resultado {
  revalidatePath("/", "layout");
  return { ok: true, mensaje };
}

async function intentar(fn: () => Promise<Resultado>): Promise<Resultado> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

// ---------- tarjetas ----------

const esquemaTarjeta = z.object({
  id: opcional,
  nombre: texto.min(1, "Ponle nombre a la tarjeta"),
  banco: texto.default(""),
  ultimos4: texto.regex(/^(\d{4})?$/, "Los últimos 4 dígitos deben ser 4 números").default(""),
  limite: positivo("Escribe el límite de crédito"),
  corte: dia,
  pago: dia,
  color: texto.default(COLORES[0]),
  minPctSaldo: z.coerce.number().min(0).max(100).default(1.5),
  minPctLimite: z.coerce.number().min(0).max(100).default(1.25),
  tasaAnual: z.coerce.number().min(0).max(300).default(0),
});

export async function guardarTarjeta(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaTarjeta, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, minPctSaldo, minPctLimite, tasaAnual, ...v } = r.datos;
  const valores = { ...v, minPctSaldo: Math.round(minPctSaldo * 100), minPctLimite: Math.round(minPctLimite * 100), tasaAnual: Math.round(tasaAnual * 100) };
  return intentar(async () => {
    if (id) await db.update(schema.tarjetas).set(valores).where(eq(schema.tarjetas.id, id));
    else await db.insert(schema.tarjetas).values(valores);
    return listo(id ? "Tarjeta actualizada" : "Tarjeta agregada");
  });
}

export async function borrarTarjeta(id: string): Promise<Resultado> {
  const [uso] = await db
    .select({ n: sql<number>`(select count(*) from compras where tarjeta_id = ${id}) + (select count(*) from movimientos where tarjeta_id = ${id}) + (select count(*) from pagos_tarjeta where tarjeta_id = ${id}) + (select count(*) from recurrentes where tarjeta_id = ${id})` })
    .from(sql`(select 1)`);
  if (uso.n > 0) return { ok: false, error: "Esta tarjeta tiene compras, pagos o cargos registrados. Bórralos primero." };
  await db.delete(schema.tarjetas).where(eq(schema.tarjetas.id, id));
  return listo("Tarjeta borrada");
}

// ---------- cuentas ----------

const esquemaCuenta = z.object({
  id: opcional,
  nombre: texto.min(1, "Ponle nombre a la cuenta"),
  tipo: z.enum(["debito", "efectivo", "ahorro"]),
  saldoInicial: dinero(),
  color: texto.default(COLORES[2]),
});

export async function guardarCuenta(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaCuenta, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, ...v } = r.datos;
  return intentar(async () => {
    if (id) await db.update(schema.cuentas).set(v).where(eq(schema.cuentas.id, id));
    else await db.insert(schema.cuentas).values(v);
    return listo(id ? "Cuenta actualizada" : "Cuenta agregada");
  });
}

export async function borrarCuenta(id: string): Promise<Resultado> {
  const [uso] = await db
    .select({ n: sql<number>`(select count(*) from movimientos where cuenta_id = ${id}) + (select count(*) from pagos_tarjeta where cuenta_id = ${id}) + (select count(*) from transferencias where origen_id = ${id} or destino_id = ${id}) + (select count(*) from aportaciones where cuenta_id = ${id})` })
    .from(sql`(select 1)`);
  if (uso.n > 0) return { ok: false, error: "Esta cuenta tiene movimientos. Bórralos primero o déjala sin usar." };
  await db.delete(schema.cuentas).where(eq(schema.cuentas.id, id));
  return listo("Cuenta borrada");
}

const esquemaTransferencia = z.object({
  origenId: texto.min(1, "Elige la cuenta de origen"),
  destinoId: texto.min(1, "Elige la cuenta de destino"),
  monto: positivo(),
  fecha,
  descripcion: texto.default(""),
});

export async function guardarTransferencia(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaTransferencia, fd);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.datos.origenId === r.datos.destinoId) return { ok: false, error: "El origen y el destino deben ser distintos" };
  return intentar(async () => {
    await db.insert(schema.transferencias).values(r.datos);
    return listo("Transferencia registrada");
  });
}

export async function borrarTransferencia(id: string): Promise<Resultado> {
  await db.delete(schema.transferencias).where(eq(schema.transferencias.id, id));
  return listo("Transferencia borrada");
}

// ---------- compras a meses ----------

const esquemaCompra = z.object({
  id: opcional,
  tarjetaId: texto.min(1, "Elige la tarjeta"),
  descripcion: texto.min(1, "¿Qué compraste?"),
  categoria: texto.default("Otros"),
  monto: positivo(),
  meses: z.coerce.number().int().min(2, "Al menos 2 meses").max(60),
  fecha,
  tasaAnual: z.coerce.number().min(0).max(300).default(0),
  conIva: casilla,
});

export async function guardarCompra(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaCompra, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, tasaAnual, ...v } = r.datos;
  const valores = { ...v, tasaAnual: Math.round(tasaAnual * 100) };
  return intentar(async () => {
    if (id) await db.update(schema.compras).set(valores).where(eq(schema.compras.id, id));
    else await db.insert(schema.compras).values(valores);
    return listo(id ? "Compra actualizada" : "Compra a meses agregada");
  });
}

export async function borrarCompra(id: string): Promise<Resultado> {
  await db.delete(schema.compras).where(eq(schema.compras.id, id));
  return listo("Compra borrada");
}

export async function liquidarCompra(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(z.object({ id: texto.min(1), periodo }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  await db.update(schema.compras).set({ liquidadaPeriodo: r.datos.periodo }).where(eq(schema.compras.id, r.datos.id));
  return listo("Compra liquidada: el saldo restante se suma a ese estado de cuenta");
}

export async function deshacerLiquidacion(id: string): Promise<Resultado> {
  await db.update(schema.compras).set({ liquidadaPeriodo: null }).where(eq(schema.compras.id, id));
  return listo("Liquidación deshecha");
}

// ---------- movimientos ----------

const esquemaMovimiento = z.object({
  id: opcional,
  tipo: z.enum(["ingreso", "gasto"]),
  descripcion: texto.default(""),
  monto: positivo(),
  fecha,
  categoria: texto.min(1),
  metodo: texto.min(1, "Elige cómo pagaste o a qué cuenta entró"),
});

export async function guardarMovimiento(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaMovimiento, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, metodo: m, ...v } = r.datos;
  const destino = metodo(m);
  if (v.tipo === "ingreso" && destino.tarjetaId) return { ok: false, error: "Un ingreso debe entrar a una cuenta" };
  return intentar(async () => {
    if (id) await db.update(schema.movimientos).set({ ...v, ...destino }).where(eq(schema.movimientos.id, id));
    else await db.insert(schema.movimientos).values({ ...v, ...destino });
    return listo(v.tipo === "ingreso" ? "Ingreso guardado" : "Gasto guardado");
  });
}

export async function borrarMovimiento(id: string): Promise<Resultado> {
  await db.delete(schema.movimientos).where(eq(schema.movimientos.id, id));
  return listo("Movimiento borrado");
}

const esquemaFilas = z.array(
  z.object({
    tipo: z.enum(["ingreso", "gasto"]),
    fecha,
    monto: z.number().int().positive(),
    categoria: z.string().min(1),
    descripcion: z.string().default(""),
    metodo: z.string().min(1),
  }),
);

/** Guarda movimientos que vienen de importar un estado de cuenta o de la captura rápida. */
export async function guardarVarios(filas: unknown, origen: "importado" | "chat"): Promise<Resultado> {
  const r = esquemaFilas.safeParse(filas);
  if (!r.success) return { ok: false, error: "Hay filas con datos incompletos" };
  if (!r.data.length) return { ok: false, error: "No hay movimientos seleccionados" };
  return intentar(async () => {
    await db.insert(schema.movimientos).values(r.data.map(({ metodo: m, ...f }) => ({ ...f, ...metodo(m), origen })));
    return listo(`${r.data.length} movimiento${r.data.length === 1 ? "" : "s"} guardado${r.data.length === 1 ? "" : "s"}`);
  });
}

// ---------- pagos y estados de cuenta ----------

const esquemaPago = z.object({
  tarjetaId: texto.min(1),
  periodo,
  monto: positivo(),
  fecha,
  cuentaId: opcional,
});

export async function registrarPago(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaPago, fd);
  if ("error" in r) return { ok: false, error: r.error };
  return intentar(async () => {
    await db.insert(schema.pagosTarjeta).values(r.datos);
    return listo("Pago registrado");
  });
}

export async function borrarPago(id: string): Promise<Resultado> {
  await db.delete(schema.pagosTarjeta).where(eq(schema.pagosTarjeta.id, id));
  return listo("Pago borrado");
}

const esquemaEstadoReal = z.object({
  tarjetaId: texto.min(1),
  periodo,
  pagoNoIntereses: dinero("Escribe el pago para no generar intereses").refine((n) => n >= 0, "No puede ser negativo"),
  pagoMinimo: z.preprocess((v) => (v === "" || v == null ? null : aCentavos(v as string)), z.number().int().nonnegative("No puede ser negativo").nullable()),
  notas: texto.default(""),
});

export async function guardarEstadoReal(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaEstadoReal, fd);
  if ("error" in r) return { ok: false, error: r.error };
  if (r.datos.pagoMinimo != null && Number.isNaN(r.datos.pagoMinimo)) return { ok: false, error: "Escribe un pago mínimo válido" };
  return intentar(async () => {
    await db
      .insert(schema.estadosCuenta)
      .values(r.datos)
      .onConflictDoUpdate({
        target: [schema.estadosCuenta.tarjetaId, schema.estadosCuenta.periodo],
        set: { pagoNoIntereses: r.datos.pagoNoIntereses, pagoMinimo: r.datos.pagoMinimo, notas: r.datos.notas },
      });
    return listo("Estado de cuenta guardado: ahora se usan las cifras del banco");
  });
}

export async function borrarEstadoReal(tarjetaId: string, per: string): Promise<Resultado> {
  await db.delete(schema.estadosCuenta).where(and(eq(schema.estadosCuenta.tarjetaId, tarjetaId), eq(schema.estadosCuenta.periodo, per)));
  return listo("Se volvió a usar el cálculo de la app");
}

/** Registra la diferencia contra el banco como un gasto "Sin identificar" dentro de ese corte. */
export async function registrarDiferencia(tarjetaId: string, per: string): Promise<Resultado> {
  const f = await cargarFinanzas();
  const t = f.tarjeta(tarjetaId);
  if (!t) return { ok: false, error: "No encontré la tarjeta" };
  const ec = f.estadoCuenta(t, per);
  if (ec.diferencia <= 0) return { ok: false, error: "No hay gastos faltantes que registrar en este corte" };
  await db.insert(schema.movimientos).values({
    tipo: "gasto",
    fecha: fechaCorte(t, per),
    monto: ec.diferencia,
    categoria: "Sin identificar",
    descripcion: "Diferencia con el estado de cuenta",
    tarjetaId,
  });
  return listo("Diferencia registrada como gasto sin identificar. Puedes editarlo cuando recuerdes qué fue.");
}

// ---------- cargos fijos y suscripciones ----------

const esquemaRecurrente = z.object({
  id: opcional,
  tipo: z.enum(["ingreso", "gasto"]),
  esSuscripcion: casilla,
  descripcion: texto.min(1, "Ponle nombre"),
  categoria: texto.min(1),
  frecuencia: z.enum(["mensual", "anual"]).default("mensual"),
  dia,
  mesAnual: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(12).nullable()),
  metodo: texto.min(1, "Elige con qué se paga o a qué cuenta entra"),
  desde: periodo,
  monto: positivo(),
});

export async function guardarRecurrente(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaRecurrente, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, monto, metodo: m, ...v } = r.datos;
  const destino = metodo(m);
  if (v.tipo === "ingreso" && destino.tarjetaId) return { ok: false, error: "Un ingreso debe entrar a una cuenta" };
  const valores = { ...v, ...destino, mesAnual: v.frecuencia === "anual" ? (v.mesAnual ?? Number(v.desde.slice(5))) : null };
  return intentar(async () => {
    if (id) {
      // Editar no cambia el precio: para eso está "Cambiar precio", que guarda el historial.
      await db.update(schema.recurrentes).set(valores).where(eq(schema.recurrentes.id, id));
      await db.update(schema.movimientos).set({ categoria: v.categoria, descripcion: v.descripcion, ...destino }).where(eq(schema.movimientos.recurrenteId, id));
      return listo("Cambios guardados");
    }
    const [nuevo] = await db.insert(schema.recurrentes).values(valores).returning({ id: schema.recurrentes.id });
    await db.insert(schema.recurrentePrecios).values({ recurrenteId: nuevo.id, desde: v.desde, monto });
    return listo(v.esSuscripcion ? "Suscripción agregada" : "Cargo fijo agregado");
  });
}

export async function cambiarPrecio(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(z.object({ id: texto.min(1), desde: periodo, monto: positivo() }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, desde, monto } = r.datos;
  return intentar(async () => {
    await db
      .insert(schema.recurrentePrecios)
      .values({ recurrenteId: id, desde, monto })
      .onConflictDoUpdate({ target: [schema.recurrentePrecios.recurrenteId, schema.recurrentePrecios.desde], set: { monto } });
    // Los cargos ya registrados desde ese mes toman el precio nuevo (hasta el siguiente cambio).
    const siguientes = await db.select().from(schema.recurrentePrecios).where(and(eq(schema.recurrentePrecios.recurrenteId, id), gt(schema.recurrentePrecios.desde, desde)));
    const tope = siguientes.map((p) => p.desde).sort()[0];
    const movs = await db.select().from(schema.movimientos).where(and(eq(schema.movimientos.recurrenteId, id), gte(schema.movimientos.periodo, desde)));
    const ids = movs.filter((m) => !tope || (m.periodo ?? "") < tope).map((m) => m.id);
    if (ids.length) await db.update(schema.movimientos).set({ monto }).where(inArray(schema.movimientos.id, ids));
    return listo("Precio actualizado");
  });
}

export async function cancelarRecurrente(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(z.object({ id: texto.min(1), hasta: periodo }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, hasta } = r.datos;
  return intentar(async () => {
    await db.update(schema.recurrentes).set({ hasta, canceladaEn: hoyISO() }).where(eq(schema.recurrentes.id, id));
    await db.delete(schema.movimientos).where(and(eq(schema.movimientos.recurrenteId, id), gt(schema.movimientos.periodo, hasta)));
    return listo("Cancelada. Ya no se contará después de ese mes.");
  });
}

export async function reactivarRecurrente(id: string): Promise<Resultado> {
  const [r] = await db.select().from(schema.recurrentes).where(eq(schema.recurrentes.id, id));
  if (!r) return { ok: false, error: "No encontré el cargo" };
  // Si ya pasó tiempo desde la cancelación, se reanuda este mes para no generar cargos atrasados.
  const actual = periodoDe(hoyISO());
  const reanudar = r.hasta && sumarMeses(r.hasta, 1) < actual;
  await db.update(schema.recurrentes).set({ hasta: null, canceladaEn: null, desde: reanudar ? actual : r.desde }).where(eq(schema.recurrentes.id, id));
  if (reanudar) {
    const precio = await db.select().from(schema.recurrentePrecios).where(eq(schema.recurrentePrecios.recurrenteId, id));
    const ultimo = precio.sort((a, b) => b.desde.localeCompare(a.desde))[0];
    if (ultimo && ultimo.desde < actual) await db.insert(schema.recurrentePrecios).values({ recurrenteId: id, desde: actual, monto: ultimo.monto }).onConflictDoNothing();
  }
  return listo("Reactivada");
}

export async function borrarRecurrente(id: string, conHistorial: boolean): Promise<Resultado> {
  if (conHistorial) await db.delete(schema.movimientos).where(eq(schema.movimientos.recurrenteId, id));
  else await db.update(schema.movimientos).set({ recurrenteId: null }).where(eq(schema.movimientos.recurrenteId, id));
  await db.delete(schema.recurrentePrecios).where(eq(schema.recurrentePrecios.recurrenteId, id));
  await db.delete(schema.recurrentes).where(eq(schema.recurrentes.id, id));
  return listo("Borrado");
}

// ---------- presupuestos y metas ----------

export async function guardarPresupuesto(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(z.object({ categoria: texto.min(1), monto: positivo() }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  return intentar(async () => {
    await db.insert(schema.presupuestos).values(r.datos).onConflictDoUpdate({ target: schema.presupuestos.categoria, set: { monto: r.datos.monto } });
    return listo("Presupuesto guardado");
  });
}

export async function borrarPresupuesto(id: string): Promise<Resultado> {
  await db.delete(schema.presupuestos).where(eq(schema.presupuestos.id, id));
  return listo("Presupuesto borrado");
}

const esquemaMeta = z.object({
  id: opcional,
  nombre: texto.min(1, "Ponle nombre a la meta"),
  objetivo: positivo("¿Cuánto quieres juntar?"),
  fechaObjetivo: opcional,
  color: texto.default(COLORES[6]),
});

export async function guardarMeta(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(esquemaMeta, fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { id, ...v } = r.datos;
  return intentar(async () => {
    if (id) await db.update(schema.metas).set(v).where(eq(schema.metas.id, id));
    else await db.insert(schema.metas).values(v);
    return listo(id ? "Meta actualizada" : "Meta creada");
  });
}

export async function borrarMeta(id: string): Promise<Resultado> {
  await db.delete(schema.aportaciones).where(eq(schema.aportaciones.metaId, id));
  await db.delete(schema.metas).where(eq(schema.metas.id, id));
  return listo("Meta borrada");
}

export async function aportarMeta(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const r = leer(z.object({ metaId: texto.min(1), monto: positivo(), fecha, cuentaId: opcional, sentido: z.enum(["aportar", "retirar"]) }), fd);
  if ("error" in r) return { ok: false, error: r.error };
  const { sentido, monto, ...v } = r.datos;
  return intentar(async () => {
    await db.insert(schema.aportaciones).values({ ...v, monto: sentido === "retirar" ? -monto : monto });
    return listo(sentido === "retirar" ? "Retiro registrado" : "Aportación registrada");
  });
}

export async function borrarAportacion(id: string): Promise<Resultado> {
  await db.delete(schema.aportaciones).where(eq(schema.aportaciones.id, id));
  return listo("Movimiento de la meta borrado");
}
