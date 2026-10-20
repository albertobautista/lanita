"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { Result } from "@/app/actions";
import { useCloseDialog } from "./Dialog";
import { useToast } from "./Toast";

type FormAction = (prev: Result | null, fd: FormData) => Promise<Result>;

/** A form wired to a Server Action: shows the error, toasts on success and closes its dialog. */
export function ActionForm({ action, children, submitLabel = "Guardar", resetOnSuccess = true }: { action: FormAction; children: ReactNode; submitLabel?: string; resetOnSuccess?: boolean }) {
  const [state, dispatch, pending] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  const close = useCloseDialog();
  const toast = useToast();

  useEffect(() => {
    if (!state?.ok) return;
    if (state.message) toast(state.message);
    if (resetOnSuccess) form.current?.reset();
    close();
  }, [state, close, toast, resetOnSuccess]);

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        // Skip React's automatic reset: on error, what was typed stays in the form.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      {children}
      {state?.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
