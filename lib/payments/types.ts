// Interfaz común de las pasarelas de pago. Cualquier proveedor real (Tilopay, ONVO, TeleDólar, el banco)
// se conecta implementando esto; el resto del flujo no cambia.
export interface CreateCheckoutInput {
  paymentId: string;
  /** Colones, entero. Es el monto calculado por el servidor, sin propina. */
  amount: number;
  currency: "CRC";
  description: string;
  /** Dónde vuelve el cliente al terminar o cancelar (siempre APP_URL, nunca la URL de un deploy). */
  returnUrl: string;
}

export interface PaymentProvider {
  id: string;
  createCheckout(p: CreateCheckoutInput): Promise<{ redirectUrl: string; providerRef: string }>;
  /** Valida la firma del webhook y devuelve qué pasó. Lanza si la firma no es válida. */
  parseWebhook(req: Request): Promise<{ providerRef: string; status: "paid" | "failed" }>;
}
