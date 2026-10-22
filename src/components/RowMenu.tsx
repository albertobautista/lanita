"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * The "⋯" button that holds a row's actions (edit, delete…).
 * The menu stays mounted while hidden (visibility, not unmount) so the dialogs its items open keep working,
 * and it is positioned `fixed` so scrollable tables don't clip it.
 */
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Below the button, or above it when it doesn't fit; follows the button while the page scrolls.
  const place = () => {
    if (!button.current || !menu.current) return;
    const r = button.current.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const fitsBelow = r.bottom + 4 + menu.current.offsetHeight <= window.innerHeight;
    setPos(fitsBelow ? { top: r.bottom + 4, right } : { bottom: window.innerHeight - r.top + 4, right });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <div className="rowmenu" ref={root}>
      <button ref={button} type="button" className="iconbtn" aria-label={`Acciones de ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      <div
        ref={menu}
        className="menu"
        role="menu"
        data-open={open}
        style={pos}
        onClick={(e) => {
          // Any item closes the menu; clicks inside an open dialog land here too and are harmless.
          if ((e.target as HTMLElement).closest(".menuitem")) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
