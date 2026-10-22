"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function HideOnLogin({ children }: { children: ReactNode }) {
  return usePathname() === "/login" ? null : <>{children}</>;
}
