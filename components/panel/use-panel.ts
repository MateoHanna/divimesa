"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useBroadcast } from "@/components/realtime/use-broadcast";
import { formatCRC } from "@/lib/money";
import { panelEvents } from "@/lib/panel/events";
import type { PanelState } from "@/lib/panel/types";

import { alarm, beep, chime } from "./sound";
import { METHOD_LABEL } from "./status";

const POLL_MS = 3000;
const NOTICE_MS = 5000;
const ERROR_MS = 6000;
const BLINK_MS = 4000;
const BLINK_PAID_MS = 5500;

export interface Notice {
  id: number;
  kind: "info" | "error" | "payment" | "paid" | "sinpe";
  text: string;
  /** Se queda hasta que el salonero lo toque (mesa pagada completa). */
  sticky?: boolean;
  tableId?: string;
  billId?: string;
  /** Aviso de SINPE por confirmar: el pago al que responden los botones. */
  paymentId?: string;
}

const REMIND_MS = 20_000;

/**
 * Estado del panel: Realtime avisa al instante y una consulta cada 3 s (solo con la pestaña visible)
 * queda de respaldo. Cada pago nuevo hace sonar un pitido y un aviso de 5 s con la mesa, el monto y el
 * método; cuando una mesa paga completo suena otra campanita y el aviso espera al toque del salonero.
 */
export function usePanel(onUnauthorized: () => void) {
  const [state, setState] = useState<PanelState | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [flashing, setFlashing] = useState<ReadonlyMap<string, "payment" | "paid">>(new Map());
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const prev = useRef<PanelState | null>(null);
  const seq = useRef(0);
  const inflight = useRef(0); // acciones en curso: no pisar su respuesta con una consulta vieja

  const dismiss = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);

  const notify = useCallback((kind: Notice["kind"], text: string, extra: Partial<Notice> = {}) => {
    const id = ++seq.current;
    setNotices((n) => [...n.filter((x) => x.sticky), ...n.filter((x) => !x.sticky).slice(-2), { id, kind, text, ...extra }]);
    if (!extra.sticky) setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), kind === "error" ? ERROR_MS : NOTICE_MS);
  }, []);

  const blink = useCallback((tableId: string, kind: "payment" | "paid") => {
    setFlashing((m) => new Map(m).set(tableId, kind));
    setTimeout(() => setFlashing((m) => {
      if (m.get(tableId) !== kind) return m;
      const n = new Map(m);
      n.delete(tableId);
      return n;
    }), kind === "paid" ? BLINK_PAID_MS : BLINK_MS);
  }, []);

  const apply = useCallback(
    (next: PanelState) => {
      const ev = panelEvents(prev.current, next);
      let rang = false;
      for (const p of ev.payments) {
        const detail = `${formatCRC(p.amount + p.tip)} · ${METHOD_LABEL[p.method] ?? p.method}`;
        if (p.completed) {
          if (!rang) chime();
          rang = true;
          notify("paid", `Mesa ${p.tableNumber} pagó completo · ${detail}`, { sticky: true, tableId: p.tableId, billId: p.billId });
          blink(p.tableId, "paid");
        } else {
          if (!rang) beep();
          rang = true;
          notify("payment", `Mesa ${p.tableNumber} · ${detail}`, { tableId: p.tableId });
          blink(p.tableId, "payment");
        }
      }
      // SINPE por confirmar: alarma propia y aviso fijo hasta que el salonero responda.
      const sinpeNotice = (tableNumber: number, tableId: string, billId: string, paymentId: string, amount: number, code: string | null) =>
        notify("sinpe", `Mesa ${tableNumber} · SINPE por confirmar ${formatCRC(amount)}${code ? ` · ${code}` : ""}`, { sticky: true, tableId, billId, paymentId });
      if (prev.current === null) {
        // Primera lectura (se abrió el panel con SINPE esperando): avisos fijos, sin sonido.
        for (const t of next.tables) for (const p of t.bill?.pending ?? []) sinpeNotice(t.number, t.id, t.bill!.id, p.id, p.amount + p.tip, p.code);
      }
      if (ev.pending.length > 0) {
        alarm();
        rang = true;
        for (const e of ev.pending) {
          sinpeNotice(e.tableNumber, e.tableId, e.billId, e.paymentId, e.amount, e.code);
          blink(e.tableId, "payment");
        }
      }
      for (const t of ev.paidWithoutPayment) {
        if (!rang) chime();
        rang = true;
        notify("paid", `Mesa ${t.tableNumber} quedó pagada`, { sticky: true, tableId: t.tableId, billId: t.billId });
        blink(t.tableId, "paid");
      }
      // Un aviso fijo se quita solo si la mesa ya no está pagada (alguien la liberó desde otro lado).
      const paidIds = new Set(next.tables.filter((t) => t.status === "paid").map((t) => t.id));
      const pendingIds = new Set(next.tables.flatMap((t) => t.bill?.pending.map((p) => p.id) ?? []));
      setNotices((n) => n.filter((x) => !x.sticky || (x.kind === "sinpe" ? !!x.paymentId && pendingIds.has(x.paymentId) : !x.tableId || paidIds.has(x.tableId))));
      prev.current = next;
      setState(next);
    },
    [notify, blink],
  );

  const refresh = useCallback(async () => {
    if (inflight.current > 0) return;
    try {
      const res = await fetch("/api/panel/state", { cache: "no-store" });
      if (res.status === 401) return onUnauthorized();
      const json = (await res.json()) as { ok: boolean; state?: PanelState };
      if (json.ok && json.state && inflight.current === 0) apply(json.state);
      setOffline(!json.ok);
    } catch {
      setOffline(true); // sin red: se reintenta en el próximo ciclo
    }
  }, [apply, onUnauthorized]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  /** Ejecuta una acción del panel. Devuelve true si salió bien; si no, muestra el error. */
  const act = useCallback(
    async (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, okText?: string) => {
      inflight.current += 1;
      setBusy(true);
      try {
        const res = await fetch(url, {
          method,
          headers: body === undefined || body instanceof FormData ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
        if (res.status === 401) {
          onUnauthorized();
          return false;
        }
        const json = (await res.json()) as { ok: boolean; error?: string; state?: PanelState };
        if (json.state) apply(json.state);
        setOffline(false);
        if (!json.ok) {
          notify("error", json.error ?? "No se pudo completar la acción.");
          return false;
        }
        if (okText) notify("info", okText);
        return true;
      } catch {
        notify("error", "Sin conexión. Revise el internet e intente de nuevo.");
        return false;
      } finally {
        inflight.current -= 1;
        setBusy(false);
      }
    },
    [apply, notify, onUnauthorized],
  );

  // Mientras haya un SINPE sin responder, la alarma se repite cada 20 s para que no se quede olvidado.
  const pendingCount = state?.tables.reduce((n, t) => n + (t.bill?.pending.length ?? 0), 0) ?? 0;
  useEffect(() => {
    if (pendingCount === 0) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") alarm(); }, REMIND_MS);
    return () => clearInterval(t);
  }, [pendingCount]);

  // Realtime avisa al instante; la consulta cada 3 s queda como respaldo.
  useBroadcast(state?.restaurant.id ? `restaurant:${state.restaurant.id}` : null, refresh);

  return { state, notices, flashing, busy, offline, act, refresh, dismiss, notify };
}
