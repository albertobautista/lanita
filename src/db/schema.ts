import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Todos los montos se guardan en centavos (enteros). Los periodos son "YYYY-MM" y las fechas "YYYY-MM-DD".

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const creadoEn = () => text("creado_en").notNull().default(sql`(datetime('now'))`);

export const cuentas = sqliteTable("cuentas", {
  id: id(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo", { enum: ["debito", "efectivo", "ahorro"] }).notNull(),
  saldoInicial: integer("saldo_inicial").notNull().default(0),
  color: text("color").notNull(),
  ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
  creadoEn: creadoEn(),
});

export const tarjetas = sqliteTable("tarjetas", {
  id: id(),
  nombre: text("nombre").notNull(),
  banco: text("banco").notNull().default(""),
  ultimos4: text("ultimos4").notNull().default(""),
  limite: integer("limite").notNull(),
  corte: integer("corte").notNull(),
  pago: integer("pago").notNull(),
  color: text("color").notNull(),
  // Pago mínimo: porcentaje del saldo de contado y del límite, en puntos base (150 = 1.5 %).
  minPctSaldo: integer("min_pct_saldo").notNull().default(150),
  minPctLimite: integer("min_pct_limite").notNull().default(125),
  // Tasa anual ordinaria (puntos base), informativa para estimar intereses si no pagas completo.
  tasaAnual: integer("tasa_anual").notNull().default(0),
  ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
  creadoEn: creadoEn(),
});

// Compras a meses: sin intereses (tasaAnual = 0) o con intereses.
export const compras = sqliteTable(
  "compras",
  {
    id: id(),
    tarjetaId: text("tarjeta_id").notNull().references(() => tarjetas.id),
    descripcion: text("descripcion").notNull(),
    categoria: text("categoria").notNull().default("Otros"),
    monto: integer("monto").notNull(),
    meses: integer("meses").notNull(),
    fecha: text("fecha").notNull(),
    tasaAnual: integer("tasa_anual").notNull().default(0),
    conIva: integer("con_iva", { mode: "boolean" }).notNull().default(true),
    // Si se liquidó antes: el periodo cuyo estado de cuenta incluye el saldo restante.
    liquidadaPeriodo: text("liquidada_periodo"),
    ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
    creadoEn: creadoEn(),
  },
  (t) => [index("compras_tarjeta").on(t.tarjetaId)],
);

// Cargos fijos: suscripciones, servicios e ingresos que se repiten.
export const recurrentes = sqliteTable("recurrentes", {
  id: id(),
  tipo: text("tipo", { enum: ["ingreso", "gasto"] }).notNull(),
  esSuscripcion: integer("es_suscripcion", { mode: "boolean" }).notNull().default(false),
  descripcion: text("descripcion").notNull(),
  categoria: text("categoria").notNull(),
  frecuencia: text("frecuencia", { enum: ["mensual", "anual"] }).notNull().default("mensual"),
  dia: integer("dia").notNull(),
  // Para frecuencia anual: mes del cargo (1-12).
  mesAnual: integer("mes_anual"),
  cuentaId: text("cuenta_id").references(() => cuentas.id),
  tarjetaId: text("tarjeta_id").references(() => tarjetas.id),
  desde: text("desde").notNull(),
  // Último periodo con cargo; null = sigue activo. Al cancelar se fija aquí.
  hasta: text("hasta"),
  canceladaEn: text("cancelada_en"),
  ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
  creadoEn: creadoEn(),
});

// Historial de precio de cada cargo fijo: el monto vigente es el último con desde <= periodo.
export const recurrentePrecios = sqliteTable(
  "recurrente_precios",
  {
    id: id(),
    recurrenteId: text("recurrente_id").notNull().references(() => recurrentes.id, { onDelete: "cascade" }),
    desde: text("desde").notNull(),
    monto: integer("monto").notNull(),
  },
  (t) => [uniqueIndex("precio_por_periodo").on(t.recurrenteId, t.desde)],
);

export const movimientos = sqliteTable(
  "movimientos",
  {
    id: id(),
    tipo: text("tipo", { enum: ["ingreso", "gasto"] }).notNull(),
    fecha: text("fecha").notNull(),
    monto: integer("monto").notNull(),
    categoria: text("categoria").notNull(),
    descripcion: text("descripcion").notNull().default(""),
    cuentaId: text("cuenta_id").references(() => cuentas.id),
    tarjetaId: text("tarjeta_id").references(() => tarjetas.id),
    recurrenteId: text("recurrente_id").references(() => recurrentes.id, { onDelete: "set null" }),
    periodo: text("periodo"),
    origen: text("origen", { enum: ["manual", "importado", "chat", "recurrente"] }).notNull().default("manual"),
    ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
    creadoEn: creadoEn(),
  },
  (t) => [index("mov_fecha").on(t.fecha), uniqueIndex("mov_recurrente_periodo").on(t.recurrenteId, t.periodo)],
);

export const pagosTarjeta = sqliteTable(
  "pagos_tarjeta",
  {
    id: id(),
    tarjetaId: text("tarjeta_id").notNull().references(() => tarjetas.id),
    periodo: text("periodo").notNull(),
    monto: integer("monto").notNull(),
    fecha: text("fecha").notNull(),
    cuentaId: text("cuenta_id").references(() => cuentas.id),
    ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
    creadoEn: creadoEn(),
  },
  (t) => [index("pago_tarjeta_periodo").on(t.tarjetaId, t.periodo)],
);

// Cifras reales del estado de cuenta del banco. Si existen, mandan sobre lo calculado por la app.
export const estadosCuenta = sqliteTable(
  "estados_cuenta",
  {
    id: id(),
    tarjetaId: text("tarjeta_id").notNull().references(() => tarjetas.id, { onDelete: "cascade" }),
    periodo: text("periodo").notNull(),
    pagoNoIntereses: integer("pago_no_intereses").notNull(),
    pagoMinimo: integer("pago_minimo"),
    notas: text("notas").notNull().default(""),
    ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("estado_tarjeta_periodo").on(t.tarjetaId, t.periodo)],
);

export const transferencias = sqliteTable("transferencias", {
  id: id(),
  origenId: text("origen_id").notNull().references(() => cuentas.id),
  destinoId: text("destino_id").notNull().references(() => cuentas.id),
  monto: integer("monto").notNull(),
  fecha: text("fecha").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
  creadoEn: creadoEn(),
});

export const presupuestos = sqliteTable("presupuestos", {
  id: id(),
  categoria: text("categoria").notNull().unique(),
  monto: integer("monto").notNull(),
  ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
});

export const metas = sqliteTable("metas", {
  id: id(),
  nombre: text("nombre").notNull(),
  objetivo: integer("objetivo").notNull(),
  fechaObjetivo: text("fecha_objetivo"),
  color: text("color").notNull(),
  ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
  creadoEn: creadoEn(),
});

// Aportaciones (positivas) y retiros (negativos) a una meta. Si tienen cuenta, salen o entran de esa cuenta.
export const aportaciones = sqliteTable("aportaciones", {
  id: id(),
  metaId: text("meta_id").notNull().references(() => metas.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  monto: integer("monto").notNull(),
  cuentaId: text("cuenta_id").references(() => cuentas.id),
  ejemplo: integer("ejemplo", { mode: "boolean" }).notNull().default(false),
});

export type Cuenta = typeof cuentas.$inferSelect;
export type Tarjeta = typeof tarjetas.$inferSelect;
export type Compra = typeof compras.$inferSelect;
export type Recurrente = typeof recurrentes.$inferSelect;
export type RecurrentePrecio = typeof recurrentePrecios.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type PagoTarjeta = typeof pagosTarjeta.$inferSelect;
export type EstadoCuentaReal = typeof estadosCuenta.$inferSelect;
export type Transferencia = typeof transferencias.$inferSelect;
export type Presupuesto = typeof presupuestos.$inferSelect;
export type Meta = typeof metas.$inferSelect;
export type Aportacion = typeof aportaciones.$inferSelect;
