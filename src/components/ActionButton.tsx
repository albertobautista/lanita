"use client";

import { useTransition, type ReactNode } from "react";
import type { Result } from "@/app/actions";
import { useToast } from "./Toast";

/** A button that runs a Server Action already bound to its id (delete, reactivate…). */
export function ActionButton({ action, children, confirm, className = "btn ghost sm" }: { action: () => Promise<Result>; children: ReactNode; confirm?: string; className?: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          toast(r.ok ? (r.message ?? "Listo") : (r.error ?? "No se pudo"));
        });
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
