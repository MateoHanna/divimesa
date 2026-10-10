import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { displayTableNumber } from "./display";
import { loadDemoTable } from "./table";
import { hashIp, ipFromRequest } from "./visit";

const TOKEN = "T".repeat(32);
const REAL_TOKEN = "R".repeat(32);

const restaurant = (isDemo: boolean) => ({ name: isDemo ? "Restaurante Demo" : "La Soda Real", primary_color: "#d91e18", service_rate: 0.1, vat_rate: 0.13, prices_include_taxes: false, is_demo: isDemo });

/** Base de datos de mentira: cada consulta devuelve las filas de su tabla, filtradas por los .eq(). */
function fakeDb(data: Record<string, Record<string, unknown>[]>): SupabaseClient {
  const from = (name: string) => {
    let rows = data[name] ?? [];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return q; },
      in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q; },
      returns: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const world = {
  tables: [
    { id: "t-demo", number: 1001, qr_token: TOKEN, restaurants: restaurant(true) },
    { id: "t-real", number: 3, qr_token: REAL_TOKEN, restaurants: restaurant(false) },
  ],
  bills: [
    { id: "b-demo", table_id: "t-demo", status: "open", paid_amount: 0, split_mode: null, split_parts: null, split_share_amount: null, split_paid_parts: 0, opened_at: "2026-10-10T10:00:00Z", paid_at: null },
    { id: "b-real", table_id: "t-real", status: "open", paid_amount: 0, split_mode: null, split_parts: null, split_share_amount: null, split_paid_parts: 0, opened_at: "2026-10-10T10:00:00Z", paid_at: null },
  ],
  bill_items: [
    { id: "i1", bill_id: "b-demo", name: "Casado", unit_price: 5500, quantity: 1, status: "pending", reserved_until: null, created_at: "2026-10-10T10:00:00Z" },
    { id: "i2", bill_id: "b-real", name: "Plato secreto", unit_price: 9000, quantity: 1, status: "pending", reserved_until: null, created_at: "2026-10-10T10:00:00Z" },
  ],
  payments: [] as Record<string, unknown>[],
};

describe("demo pública: vista de solo lectura", () => {
  it("responde la mesa de un restaurante de demostración", async () => {
    const view = await loadDemoTable(fakeDb(world), TOKEN);
    expect(view?.table.bill?.lines.map((l) => l.name)).toEqual(["Casado"]);
    expect(view?.channel).toBe("table:t-demo");
  });
  it("para un restaurante real devuelve null (la ruta responde 404)", async () => {
    expect(await loadDemoTable(fakeDb(world), REAL_TOKEN)).toBeNull();
  });
  it("un token que no existe o mal formado devuelve null", async () => {
    expect(await loadDemoTable(fakeDb(world), "X".repeat(32))).toBeNull();
    expect(await loadDemoTable(fakeDb(world), "corto")).toBeNull();
  });
  it("un restaurante sin la marca is_demo nunca se expone, aunque falte el dato", async () => {
    const odd = { ...world, tables: [{ id: "t-x", number: 1, qr_token: TOKEN, restaurants: { ...restaurant(true), is_demo: undefined } }] };
    expect(await loadDemoTable(fakeDb(odd), TOKEN)).toBeNull();
  });
});

describe("ruta GET /api/demo/mesa/[token]", () => {
  it("200 para la demo, 404 para un restaurante real y sin filtrar sus datos", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({ getAdminClient: () => fakeDb(world) }));
    const { GET } = await import("../../app/api/demo/mesa/[token]/route");
    const ok = await GET(new Request("http://x/api"), { params: Promise.resolve({ token: TOKEN }) });
    expect(ok.status).toBe(200);
    const real = await GET(new Request("http://x/api"), { params: Promise.resolve({ token: REAL_TOKEN }) });
    expect(real.status).toBe(404);
    expect(JSON.stringify(await real.json())).not.toContain("Plato secreto");
    vi.doUnmock("@/lib/supabase/server");
  });
});

describe("visitas de la demo", () => {
  it("el hash de la IP es estable, no contiene la IP y cambia con otra IP", () => {
    const a = hashIp("190.10.20.30", "secreto");
    expect(a).toBe(hashIp("190.10.20.30", "secreto"));
    expect(a).not.toContain("190");
    expect(a).not.toBe(hashIp("190.10.20.31", "secreto"));
    expect(a).not.toBe(hashIp("190.10.20.30", "otro"));
    expect(a).toHaveLength(64);
  });
  it("toma la primera IP de x-forwarded-for", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(ipFromRequest(req)).toBe("1.2.3.4");
  });
  it("las mesas ocultas se muestran como Mesa 4", () => {
    expect(displayTableNumber(1001)).toBe(4);
    expect(displayTableNumber(1337)).toBe(4);
    expect(displayTableNumber(7)).toBe(7);
  });
});
