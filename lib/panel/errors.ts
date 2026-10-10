// Códigos de error de las funciones SQL (supabase/migrations/..0004) y su traducción para el salonero.
const ERRORS: Record<string, { status: number; message: string }> = {
  bill_not_found: { status: 404, message: "La cuenta ya no existe." },
  bill_not_open: { status: 409, message: "La cuenta ya no está abierta." },
  bill_not_paid: { status: 409, message: "La cuenta todavía no está pagada." },
  split_active: { status: 409, message: "La cuenta está en partes iguales. Cancelá las partes iguales para cambiar los platos." },
  no_split: { status: 409, message: "La cuenta no está dividida en partes iguales." },
  item_not_found: { status: 404, message: "Ese plato ya no está en la cuenta." },
  item_not_pending: { status: 409, message: "Ese plato ya fue pagado o anulado." },
  item_reserved: { status: 409, message: "Un cliente está pagando ese plato desde su celular. Probá en un momento." },
  logo_missing: { status: 400, message: "Elegí una imagen para el logo." },
  logo_too_big: { status: 400, message: "El logo pesa más de 1 MB. Probá con una imagen más liviana." },
  logo_type: { status: 400, message: "El logo tiene que ser PNG, JPG o WebP." },
  not_split: { status: 409, message: "Ese plato no está dividido." },
  split_group_paid: { status: 409, message: "Ya se pagó una de las partes. No se puede deshacer la división." },
  split_group_modified: { status: 409, message: "Las partes del plato ya no son iguales. No se puede deshacer la división." },
  already_split: { status: 409, message: "Ese plato ya está dividido." },
  menu_item_not_found: { status: 404, message: "Ese plato no está en el menú." },
  invalid_quantity: { status: 400, message: "La cantidad debe estar entre 1 y 20." },
  invalid_method: { status: 400, message: "Forma de pago inválida." },
  invalid_kind: { status: 400, message: "Tipo de pago inválido." },
  invalid_amount: { status: 400, message: "El monto no es válido." },
  amount_exceeds_balance: { status: 409, message: "El monto es mayor al saldo pendiente." },
  nothing_to_pay: { status: 409, message: "No hay nada pendiente de pago." },
  no_items_selected: { status: 400, message: "Elegí al menos un plato." },
  duplicate_items: { status: 400, message: "Hay platos repetidos en la selección." },
  total_below_paid: { status: 409, message: "Con ese cambio el total quedaría por debajo de lo que ya se pagó." },
  table_not_found: { status: 404, message: "La mesa no existe." },
  table_has_bill: { status: 409, message: "Esa mesa ya tiene una cuenta abierta." },
  payment_not_found: { status: 404, message: "No se encontró el pago." },
};

export interface MappedError { status: number; code: string; message: string }

/** Traduce el mensaje de error de Postgres/PostgREST. Lo que no se reconoce no se muestra tal cual. */
export function mapDbError(raw: string | undefined | null): MappedError {
  const code = (raw ?? "").trim();
  const known = ERRORS[code];
  if (known) return { code, ...known };
  return { status: 500, code: "internal", message: "Ocurrió un error inesperado. Probá de nuevo." };
}
