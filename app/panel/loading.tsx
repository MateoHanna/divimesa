export default function Loading() {
  return (
    <div className="min-h-dvh bg-muted/40" aria-busy="true" aria-label="Cargando el panel">
      <div className="h-14 animate-pulse border-b bg-background" />
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
      </div>
    </div>
  );
}
