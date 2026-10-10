export default function Loading() {
  return (
    <div className="grid min-h-dvh animate-pulse grid-cols-1 gap-6 bg-slate-100 p-6 lg:grid-cols-[400px_1fr]" aria-busy="true" aria-label="Cargando la demo">
      <div className="mx-auto h-[640px] w-[396px] max-w-full rounded-[3rem] bg-slate-300" />
      <div className="h-[640px] rounded-2xl bg-slate-200" />
    </div>
  );
}
