"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";

const CloseContext = createContext<() => void>(() => {});
export const useCloseDialog = () => useContext(CloseContext);

/** A button that opens a dialog; the form inside closes it after saving. */
export function Dialog({ trigger, title, className = "btn", children }: { trigger: ReactNode; title: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog ref={ref} aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="iconbtn" aria-label="Cerrar" onClick={close}>
            ×
          </button>
        </header>
        <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
      </dialog>
    </>
  );
}
