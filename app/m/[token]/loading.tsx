export default function Loading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg animate-pulse flex-col gap-4 px-4 pt-5" aria-busy="true">
      <div className="h-16 rounded-xl bg-muted" />
      <div className="h-64 rounded-2xl bg-muted" />
      <div className="h-16 rounded-2xl bg-muted" />
      <div className="h-16 rounded-2xl bg-muted" />
    </div>
  );
}
