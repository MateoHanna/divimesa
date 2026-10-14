import type { ClientState, PayMethod } from "./types";

/**
 * Orden en pantalla: SINPE Móvil, después tarjeta con el datáfono del restaurante. Apple Pay y Google Pay en
 * línea son simulaciones que solo existen en la demo.
 * La tarjeta en línea ('card') ya no se muestra: escribir el número en el celular es más lento que pedir el
 * datáfono. La base todavía la acepta en la demo, pero ninguna pantalla la ofrece.
 */
const ORDER: PayMethod[] = ["sinpe", "terminal", "apple_pay", "google_pay"];

/** Los métodos que el restaurante ofrece, en el orden de pantalla. Ignora los que no conocemos. */
export function orderedMethods(methods: readonly PayMethod[]): PayMethod[] {
  return ORDER.filter((m) => methods.includes(m));
}

/** Tarjeta, Apple Pay y Google Pay en línea se muestran como "Próximamente": todavía no hay pasarela real. */
export function isComingSoon(method: PayMethod): boolean {
  return method !== "sinpe" && method !== "terminal";
}

/** SINPE y datáfono no pasan por una pasarela: el pago queda por confirmar y lo resuelve el salonero. */
export function confirmedByStaff(method: PayMethod): method is "sinpe" | "terminal" {
  return method === "sinpe" || method === "terminal";
}

/**
 * El botón de la demo "Marcar «Recibido» (o «Cobrado») como salonero" solo aparece en la página de demo Y con el número
 * de prueba. Un restaurante real nunca lo muestra (y el servidor además lo rechaza).
 */
export function canDemoConfirm(state: Pick<ClientState, "restaurant">, demoPage: boolean): boolean {
  return demoPage && state.restaurant.sinpe?.test === true;
}
