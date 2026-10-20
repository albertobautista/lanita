# Lanita

App personal para llevar tus finanzas: tarjetas de crédito, compras a meses sin intereses, ingresos, gastos y suscripciones.

## Qué hace

- **Tarjetas de crédito**: límite, usado y disponible; día de corte y de pago; pago para no generar intereses y pago mínimo.
- **Estado de cuenta real**: capturas lo que dice el banco y la app usa esa cifra; la diferencia se puede registrar como gasto sin identificar.
- **Compras a meses**: sin intereses o con intereses (con IVA), avance de mensualidades, liquidación anticipada.
- **Suscripciones y cargos fijos**: historial de precios, cancelación desde un mes, cargos anuales.
- **Cuentas** de débito, efectivo y ahorro, con transferencias.
- **Presupuestos** por categoría y **metas de ahorro**.
- **Simulador** de compras y **mejor tarjeta para comprar hoy**.
- Importar estados de cuenta (CSV/PDF), exportar a Excel, calendario de pagos y captura rápida con Claude.

## Correr en local

Requiere Node.js 22 o más nuevo.

```bash
npm install
cp .env.example .env
npm run dev        # crea la base de datos y abre http://localhost:3000
npm test           # pruebas de la lógica financiera
```

Los datos quedan en `data/lanita.db` (SQLite).

## Publicar en internet

1. Crea una base de datos en [Turso](https://turso.tech) y pon `DATABASE_URL` (libsql://…) y `DATABASE_AUTH_TOKEN` en las variables del proyecto.
2. Define `APP_PASSWORD` (tu contraseña) y `APP_SECRET` (un texto largo y aleatorio, por ejemplo el resultado de `openssl rand -base64 32`). Sin `APP_PASSWORD` la app publicada no deja entrar a nadie.
3. Despliega en Vercel u otro hosting de Next.js. `npm run build` aplica las migraciones.

## Inicio de sesión

Es una app de una sola persona: entras con la contraseña de `APP_PASSWORD` y el navegador queda recordado 30 días (botón **Salir** para cerrar sesión). Cambiar `APP_PASSWORD` o `APP_SECRET` cierra todas las sesiones abiertas. Después de 5 intentos fallidos hay que esperar 15 minutos. En local, si dejas `APP_PASSWORD` vacía, entras sin contraseña.

## Estructura

- `src/lib/finance.ts`: toda la lógica financiera (pura, con pruebas en `finance.test.ts`).
- `src/db/schema.ts`: tablas (Drizzle + libSQL). Montos en centavos.
- `src/app/actions.ts`: guardar, editar y borrar (Server Actions).
- `src/app/*/page.tsx`: las pantallas (`/cards`, `/installments`, `/transactions`, `/subscriptions`, `/accounts`, `/budgets`, `/goals`, `/simulator`).
- `src/proxy.ts` y `src/lib/session.ts`: el candado de inicio de sesión; la pantalla está en `src/app/login`.
- `src/components/`: piezas compartidas de la interfaz (formularios, diálogos, avisos).
- `artifact/`: la primera versión de la app como página de claude.ai.
