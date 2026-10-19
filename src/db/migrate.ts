import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL ?? "file:./data/lanita.db";
if (url.startsWith("file:")) mkdirSync("./data", { recursive: true });

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.execute("PRAGMA foreign_keys = ON");
console.log("Base de datos lista:", url.startsWith("file:") ? url : "remota");
client.close();
