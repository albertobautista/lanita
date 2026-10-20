"use client";

import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

export function LogoutButton() {
  if (usePathname() === "/login") return null;
  return (
    <form action={logout}>
      <button className="btn ghost sm">Salir</button>
    </form>
  );
}
