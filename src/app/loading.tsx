/** Shown right away while a section loads: grey shapes where the title, figures and lists will be. */
export default function Loading() {
  return (
    <div className="skeleton" role="status" aria-label="Cargando">
      <div className="row between">
        <i style={{ width: 180, height: 34 }} />
        <i style={{ width: 200, height: 40, borderRadius: 999 }} />
      </div>
      <i style={{ height: 120 }} />
      <i style={{ height: 220 }} />
      <div className="grid2">
        <i style={{ height: 180 }} />
        <i style={{ height: 180 }} />
      </div>
    </div>
  );
}
