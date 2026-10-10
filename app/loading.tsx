export default function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="flex min-h-dvh items-center justify-center">
      <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
