import { getAdminClient } from "@/lib/supabase/server";

import { buildPanelState, type BillRow, type ItemRow, type MenuRow, type PaymentRow, type RestaurantRow, type TableRow } from "./state";
import type { PanelState } from "./types";

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new DbError(res.error.message);
  return res.data as T;
}

export class DbError extends Error {}

/** Llama a una función SQL del panel; el mensaje de la excepción es el código de error. */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await getAdminClient().rpc(name, args);
  if (res.error) throw new DbError(res.error.message);
  return res.data as T;
}

/** Foto completa del restaurante para el panel (una sola consulta por tabla, sin N+1). */
export async function loadPanelState(now: Date = new Date()): Promise<PanelState> {
  const db = getAdminClient();
  const restaurant = check(
    await db.from("restaurants").select("id,name,primary_color,service_rate,vat_rate,prices_include_taxes")
      .order("created_at").limit(1).single<RestaurantRow & { id: string }>(),
  );
  const [tables, menu] = await Promise.all([
    db.from("tables").select("id,number").eq("restaurant_id", restaurant.id).returns<TableRow[]>(),
    db.from("menu_items").select("id,name,category,price,sort_order").eq("restaurant_id", restaurant.id)
      .eq("active", true).returns<MenuRow[]>(),
  ]);
  const tableRows = check(tables);
  const bills = check(
    await db.from("bills")
      .select("id,table_id,status,paid_amount,split_mode,split_parts,split_share_amount,split_paid_parts,opened_at,paid_at")
      .in("table_id", tableRows.map((t) => t.id)).in("status", ["open", "paid"]).returns<BillRow[]>(),
  );
  const billIds = bills.map((b) => b.id);
  let items: ItemRow[] = [];
  let payments: PaymentRow[] = [];
  if (billIds.length > 0) {
    const [i, p] = await Promise.all([
      db.from("bill_items").select("id,bill_id,name,unit_price,quantity,status,reserved_until,created_at")
        .in("bill_id", billIds).returns<ItemRow[]>(),
      db.from("payments").select("id,bill_id,amount,tip_amount,overpaid_amount,method,source,kind,status,paid_at,created_at")
        .in("bill_id", billIds).returns<PaymentRow[]>(),
    ]);
    items = check(i);
    payments = check(p);
  }
  return buildPanelState({ restaurant, tables: tableRows, bills, items, payments, menu: check(menu), now });
}

/** Token de QR de una mesa por número. Solo para la página protegida del QR. */
export async function loadTableToken(number: number): Promise<{ token: string; number: number; restaurant: string } | null> {
  const db = getAdminClient();
  const { data } = await db.from("tables").select("number,qr_token,restaurants(name)").eq("number", number)
    .limit(1).maybeSingle<{ number: number; qr_token: string; restaurants: { name: string } | { name: string }[] | null }>();
  if (!data) return null;
  const r = Array.isArray(data.restaurants) ? data.restaurants[0] : data.restaurants;
  return { token: data.qr_token, number: data.number, restaurant: r?.name ?? "" };
}
