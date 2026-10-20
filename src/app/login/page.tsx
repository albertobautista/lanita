import type { Metadata } from "next";
import { isAuthEnabled, safeNextPath } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <section className="panel" style={{ maxWidth: 380, width: "100%", margin: "8vh auto 0" }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h2>Entrar a Lanita</h2>
        <p className="muted small">Escribe tu contraseña para ver tus finanzas.</p>
      </div>
      {isAuthEnabled() ? (
        <LoginForm next={safeNextPath(next)} />
      ) : (
        <p className="banner">
          La app no tiene contraseña. Define <code>APP_PASSWORD</code> y <code>APP_SECRET</code> en las variables del servidor y vuelve a desplegar.
        </p>
      )}
    </section>
  );
}
