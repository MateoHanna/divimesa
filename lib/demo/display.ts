/** Las mesas ocultas de la demo se numeran desde 1001; quien prueba ve siempre "Mesa 4". */
export const DEMO_TABLE_FROM = 1001;
export function displayTableNumber(n: number): number {
  return n >= DEMO_TABLE_FROM ? 4 : n;
}
