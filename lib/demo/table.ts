import type { SupabaseClient } from "@supabase/supabase-js";

import { TOKEN_RE } from "@/lib/client/queries";
import { buildBill, tableStatus, type BillRow, type ItemRow, type PaymentRow, type PaymentItemRow, type RestaurantRow } from "@/lib/panel/state";
import type { PanelTable } from "@/lib/panel/types";

export interface DemoTableView {
  restaurant: { name: string; primaryColor: string };
  table: PanelTable;
  /** Canal de Realtime de la mesa (el mismo que usa la página del cliente). */
  channel: string;
}

type TableLookup = {
  id: string;
  number: number;
  restaurants: (RestaurantRow & { is_demo: boolean }) | (RestaurantRow & { is_demo: boolean })[] | null;
};

/**
 * Vista de solo lectura de una mesa, para la demo pública. SOLO responde mesas de restaurantes con
 * `is_demo`: para un restaurante real (o un token que no existe) devuelve null y la ruta responde 404.
 */
export async function loadDemoTable(db: SupabaseClient, token: string, now: Date = new Date()): Promise<DemoTableView | null> {
  if (!TOKEN_RE.test(token)) return null;
  const found = await db.from("tables")
    .select("id,number,restaurants(name,primary_color,service_rate,vat_rate,prices_include_taxes,is_demo)")
    .eq("qr_token", token).maybeSingle<TableLookup>();
  if (found.error || !found.data) return null;
  const restaurant = Array.isArray(found.data.restaurants) ? found.data.restaurants[0] : found.data.restaurants;
  if (!restaurant || restaurant.is_demo !== true) return null;

  const tableId = found.data.id;
  const bills = await db.from("bills")
    .select("id,table_id,status,paid_amount,split_mode,split_parts,split_share_amount,split_paid_parts,opened_at,paid_at")
    .eq("table_id", tableId).in("status", ["open", "paid"]).returns<BillRow[]>();
  const bill = bills.data?.[0] ?? null;

  let table: PanelTable;
  if (!bill) {
    table = { id: tableId, number: found.data.number, status: "free", bill: null };
  } else {
    const [items, payments] = await Promise.all([
      db.from("bill_items").select("id,bill_id,name,unit_price,quantity,status,reserved_until,created_at,split_group_id")
        .eq("bill_id", bill.id).returns<ItemRow[]>(),
      db.from("payments").select("id,bill_id,amount,tip_amount,overpaid_amount,method,source,kind,status,paid_at,created_at")
        .eq("bill_id", bill.id).returns<PaymentRow[]>(),
    ]);
    const paidItemPayments = (payments.data ?? []).filter((p) => p.kind === "items" && p.status === "paid").map((p) => p.id);
    const links = paidItemPayments.length > 0
      ? await db.from("payment_items").select("payment_id,bill_item_id").in("payment_id", paidItemPayments).returns<PaymentItemRow[]>()
      : { data: [] as PaymentItemRow[] };
    const built = buildBill(bill, items.data ?? [], payments.data ?? [], restaurant, now, links.data ?? []);
    table = { id: tableId, number: found.data.number, status: tableStatus(built), bill: built };
  }
  return { restaurant: { name: restaurant.name, primaryColor: restaurant.primary_color }, table, channel: `table:${tableId}` };
}
