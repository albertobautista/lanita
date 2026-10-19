CREATE TABLE `aportaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`meta_id` text NOT NULL,
	`fecha` text NOT NULL,
	`monto` integer NOT NULL,
	`cuenta_id` text,
	`ejemplo` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`meta_id`) REFERENCES `metas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `compras` (
	`id` text PRIMARY KEY NOT NULL,
	`tarjeta_id` text NOT NULL,
	`descripcion` text NOT NULL,
	`categoria` text DEFAULT 'Otros' NOT NULL,
	`monto` integer NOT NULL,
	`meses` integer NOT NULL,
	`fecha` text NOT NULL,
	`tasa_anual` integer DEFAULT 0 NOT NULL,
	`con_iva` integer DEFAULT true NOT NULL,
	`liquidada_periodo` text,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tarjeta_id`) REFERENCES `tarjetas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `compras_tarjeta` ON `compras` (`tarjeta_id`);--> statement-breakpoint
CREATE TABLE `cuentas` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`tipo` text NOT NULL,
	`saldo_inicial` integer DEFAULT 0 NOT NULL,
	`color` text NOT NULL,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `estados_cuenta` (
	`id` text PRIMARY KEY NOT NULL,
	`tarjeta_id` text NOT NULL,
	`periodo` text NOT NULL,
	`pago_no_intereses` integer NOT NULL,
	`pago_minimo` integer,
	`notas` text DEFAULT '' NOT NULL,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tarjeta_id`) REFERENCES `tarjetas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estado_tarjeta_periodo` ON `estados_cuenta` (`tarjeta_id`,`periodo`);--> statement-breakpoint
CREATE TABLE `metas` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`objetivo` integer NOT NULL,
	`fecha_objetivo` text,
	`color` text NOT NULL,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movimientos` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`fecha` text NOT NULL,
	`monto` integer NOT NULL,
	`categoria` text NOT NULL,
	`descripcion` text DEFAULT '' NOT NULL,
	`cuenta_id` text,
	`tarjeta_id` text,
	`recurrente_id` text,
	`periodo` text,
	`origen` text DEFAULT 'manual' NOT NULL,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tarjeta_id`) REFERENCES `tarjetas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurrente_id`) REFERENCES `recurrentes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mov_fecha` ON `movimientos` (`fecha`);--> statement-breakpoint
CREATE UNIQUE INDEX `mov_recurrente_periodo` ON `movimientos` (`recurrente_id`,`periodo`);--> statement-breakpoint
CREATE TABLE `pagos_tarjeta` (
	`id` text PRIMARY KEY NOT NULL,
	`tarjeta_id` text NOT NULL,
	`periodo` text NOT NULL,
	`monto` integer NOT NULL,
	`fecha` text NOT NULL,
	`cuenta_id` text,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tarjeta_id`) REFERENCES `tarjetas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pago_tarjeta_periodo` ON `pagos_tarjeta` (`tarjeta_id`,`periodo`);--> statement-breakpoint
CREATE TABLE `presupuestos` (
	`id` text PRIMARY KEY NOT NULL,
	`categoria` text NOT NULL,
	`monto` integer NOT NULL,
	`ejemplo` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presupuestos_categoria_unique` ON `presupuestos` (`categoria`);--> statement-breakpoint
CREATE TABLE `recurrente_precios` (
	`id` text PRIMARY KEY NOT NULL,
	`recurrente_id` text NOT NULL,
	`desde` text NOT NULL,
	`monto` integer NOT NULL,
	FOREIGN KEY (`recurrente_id`) REFERENCES `recurrentes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `precio_por_periodo` ON `recurrente_precios` (`recurrente_id`,`desde`);--> statement-breakpoint
CREATE TABLE `recurrentes` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`es_suscripcion` integer DEFAULT false NOT NULL,
	`descripcion` text NOT NULL,
	`categoria` text NOT NULL,
	`frecuencia` text DEFAULT 'mensual' NOT NULL,
	`dia` integer NOT NULL,
	`mes_anual` integer,
	`cuenta_id` text,
	`tarjeta_id` text,
	`desde` text NOT NULL,
	`hasta` text,
	`cancelada_en` text,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tarjeta_id`) REFERENCES `tarjetas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tarjetas` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`banco` text DEFAULT '' NOT NULL,
	`ultimos4` text DEFAULT '' NOT NULL,
	`limite` integer NOT NULL,
	`corte` integer NOT NULL,
	`pago` integer NOT NULL,
	`color` text NOT NULL,
	`min_pct_saldo` integer DEFAULT 150 NOT NULL,
	`min_pct_limite` integer DEFAULT 125 NOT NULL,
	`tasa_anual` integer DEFAULT 0 NOT NULL,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transferencias` (
	`id` text PRIMARY KEY NOT NULL,
	`origen_id` text NOT NULL,
	`destino_id` text NOT NULL,
	`monto` integer NOT NULL,
	`fecha` text NOT NULL,
	`descripcion` text DEFAULT '' NOT NULL,
	`ejemplo` integer DEFAULT false NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`origen_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destino_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
