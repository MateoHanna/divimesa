/** "88887777" -> "8888-7777". Cualquier otra cosa se devuelve igual. */
export function formatSinpeNumber(n: string): string {
  return /^\d{8}$/.test(n) ? `${n.slice(0, 4)}-${n.slice(4)}` : n;
}

/** Texto para copiar el monto en la app del banco: solo dígitos. */
export function plainAmount(n: number): string {
  return String(Math.round(n));
}
