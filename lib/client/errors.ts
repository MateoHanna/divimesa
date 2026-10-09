// Códigos de error de las funciones SQL de la fase 3 y su mensaje para el cliente (trato de usted).
const ERRORS: Record<string, { status: number; message: string }> = {
  table_not_found: { status: 404, message: "Este código QR no es válido." },
  bill_not_open: { status: 409, message: "Esta mesa ya no tiene una cuenta abierta." },
  invalid_session: { status: 400, message: "No se pudo identificar su sesión. Recargue la página." },
  split_active: { status: 409, message: "La cuenta se está pagando en partes iguales." },
  item_not_found: { status: 404, message: "Ese plato ya no está en la cuenta." },
  item_not_pending: { status: 409, message: "Ese plato ya fue pagado." },
  item_reserved: { status: 409, message: "Otra persona está pagando ese plato." },
  already_split: { status: 409, message: "Ese plato ya está dividido." },
  invalid_parts: { status: 400, message: "Esa cantidad de personas no es válida." },
  invalid_quantity: { status: 400, message: "Eligió demasiados platos a la vez." },
  payments_in_progress: { status: 409, message: "Hay pagos en curso en la mesa. Espere un momento e intente de nuevo." },
  nothing_to_pay: { status: 409, message: "No hay saldo pendiente." },
  others_paying: { status: 409, message: "Otra persona está pagando el resto de la cuenta. Espere un momento." },
  no_split: { status: 409, message: "La cuenta todavía no está dividida en partes iguales." },
  no_parts_left: { status: 409, message: "Ya se pagaron todas las partes." },
  no_items_selected: { status: 400, message: "Elija al menos un plato." },
  invalid_method: { status: 400, message: "Elija un método de pago." },
  invalid_kind: { status: 400, message: "Tipo de pago no válido." },
  invalid_tip: { status: 400, message: "La propina no es válida." },
  payment_not_found: { status: 404, message: "No se encontró el pago." },
};

export interface ClientError { status: number; code: string; message: string }

export function mapClientError(raw: string | undefined | null): ClientError {
  const code = (raw ?? "").trim();
  const known = ERRORS[code];
  if (known) return { code, ...known };
  return { status: 500, code: "internal", message: "Ocurrió un error inesperado. Intente de nuevo." };
}
