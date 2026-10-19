// Lógica financiera pura (sin base de datos ni React). Se usa en el servidor y en el simulador del navegador.
// Montos en centavos; periodo "YYYY-MM" = mes en que vence el pago del estado de cuenta.

import type {
  Aportacion, Compra, Cuenta, EstadoCuentaReal, Meta, Movimiento, PagoTarjeta, Presupuesto, Recurrente, RecurrentePrecio, Tarjeta, Transferencia,
} from "@/db/schema";
import { diaDe, diasEntre, fechaEnPeriodo, mesesEntre, periodoDe, rangoPeriodos, sumarMeses } from "./periodos";

export type Datos = {
  cuentas: Cuenta[];
  tarjetas: Tarjeta[];
  compras: Compra[];
  recurrentes: Recurrente[];
  precios: RecurrentePrecio[];
  movimientos: Movimiento[];
  pagos: PagoTarjeta[];
  estadosReales: EstadoCuentaReal[];
  transferencias: Transferencia[];
  presupuestos: Presupuesto[];
  metas: Meta[];
  aportaciones: Aportacion[];
};

export const IVA = 0.16;

type TarjetaCiclo = Pick<Tarjeta, "corte" | "pago">;

/** Periodo en que se paga una compra hecha en `fecha`: el corte siguiente y luego su fecha límite. */
export function periodoDePago(t: TarjetaCiclo, fecha: string) {
  const cierre = diaDe(fecha) <= t.corte ? periodoDe(fecha) : sumarMeses(periodoDe(fecha), 1);
  return t.pago > t.corte ? cierre : sumarMeses(cierre, 1);
}

export function fechaLimite(t: TarjetaCiclo, periodo: string) {
  return fechaEnPeriodo(periodo, t.pago);
}

/** Fecha de corte del estado de cuenta que vence en `periodo`. */
export function fechaCorte(t: TarjetaCiclo, periodo: string) {
  return fechaEnPeriodo(t.pago > t.corte ? periodo : sumarMeses(periodo, -1), t.corte);
}

// ---------- compras a meses ----------

export type PagoProgramado = { periodo: string; monto: number; capital: number; interes: number; liquidacion: boolean };

export type CompraPlan = Pick<Compra, "monto" | "meses" | "fecha" | "tasaAnual" | "conIva" | "liquidadaPeriodo">;

export function tasaMensual(c: Pick<Compra, "tasaAnual" | "conIva">) {
  return (c.tasaAnual / 10000 / 12) * (c.conIva ? 1 + IVA : 1);
}

/** Calendario de pagos de una compra a meses (con o sin intereses), cortado si se liquidó antes. */
export function calendarioCompra(c: CompraPlan, t: TarjetaCiclo): PagoProgramado[] {
  const n = Math.max(1, c.meses);
  const inicio = periodoDePago(t, c.fecha);
  const r = tasaMensual(c);
  const cuota = r > 0 ? Math.round((c.monto * r) / (1 - Math.pow(1 + r, -n))) : Math.floor(c.monto / n);
  const pagos: PagoProgramado[] = [];
  let saldo = c.monto;
  for (let k = 0; k < n; k++) {
    const periodo = sumarMeses(inicio, k);
    if (c.liquidadaPeriodo && periodo >= c.liquidadaPeriodo) {
      if (saldo > 0) pagos.push({ periodo: c.liquidadaPeriodo, monto: saldo, capital: saldo, interes: 0, liquidacion: true });
      return pagos;
    }
    const interes = Math.round(saldo * r);
    const capital = k === n - 1 ? saldo : Math.min(saldo, cuota - interes);
    pagos.push({ periodo, monto: capital + interes, capital, interes, liquidacion: false });
    saldo -= capital;
  }
  return pagos;
}

export function resumenPlan(c: CompraPlan, t: TarjetaCiclo) {
  const cal = calendarioCompra(c, t);
  const mensualidad = cal.find((p) => !p.liquidacion)?.monto ?? 0;
  const total = cal.reduce((s, p) => s + p.monto, 0);
  return {
    calendario: cal,
    mensualidad,
    inicio: cal[0]?.periodo ?? periodoDePago(t, c.fecha),
    fin: cal.at(-1)?.periodo ?? periodoDePago(t, c.fecha),
    total,
    intereses: total - c.monto,
  };
}

// ---------- cargos fijos y suscripciones ----------

export function precioVigente(precios: RecurrentePrecio[], recurrenteId: string, periodo: string) {
  let mejor: RecurrentePrecio | undefined;
  for (const p of precios) if (p.recurrenteId === recurrenteId && p.desde <= periodo && (!mejor || p.desde > mejor.desde)) mejor = p;
  return mejor?.monto ?? 0;
}

/** Monto que el cargo fijo genera en `periodo` (0 si no toca ese mes, aún no empieza o ya se canceló). */
export function cargoEnPeriodo(r: Recurrente, precios: RecurrentePrecio[], periodo: string) {
  if (periodo < r.desde || (r.hasta && periodo > r.hasta)) return 0;
  if (r.frecuencia === "anual" && Number(periodo.slice(5)) !== (r.mesAnual ?? Number(r.desde.slice(5)))) return 0;
  return precioVigente(precios, r.id, periodo);
}

export function costoMensualEquivalente(r: Recurrente, precios: RecurrentePrecio[], periodo: string) {
  if (r.hasta && r.hasta < periodo) return 0;
  const precio = precioVigente(precios, r.id, periodo < r.desde ? r.desde : periodo);
  return r.frecuencia === "anual" ? Math.round(precio / 12) : precio;
}

export function proximoCargo(r: Recurrente, precios: RecurrentePrecio[], hoy: string) {
  for (let i = 0; i < 24; i++) {
    const periodo = sumarMeses(periodoDe(hoy), i);
    const monto = cargoEnPeriodo(r, precios, periodo);
    const fecha = fechaEnPeriodo(periodo, r.dia);
    if (monto > 0 && fecha >= hoy) return { fecha, monto };
  }
  return null;
}

/** Ocurrencias que ya debieron cargarse hasta `hoy` y aún no existen como movimiento. */
export function ocurrenciasPendientes(d: Pick<Datos, "recurrentes" | "precios" | "movimientos">, hoy: string) {
  const hechas = new Set(d.movimientos.filter((m) => m.recurrenteId).map((m) => `${m.recurrenteId}|${m.periodo}`));
  const out: { recurrente: Recurrente; periodo: string; fecha: string; monto: number }[] = [];
  for (const r of d.recurrentes) {
    const ultimo = r.hasta && r.hasta < periodoDe(hoy) ? r.hasta : periodoDe(hoy);
    for (let p = r.desde; p <= ultimo; p = sumarMeses(p, 1)) {
      const fecha = fechaEnPeriodo(p, r.dia);
      if (fecha > hoy || hechas.has(`${r.id}|${p}`)) continue;
      const monto = cargoEnPeriodo(r, d.precios, p);
      if (monto > 0) out.push({ recurrente: r, periodo: p, fecha, monto });
    }
  }
  return out;
}

// ---------- motor principal ----------

export type EstadoPago = "sin_cargos" | "pagado" | "minimo" | "parcial" | "vencido" | "por_vencer" | "pendiente";

export type EstadoCuenta = {
  periodo: string;
  fechaCorte: string;
  fechaLimite: string;
  mensualidades: { compra: Compra; pago: PagoProgramado }[];
  contado: Movimiento[];
  totalMensualidades: number;
  totalContado: number;
  saldoAnterior: number;
  /** Lo que la app calculó a partir de lo capturado. */
  calculado: number;
  /** Cifras del banco, si las capturaste. */
  real: EstadoCuentaReal | null;
  /** real − calculado: gastos que olvidaste registrar (positivo) o que sobran (negativo). */
  diferencia: number;
  /** Lo que queda a cargo (o a favor si es negativo) antes de pagos; se arrastra al mes siguiente. */
  cargosNetos: number;
  /** Pago para no generar intereses. */
  pagoNoIntereses: number;
  pagoMinimo: number;
  interesEstimado: number;
  pagado: number;
  estado: EstadoPago;
  diasParaVencer: number;
};

export class Finanzas {
  readonly hoy: string;
  readonly actual: string;
  private estados = new Map<string, EstadoCuenta>();
  private calendarios = new Map<string, PagoProgramado[]>();

  constructor(readonly d: Datos, hoy: string) {
    this.hoy = hoy;
    this.actual = periodoDe(hoy);
  }

  tarjeta(id: string | null | undefined) {
    return this.d.tarjetas.find((t) => t.id === id);
  }
  cuenta(id: string | null | undefined) {
    return this.d.cuentas.find((c) => c.id === id);
  }

  calendario(c: Compra) {
    let cal = this.calendarios.get(c.id);
    if (!cal) {
      const t = this.tarjeta(c.tarjetaId);
      cal = t ? calendarioCompra(c, t) : [];
      this.calendarios.set(c.id, cal);
    }
    return cal;
  }

  private primerPeriodo(t: Tarjeta) {
    let p = this.actual;
    for (const c of this.d.compras) if (c.tarjetaId === t.id) { const i = this.calendario(c)[0]?.periodo; if (i && i < p) p = i; }
    for (const m of this.d.movimientos) if (m.tarjetaId === t.id && m.tipo === "gasto") { const i = periodoDePago(t, m.fecha); if (i < p) p = i; }
    for (const pg of this.d.pagos) if (pg.tarjetaId === t.id && pg.periodo < p) p = pg.periodo;
    return p;
  }

  /** Estado de cuenta de la tarjeta para el pago que vence en `periodo`. */
  estadoCuenta(t: Tarjeta, periodo: string): EstadoCuenta {
    const key = `${t.id}|${periodo}`;
    const hit = this.estados.get(key);
    if (hit) return hit;

    const anterior = periodo > this.primerPeriodo(t) ? this.estadoCuenta(t, sumarMeses(periodo, -1)) : null;
    // Lo que quedó sin pagar (o a favor, si es negativo) del mes anterior.
    const saldoAnterior = anterior ? anterior.cargosNetos - anterior.pagado : 0;

    const mensualidades = this.d.compras
      .filter((c) => c.tarjetaId === t.id)
      .flatMap((compra) => this.calendario(compra).filter((p) => p.periodo === periodo).map((pago) => ({ compra, pago })));
    const contado = this.d.movimientos.filter((m) => m.tarjetaId === t.id && m.tipo === "gasto" && periodoDePago(t, m.fecha) === periodo);
    const totalMensualidades = mensualidades.reduce((s, x) => s + x.pago.monto, 0);
    const totalContado = contado.reduce((s, m) => s + m.monto, 0);
    const calculadoNeto = totalMensualidades + totalContado + saldoAnterior;
    const calculado = Math.max(0, calculadoNeto);
    const real = this.d.estadosReales.find((e) => e.tarjetaId === t.id && e.periodo === periodo) ?? null;
    const cargosNetos = real ? real.pagoNoIntereses : calculadoNeto;
    const pagoNoIntereses = Math.max(0, cargosNetos);
    const revolvente = Math.max(0, pagoNoIntereses - totalMensualidades);
    const fijo = Math.max(Math.round((revolvente * t.minPctSaldo) / 10000), Math.round((t.limite * t.minPctLimite) / 10000));
    const pagoMinimo = real?.pagoMinimo ?? Math.min(pagoNoIntereses, totalMensualidades + fijo);
    const interesEstimado = saldoAnterior > 0 ? Math.round((saldoAnterior * t.tasaAnual * (1 + IVA)) / 10000 / 12) : 0;
    const pagado = this.d.pagos.filter((p) => p.tarjetaId === t.id && p.periodo === periodo).reduce((s, p) => s + p.monto, 0);
    const limite = fechaLimite(t, periodo);
    const diasParaVencer = diasEntre(this.hoy, limite);

    let estado: EstadoPago;
    if (pagoNoIntereses === 0) estado = pagado > 0 || saldoAnterior < 0 ? "pagado" : "sin_cargos";
    else if (pagado >= pagoNoIntereses) estado = "pagado";
    else if (pagado > 0 && pagado >= pagoMinimo) estado = "minimo";
    else if (pagado > 0) estado = "parcial";
    else if (diasParaVencer < 0) estado = "vencido";
    else if (diasParaVencer <= 5) estado = "por_vencer";
    else estado = "pendiente";

    const ec: EstadoCuenta = {
      periodo, fechaCorte: fechaCorte(t, periodo), fechaLimite: limite, mensualidades, contado, totalMensualidades, totalContado,
      saldoAnterior, calculado, real, diferencia: real ? real.pagoNoIntereses - calculado : 0, cargosNetos, pagoNoIntereses, pagoMinimo, interesEstimado, pagado, estado, diasParaVencer,
    };
    this.estados.set(key, ec);
    return ec;
  }

  /** Crédito usado: compras y cargos registrados menos pagos, más intereses ya devengados. */
  usado(t: Tarjeta) {
    const contado = this.d.movimientos.filter((m) => m.tarjetaId === t.id && m.tipo === "gasto").reduce((s, m) => s + m.monto, 0);
    let compras = 0;
    for (const c of this.d.compras.filter((c) => c.tarjetaId === t.id)) {
      compras += c.monto + this.calendario(c).filter((p) => p.periodo <= this.actual).reduce((s, p) => s + p.interes, 0);
    }
    const pagos = this.d.pagos.filter((p) => p.tarjetaId === t.id).reduce((s, p) => s + p.monto, 0);
    // Lo que el banco cobró de más o de menos respecto a lo capturado también ocupa (o libera) crédito.
    const ajustes = this.d.estadosReales.filter((e) => e.tarjetaId === t.id).reduce((s, e) => s + this.estadoCuenta(t, e.periodo).diferencia, 0);
    return Math.max(0, contado + compras + ajustes - pagos);
  }

  disponible(t: Tarjeta) {
    return t.limite - this.usado(t);
  }

  estadoCompra(c: Compra) {
    const t = this.tarjeta(c.tarjetaId);
    const cal = this.calendario(c);
    const pagadoActual = t ? ["pagado", "sin_cargos"].includes(this.estadoCuenta(t, this.actual).estado) : false;
    const cubiertos = cal.filter((p) => p.periodo < this.actual || (p.periodo === this.actual && pagadoActual));
    const plan = t ? resumenPlan(c, t) : null;
    const restante = cal.filter((p) => !cubiertos.includes(p)).reduce((s, p) => s + p.monto, 0);
    return {
      tarjeta: t,
      calendario: cal,
      mensualidad: plan?.mensualidad ?? 0,
      inicio: plan?.inicio ?? this.actual,
      fin: plan?.fin ?? this.actual,
      total: plan?.total ?? c.monto,
      intereses: plan?.intereses ?? 0,
      meses: c.liquidadaPeriodo ? cal.length : c.meses,
      pagadas: cubiertos.length,
      restante,
      activa: cubiertos.length < cal.length,
      liquidada: !!c.liquidadaPeriodo,
    };
  }

  /** Mensualidades de compras a meses que vencen en `periodo` (todas las tarjetas). */
  mensualidadesEn(periodo: string, tarjetaId?: string) {
    let s = 0;
    for (const c of this.d.compras) if (!tarjetaId || c.tarjetaId === tarjetaId) for (const p of this.calendario(c)) if (p.periodo === periodo) s += p.monto;
    return s;
  }

  /** Cargos fijos que aún no se registran como movimiento en `periodo` (proyección). */
  proyectados(periodo: string) {
    const hechas = new Set(this.d.movimientos.filter((m) => m.recurrenteId && m.periodo === periodo).map((m) => m.recurrenteId));
    return this.d.recurrentes
      .filter((r) => !hechas.has(r.id))
      .map((r) => ({ r, monto: cargoEnPeriodo(r, this.d.precios, periodo), fecha: fechaEnPeriodo(periodo, r.dia) }))
      .filter((x) => x.monto > 0 && x.fecha >= this.hoy);
  }

  resumenMes(periodo: string) {
    const movs = this.d.movimientos.filter((m) => periodoDe(m.fecha) === periodo);
    const proy = this.proyectados(periodo);
    const ingresos = movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
    const gastos = movs.filter((m) => m.tipo === "gasto").reduce((s, m) => s + m.monto, 0);
    const ingresosProyectados = proy.filter((x) => x.r.tipo === "ingreso").reduce((s, x) => s + x.monto, 0);
    const gastosProyectados = proy.filter((x) => x.r.tipo === "gasto").reduce((s, x) => s + x.monto, 0);
    const mensualidades = this.mensualidadesEn(periodo);
    const porCategoria = new Map<string, number>();
    for (const m of movs) if (m.tipo === "gasto") porCategoria.set(m.categoria, (porCategoria.get(m.categoria) ?? 0) + m.monto);
    for (const c of this.d.compras) for (const p of this.calendario(c)) if (p.periodo === periodo) porCategoria.set(c.categoria, (porCategoria.get(c.categoria) ?? 0) + p.monto);
    return {
      ingresos, gastos, mensualidades, ingresosProyectados, gastosProyectados,
      total: gastos + mensualidades,
      balance: ingresos - gastos - mensualidades,
      balanceEsperado: ingresos + ingresosProyectados - gastos - gastosProyectados - mensualidades,
      porCategoria: [...porCategoria.entries()].sort((a, b) => b[1] - a[1]),
    };
  }

  saldoCuenta(c: Cuenta) {
    let s = c.saldoInicial;
    for (const m of this.d.movimientos) if (m.cuentaId === c.id) s += m.tipo === "ingreso" ? m.monto : -m.monto;
    for (const p of this.d.pagos) if (p.cuentaId === c.id) s -= p.monto;
    for (const t of this.d.transferencias) { if (t.origenId === c.id) s -= t.monto; if (t.destinoId === c.id) s += t.monto; }
    for (const a of this.d.aportaciones) if (a.cuentaId === c.id) s -= a.monto;
    return s;
  }

  presupuestos(periodo: string) {
    const porCat = new Map(this.resumenMes(periodo).porCategoria);
    return this.d.presupuestos
      .map((p) => {
        const gastado = porCat.get(p.categoria) ?? 0;
        const pct = p.monto > 0 ? gastado / p.monto : 0;
        return { presupuesto: p, gastado, restante: p.monto - gastado, pct, nivel: pct >= 1 ? "excedido" : pct >= 0.85 ? "alerta" : "ok" } as const;
      })
      .sort((a, b) => b.pct - a.pct);
  }

  estadoMeta(m: Meta) {
    const ahorrado = this.d.aportaciones.filter((a) => a.metaId === m.id).reduce((s, a) => s + a.monto, 0);
    const falta = Math.max(0, m.objetivo - ahorrado);
    const mesesRestantes = m.fechaObjetivo ? Math.max(1, mesesEntre(this.actual, periodoDe(m.fechaObjetivo)) + 1) : null;
    return {
      ahorrado, falta, pct: m.objetivo > 0 ? Math.min(1, ahorrado / m.objetivo) : 0,
      mesesRestantes,
      porMes: mesesRestantes ? Math.ceil(falta / mesesRestantes) : null,
      atrasada: !!m.fechaObjetivo && m.fechaObjetivo < this.hoy && falta > 0,
    };
  }

  /** Qué tarjeta conviene usar hoy: la que más días te da para pagar, con crédito disponible. */
  mejorTarjetaHoy() {
    return this.d.tarjetas
      .map((t) => {
        const periodo = periodoDePago(t, this.hoy);
        const limite = fechaLimite(t, periodo);
        return { tarjeta: t, periodo, fechaLimite: limite, dias: diasEntre(this.hoy, limite), disponible: this.disponible(t) };
      })
      .sort((a, b) => Number(b.disponible > 0) - Number(a.disponible > 0) || b.dias - a.dias);
  }

  /** Ingreso mensual típico: cargos fijos de ingreso vigentes, o el promedio de los últimos 3 meses. */
  ingresoMensualTipico() {
    const fijos = this.d.recurrentes.filter((r) => r.tipo === "ingreso").reduce((s, r) => s + costoMensualEquivalente(r, this.d.precios, this.actual), 0);
    if (fijos > 0) return fijos;
    const meses = [1, 2, 3].map((i) => this.resumenMes(sumarMeses(this.actual, -i)).ingresos);
    return Math.round(meses.reduce((a, b) => a + b, 0) / 3);
  }

  avisos() {
    const out: { nivel: "critico" | "alerta" | "info"; texto: string; href: string }[] = [];
    for (const t of this.d.tarjetas) {
      for (const periodo of [sumarMeses(this.actual, -1), this.actual, sumarMeses(this.actual, 1)]) {
        const ec = this.estadoCuenta(t, periodo);
        if (ec.estado === "vencido") out.push({ nivel: "critico", texto: `${t.nombre}: el pago de ${formatoPeriodoCorto(periodo)} venció hace ${-ec.diasParaVencer} días`, href: "/" });
        if (ec.estado === "por_vencer") out.push({ nivel: "alerta", texto: `${t.nombre}: paga antes del ${Number(ec.fechaLimite.slice(8))} (en ${ec.diasParaVencer} días) para no generar intereses`, href: "/" });
        if (ec.estado === "minimo" && ec.diasParaVencer >= 0) out.push({ nivel: "alerta", texto: `${t.nombre}: cubriste el mínimo; si no pagas el resto generarás intereses`, href: "/" });
      }
      const u = t.limite > 0 ? this.usado(t) / t.limite : 0;
      if (u >= 0.9) out.push({ nivel: "alerta", texto: `${t.nombre}: usas el ${Math.round(u * 100)} % de tu límite`, href: "/tarjetas" });
    }
    for (const p of this.presupuestos(this.actual)) {
      if (p.nivel === "excedido") out.push({ nivel: "alerta", texto: `Te pasaste del presupuesto de ${p.presupuesto.categoria}`, href: "/presupuestos" });
      else if (p.nivel === "alerta") out.push({ nivel: "info", texto: `Llevas el ${Math.round(p.pct * 100)} % del presupuesto de ${p.presupuesto.categoria}`, href: "/presupuestos" });
    }
    for (const r of this.d.recurrentes.filter((r) => r.esSuscripcion)) {
      const prox = proximoCargo(r, this.d.precios, this.hoy);
      if (prox && diasEntre(this.hoy, prox.fecha) <= 3) out.push({ nivel: "info", texto: `${r.descripcion} se cobra el ${Number(prox.fecha.slice(8))}`, href: "/suscripciones" });
    }
    const orden = { critico: 0, alerta: 1, info: 2 };
    return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  }

  /** Simula una compra nueva: cómo cambian los pagos de los próximos meses y el crédito disponible. */
  simular(nueva: CompraPlan & { tarjetaId: string }, meses = 12) {
    const t = this.tarjeta(nueva.tarjetaId);
    if (!t) return null;
    const plan = resumenPlan(nueva, t);
    const periodos = rangoPeriodos(this.actual, meses);
    const filas = periodos.map((periodo) => {
      const antes = this.d.tarjetas.reduce((s, x) => s + this.estadoCuenta(x, periodo).pagoNoIntereses, 0);
      const extra = plan.calendario.filter((p) => p.periodo === periodo).reduce((s, p) => s + p.monto, 0);
      const fijos = this.d.recurrentes.filter((r) => r.tipo === "gasto" && !r.tarjetaId).reduce((s, r) => s + cargoEnPeriodo(r, this.d.precios, periodo), 0);
      return { periodo, antes, extra, despues: antes + extra, fijos };
    });
    const disponibleAntes = this.disponible(t);
    return {
      plan,
      filas,
      tarjeta: t,
      disponibleAntes,
      disponibleDespues: disponibleAntes - nueva.monto,
      ingreso: this.ingresoMensualTipico(),
      picoDespues: Math.max(...filas.map((f) => f.despues + f.fijos)),
    };
  }
}

export function formatoPeriodoCorto(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", { month: "short", year: "numeric" }).replace(".", "");
}
