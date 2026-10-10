import type { ClientState, PayMethod } from "./types";

/** Orden en pantalla: SINPE Móvil primero. Los demás son simulaciones que solo existen en la demo. */
const ORDER: PayMethod[] = ["sinpe", "card", "apple_pay", "google_pay"];

/** Los métodos que el restaurante ofrece, en el orden de pantalla. Ignora los que no conocemos. */
export function orderedMethods(methods: readonly PayMethod[]): PayMethod[] {
  return ORDER.filter((m) => methods.includes(m));
}

/** Tarjeta, Apple Pay y Google Pay se muestran como "Próximamente": todavía no hay pasarela real. */
export function isComingSoon(method: PayMethod): boolean {
  return method !== "sinpe";
}

/**
 * El botón de la demo "Marcar «Recibido» como salonero" solo aparece en la página de demo Y con el número
 * de prueba. Un restaurante real nunca lo muestra (y el servidor además lo rechaza).
 */
export function canDemoConfirm(state: Pick<ClientState, "restaurant">, demoPage: boolean): boolean {
  return demoPage && state.restaurant.sinpe?.test === true;
}
