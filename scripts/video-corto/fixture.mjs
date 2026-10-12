// Datos de la grabación: solo tocan el restaurante de demostración (is_demo). Al final, reset_demo lo deja como estaba.
// Los pagos se crean con las mismas funciones que usa la app (client_*), una persona por sesión.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const MESAS = [
  // [mesa, total, minutos abierta]
  [1, 38700, 125],
  [2, 24300, 45],
  [3, 52100, 80],
  [4, 68400, 100],
  [5, 15800, 25],
  [6, 41250, 115],
  [7, 29900, 65],
  [8, 33500, 35],
];
export const PERSONAS = 6;
export const PARTE = 11400; // 68 400 / 6

export function adminClient(env = process.env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** Deja la demo con 8 mesas abiertas: cuentas de solo total y horas de apertura de hace un rato. */
export async function prepararMesas(sb) {
  const demo = must(await sb.from("restaurants").select("id").eq("is_demo", true).single(), "restaurante demo");
  must(await sb.rpc("reset_demo"), "reset_demo");
  const tables = must(await sb.from("tables").select("id,number,qr_token").eq("restaurant_id", demo.id), "mesas");
  const ids = tables.map((t) => t.id);
  must(await sb.from("bills").delete().in("table_id", ids), "borrar cuentas");
  const now = Date.now();
  const rows = MESAS.map(([n, total, min]) => ({
    table_id: tables.find((t) => t.number === n).id, fixed_total: total, opened_at: new Date(now - min * 60000).toISOString(),
  }));
  must(await sb.from("bills").insert(rows), "abrir cuentas");
  const t4 = tables.find((t) => t.number === 4);
  return { restaurantId: demo.id, token4: t4.qr_token, tableId4: t4.id, tokens: Object.fromEntries(tables.map((t) => [t.number, t.qr_token])) };
}

/** Deshace lo que hizo la persona 1 en el celular: sin pagos y sin división en la mesa 4. */
export async function deshacerMesa4(sb, ctx) {
  const bill = must(await sb.from("bills").select("id").eq("table_id", ctx.tableId4).in("status", ["open", "paid"]).single(), "cuenta mesa 4");
  must(await sb.from("payments").delete().eq("bill_id", bill.id), "borrar pagos");
  must(await sb.from("bills").update({
    status: "open", paid_amount: 0, split_mode: null, split_parts: null, split_base_amount: null, split_share_amount: null,
    split_paid_parts: 0, split_started_at: null, paid_at: null,
  }).eq("id", bill.id), "reiniciar división");
  return bill.id;
}

export async function dividirMesa4(sb, ctx, parts = PERSONAS) {
  const s = `video-${randomUUID()}`;
  must(await sb.rpc("client_start_split", { p_token: ctx.token4, p_session: s, p_parts: parts }), "dividir");
}

/**
 * Deja listos los pagos de las 6 personas SIN que el panel los vea todavía: cada uno nace pendiente.
 * `revelarPago` los hace aparecer (SINPE: "Ya hice el SINPE"; Apple Pay o tarjeta: la pasarela de la demo los confirma).
 */
export async function prepararPagos(sb, ctx, metodos) {
  const out = [];
  for (const [i, metodo] of metodos.entries()) {
    const session = `video-${randomUUID()}`;
    const created = must(await sb.rpc("client_create_payment", {
      p_token: ctx.token4, p_session: session, p_mode: "equal", p_item_ids: null, p_method: metodo,
      p_tip_type: "percent", p_tip_value: 0, p_provider: "mock", p_invoice: null, p_amount: null,
    }), `crear pago ${metodo}`);
    if (!created.ok) throw new Error(`pago ${metodo} rechazado: ${created.code}`);
    out.push({ id: created.payment_id, session, metodo, nombre: `Persona ${i + 1}` });
  }
  return out;
}

export async function revelarPago(sb, p, { auto = false } = {}) {
  if (p.metodo === "sinpe") {
    must(await sb.rpc("client_report_sinpe", { p_payment_id: p.id, p_session: p.session, p_payer_name: p.nombre }), "reportar SINPE");
    // `auto`: el SINPE ya llegó al banco y queda confirmado de una vez (entra a la lista como línea con ✓, sin aviso).
    if (auto) must(await sb.rpc("panel_confirm_sinpe", { p_payment_id: p.id }), "confirmar SINPE");
  } else {
    must(await sb.rpc("settle_payment", { p_payment_id: p.id }), "confirmar pago");
  }
}

/** Una mesa que ya pagó completa desde el QR (tarjeta de la demo): queda "Pagada", sin pasar por datáfono. */
export async function marcarPagadaQR(sb, ctx, mesa, metodo = "card") {
  const bill = must(await sb.from("bills").select("id,table_id").eq("table_id", ctx.tableIds?.[mesa] ?? (await tableId(sb, ctx, mesa))).eq("status", "open").single(), `cuenta mesa ${mesa}`);
  const session = `video-${randomUUID()}`;
  const created = must(await sb.rpc("client_create_payment", {
    p_token: ctx.tokens[mesa], p_session: session, p_mode: "all", p_item_ids: null, p_method: metodo,
    p_tip_type: "percent", p_tip_value: 0, p_provider: "mock", p_invoice: null, p_amount: null,
  }), `crear pago mesa ${mesa}`);
  if (!created.ok) throw new Error(`pago mesa ${mesa} rechazado: ${created.code}`);
  must(await sb.rpc("settle_payment", { p_payment_id: created.payment_id }), `confirmar pago mesa ${mesa}`);
  return bill.id;
}

async function tableId(sb, ctx, mesa) {
  return must(await sb.from("tables").select("id").eq("restaurant_id", ctx.restaurantId).eq("number", mesa).single(), `mesa ${mesa}`).id;
}

export async function liberarMesa(sb, billId) {
  must(await sb.rpc("panel_release_table", { p_bill_id: billId }), "liberar mesa");
}

/** Al terminar: la demo vuelve a su estado de siempre. */
export async function restaurarDemo(sb) {
  must(await sb.rpc("reset_demo"), "reset_demo");
}
