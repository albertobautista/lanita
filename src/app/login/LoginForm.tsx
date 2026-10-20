"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
      </div>
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn primary" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
