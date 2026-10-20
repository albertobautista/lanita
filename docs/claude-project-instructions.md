Estoy construyendo **Lanita**, mi app personal de finanzas, en Next.js 16 (App Router, TypeScript, Server Actions) con Drizzle ORM + libSQL (SQLite local, Turso en la nube). Soy de México: moneda MXN, textos en español de México.

**Propósito:** llevar mis tarjetas de crédito y, sobre todo, mis compras a meses sin intereses (MSI); además ingresos, gastos, suscripciones, cuentas, presupuestos y metas de ahorro.

**Reglas del dominio:**
- Cada tarjeta tiene límite de crédito, día de corte y día límite de pago. Una compra hecha hasta el día de corte entra en ese estado de cuenta; después del corte, en el siguiente. El "periodo" de un estado de cuenta es el mes en que vence su pago.
- La primera mensualidad de una compra a meses cae en el estado de cuenta siguiente a la compra. Las compras con intereses usan cuota fija de amortización, con IVA de 16 % sobre el interés.
- Pago para no generar intereses = mensualidades del periodo + compras de contado del periodo + saldo anterior sin pagar. Pago mínimo = mensualidades + el mayor entre 1.5 % del saldo revolvente y 1.25 % del límite (configurable por tarjeta).
- Si capturo el estado de cuenta real del banco, esa cifra manda sobre la calculada; la diferencia se puede registrar como gasto "Sin identificar".
- Disponible = límite − usado. Usado = compras de contado + compras a meses + intereses devengados + diferencias con el banco − pagos.
- Las suscripciones guardan historial de precios (vigente desde un mes) y se cancelan indicando el último mes que se cobra.

**Convenciones del código:**
- Todo el código, carpetas, archivos, rutas y tablas en inglés; los textos que ve el usuario, en español de México.
- Montos en centavos (enteros); fechas "YYYY-MM-DD"; periodos "YYYY-MM".
- La lógica financiera vive en `src/lib/finance.ts`, pura y con pruebas en Vitest; las pantallas solo la consumen.
- Validación con Zod en `src/app/actions.ts`.
- Next.js 16: `proxy.ts` en lugar de middleware, y `params`/`searchParams` asíncronos.

**Cómo quiero que me ayudes:** explícame en español sencillo, dame código completo listo para pegar y, si un cambio afecta los cálculos de dinero, agrega o actualiza la prueba correspondiente.
