import { DbError } from "./queries";

/** Número de SINPE Móvil: 8 dígitos. Acepta espacios y guion ("8888-7777"). Vacío = quitarlo. */
export function normalizeSinpeNumber(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (digits === "") return null;
  if (!/^\d{8}$/.test(digits)) throw new DbError("invalid_sinpe_number");
  return digits;
}

/** Nombre del titular tal como sale en el banco. Vacío = quitarlo. */
export function normalizeSinpeHolder(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name === "") return null;
  if (name.length < 2 || name.length > 80) throw new DbError("invalid_sinpe_holder");
  return name;
}
