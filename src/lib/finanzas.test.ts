import { describe, expect, it } from "vitest";
import type { Compra, Movimiento, PagoTarjeta, Recurrente, RecurrentePrecio, Tarjeta } from "@/db/schema";
import { calendarioCompra, cargoEnPeriodo, Finanzas, ocurrenciasPendientes, periodoDePago, proximoCargo, type Datos } from "./finanzas";
import { sumarMeses } from "./periodos";

const base = { ejemplo: false, creadoEn: "2026-01-01" };
const tarjeta = (x: Partial<Tarjeta> = {}): Tarjeta => ({
  id: "t1", nombre: "Oro", banco: "", ultimos4: "", limite: 5_000_000, corte: 5, pago: 25, color: "#000",
  minPctSaldo: 150, minPctLimite: 125, tasaAnual: 0, ...base, ...x,
});
const compra = (x: Partial<Compra> = {}): Compra => ({
  id: "c1", tarjetaId: "t1", descripcion: "Refri", categoria: "Casa", monto: 1_200_000, meses: 12, fecha: "2026-03-10",
  tasaAnual: 0, conIva: false, liquidadaPeriodo: null, ...base, ...x,
});
const gasto = (x: Partial<Movimiento> = {}): Movimiento => ({
  id: crypto.randomUUID(), tipo: "gasto", fecha: "2026-03-10", monto: 100_000, categoria: "Súper", descripcion: "", cuentaId: null,
  tarjetaId: "t1", recurrenteId: null, periodo: null, origen: "manual", ...base, ...x,
});
const pago = (x: Partial<PagoTarjeta>): PagoTarjeta => ({ id: crypto.randomUUID(), tarjetaId: "t1", periodo: "2026-04", monto: 0, fecha: "2026-04-20", cuentaId: null, ...base, ...x });
const vacio = (): Datos => ({
  cuentas: [], tarjetas: [tarjeta()], compras: [], recurrentes: [], precios: [], movimientos: [], pagos: [], estadosReales: [],
  transferencias: [], presupuestos: [], metas: [], aportaciones: [],
});

describe("periodoDePago", () => {
  it("antes o el día del corte cae en el estado de ese mes", () => {
    expect(periodoDePago({ corte: 5, pago: 25 }, "2026-03-05")).toBe("2026-03");
    expect(periodoDePago({ corte: 5, pago: 25 }, "2026-03-06")).toBe("2026-04");
  });
  it("si el pago es antes que el corte, se paga el mes siguiente", () => {
    expect(periodoDePago({ corte: 20, pago: 10 }, "2026-03-15")).toBe("2026-04");
    expect(periodoDePago({ corte: 20, pago: 10 }, "2026-12-21")).toBe("2027-02");
  });
});

describe("calendarioCompra", () => {
  it("MSI reparte el monto exacto en centavos", () => {
    const cal = calendarioCompra(compra({ monto: 1_000_000, meses: 3 }), tarjeta());
    expect(cal.map((p) => p.monto)).toEqual([333_333, 333_333, 333_334]);
    expect(cal[0].periodo).toBe("2026-04");
    expect(cal.at(-1)!.periodo).toBe("2026-06");
  });
  it("con intereses usa cuota fija de amortización", () => {
    const cal = calendarioCompra(compra({ tasaAnual: 3600, conIva: false }), tarjeta());
    expect(cal[0].monto).toBe(120_555);
    expect(cal[0].interes).toBe(36_000);
    expect(cal.reduce((s, p) => s + p.capital, 0)).toBe(1_200_000);
  });
  it("liquidar corta el plan y cobra el saldo restante", () => {
    const cal = calendarioCompra(compra({ liquidadaPeriodo: "2026-07" }), tarjeta());
    expect(cal).toHaveLength(4);
    expect(cal.at(-1)).toMatchObject({ periodo: "2026-07", monto: 900_000, liquidacion: true });
  });
});

describe("estado de cuenta", () => {
  it("suma mensualidades y contado, y calcula el mínimo", () => {
    const d = vacio();
    d.compras.push(compra());
    d.movimientos.push(gasto({ monto: 200_000 }));
    const ec = new Finanzas(d, "2026-04-01").estadoCuenta(d.tarjetas[0], "2026-04");
    expect(ec.pagoNoIntereses).toBe(300_000);
    // mensualidad + máx(1.5 % de 2,000, 1.25 % de 50,000)
    expect(ec.pagoMinimo).toBe(100_000 + 62_500);
    expect(ec.estado).toBe("pendiente");
  });
  it("lo no pagado pasa como saldo anterior", () => {
    const d = vacio();
    d.movimientos.push(gasto({ monto: 200_000 }));
    d.pagos.push(pago({ monto: 50_000 }));
    const f = new Finanzas(d, "2026-05-01");
    expect(f.estadoCuenta(d.tarjetas[0], "2026-04").estado).toBe("parcial");
    expect(f.estadoCuenta(d.tarjetas[0], "2026-05").saldoAnterior).toBe(150_000);
  });
  it("el estado de cuenta real manda y muestra la diferencia", () => {
    const d = vacio();
    d.movimientos.push(gasto({ monto: 200_000 }));
    d.estadosReales.push({ id: "e1", tarjetaId: "t1", periodo: "2026-04", pagoNoIntereses: 245_000, pagoMinimo: 70_000, notas: "", ...base });
    const f = new Finanzas(d, "2026-04-01");
    const ec = f.estadoCuenta(d.tarjetas[0], "2026-04");
    expect(ec).toMatchObject({ pagoNoIntereses: 245_000, pagoMinimo: 70_000, calculado: 200_000, diferencia: 45_000 });
    expect(f.usado(d.tarjetas[0])).toBe(245_000);
    d.pagos.push(pago({ monto: 245_000 }));
    const f2 = new Finanzas(d, "2026-05-01");
    expect(f2.estadoCuenta(d.tarjetas[0], "2026-04").estado).toBe("pagado");
    expect(f2.estadoCuenta(d.tarjetas[0], "2026-05").saldoAnterior).toBe(0);
    expect(f2.usado(d.tarjetas[0])).toBe(0);
  });
  it("una mensualidad pagada cuenta en el avance", () => {
    const d = vacio();
    d.compras.push(compra());
    d.pagos.push(pago({ periodo: "2026-04", monto: 100_000 }), pago({ periodo: "2026-05", monto: 100_000 }));
    const st = new Finanzas(d, "2026-05-10").estadoCompra(d.compras[0]);
    expect(st.pagadas).toBe(2);
    expect(st.restante).toBe(1_000_000);
  });
});

describe("cargos fijos y suscripciones", () => {
  const r: Recurrente = {
    id: "r1", tipo: "gasto", esSuscripcion: true, descripcion: "Streaming", categoria: "Entretenimiento", frecuencia: "mensual", dia: 15,
    mesAnual: null, cuentaId: null, tarjetaId: "t1", desde: "2026-01", hasta: null, canceladaEn: null, ...base,
  };
  const precios: RecurrentePrecio[] = [
    { id: "p1", recurrenteId: "r1", desde: "2026-01", monto: 19_900 },
    { id: "p2", recurrenteId: "r1", desde: "2026-04", monto: 21_900 },
  ];
  it("usa el precio vigente de cada mes", () => {
    expect(cargoEnPeriodo(r, precios, "2026-03")).toBe(19_900);
    expect(cargoEnPeriodo(r, precios, "2026-04")).toBe(21_900);
  });
  it("cancelada ya no cobra después de su último mes", () => {
    const c = { ...r, hasta: "2026-05" };
    expect(cargoEnPeriodo(c, precios, "2026-05")).toBe(21_900);
    expect(cargoEnPeriodo(c, precios, "2026-06")).toBe(0);
    expect(proximoCargo(c, precios, "2026-05-20")).toBeNull();
  });
  it("anual solo cobra en su mes", () => {
    const a = { ...r, frecuencia: "anual" as const, mesAnual: 3 };
    expect(cargoEnPeriodo(a, precios, "2026-03")).toBe(19_900);
    expect(cargoEnPeriodo(a, precios, "2026-04")).toBe(0);
    expect(cargoEnPeriodo(a, precios, "2027-03")).toBe(21_900);
  });
  it("genera las ocurrencias que faltan hasta hoy, una sola vez", () => {
    const pend = ocurrenciasPendientes({ recurrentes: [r], precios, movimientos: [] }, "2026-03-14");
    expect(pend.map((p) => p.periodo)).toEqual(["2026-01", "2026-02"]);
    const ya = gasto({ recurrenteId: "r1", periodo: "2026-01" });
    expect(ocurrenciasPendientes({ recurrentes: [r], precios, movimientos: [ya] }, "2026-03-15").map((p) => p.periodo)).toEqual(["2026-02", "2026-03"]);
  });
});

describe("simulador y mejor tarjeta", () => {
  it("compra nueva baja el disponible y suma a los próximos pagos", () => {
    const d = vacio();
    const sim = new Finanzas(d, "2026-04-02").simular({ tarjetaId: "t1", monto: 600_000, meses: 6, fecha: "2026-04-02", tasaAnual: 0, conIva: false, liquidadaPeriodo: null })!;
    expect(sim.disponibleDespues).toBe(4_400_000);
    expect(sim.filas[0]).toMatchObject({ periodo: "2026-04", extra: 100_000 });
    expect(sim.filas[6].extra).toBe(0);
  });
  it("recomienda la tarjeta que da más días para pagar", () => {
    const d = vacio();
    d.tarjetas.push(tarjeta({ id: "t2", nombre: "Clásica", corte: 20, pago: 10 }));
    const [mejor] = new Finanzas(d, "2026-04-06").mejorTarjetaHoy();
    expect(mejor.tarjeta.nombre).toBe("Oro");
    expect(mejor.fechaLimite).toBe("2026-05-25");
  });
});

it("sumarMeses cruza años", () => {
  expect(sumarMeses("2026-11", 3)).toBe("2027-02");
  expect(sumarMeses("2026-01", -1)).toBe("2025-12");
});
