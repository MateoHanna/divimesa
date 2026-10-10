export default function Loading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg animate-pulse flex-col gap-4 px-4" aria-busy="true" aria-label="Cargando el pago">
      <div className="-mx-4 h-20 bg-muted" />
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-40 rounded-2xl bg-muted" />
      <div className="h-16 rounded-2xl bg-muted" />
    </div>
  );
}
