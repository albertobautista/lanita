"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 3500);
    return () => clearTimeout(t);
  }, [text]);
  const show = useCallback((t: string) => setText(t), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {text && (
        <div className="toast" role="status">
          {text}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
