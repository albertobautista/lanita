import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="panel">
      <EmptyState title="No encontramos esta página">
        <Link href="/">Volver al resumen</Link>
      </EmptyState>
    </section>
  );
}
