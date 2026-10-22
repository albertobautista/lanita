import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { Nav } from "@/components/Nav";
import { QuickAdd } from "@/components/QuickAdd";
import { SampleBanner } from "@/components/SampleBanner";
import { ToastProvider } from "@/components/Toast";
import { isAuthEnabled } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lanita", template: "%s · Lanita" },
  description: "Tus tarjetas, compras a meses, ingresos y gastos en un solo lugar.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Public+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <ToastProvider>
          <div className="wrap">
            <div className="row between">
              <Link href="/" className="brand">
                Lanita
              </Link>
              <div className="row">
                <QuickAdd />
                {isAuthEnabled() && <LogoutButton />}
              </div>
            </div>
            <Nav />
            <main style={{ display: "grid", gap: 24 }}>
              <SampleBanner />
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
