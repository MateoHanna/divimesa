"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";

import type { ClientState, InvoiceInput, PayMethod, PayMode, TipChoice, Unavailable } from "@/lib/client/types";
import { earliestReservation, quote, selectableLines } from "@/lib/client/quote";
import { formatCRC } from "@/lib/money";
import { cn } from "@/lib/utils";

import { useBroadcast } from "@/components/realtime/use-broadcast";

import { call } from "./call";
import { EqualSplit } from "./equal-split";
import { PaySummary, type TipUi } from "./pay-summary";
import { SplitItemDialog } from "./split-item-dialog";
import { useClientState } from "./use-client-state";

const MODES: { id: PayMode; title: string; sub: string }[] = [
  { id: "all", title: "Pagar toda la cuenta", sub: "Una sola persona paga todo" },
  { id: "items", title: "Pagar mis platos", sub: "Elija lo que usted consumió" },
  { id: "equal", title: "Partes iguales", sub: "Se divide entre varias personas" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invoiceProblem(i: InvoiceInput): string | null {
  if (i.idNumber && !/^\d{9,12}$/.test(i.idNumber)) return "La cédula debe tener entre 9 y 12 dígitos.";
  if (i.email && !EMAIL_RE.test(i.email.trim())) return "Revise el correo.";
  return null;
}

function cleanInvoice(i: InvoiceInput): InvoiceInput | undefined {
  const out: InvoiceInput = {};
  if (i.name?.trim()) out.name = i.name.trim();
  if (i.idNumber) { out.idNumber = i.idNumber; out.idType = i.idType ?? "fisica"; }
  if (i.email?.trim()) out.email = i.email.trim();
  return Object.keys(out).length ? out : undefined;
}

const DECLINED = "El pago fue rechazado y no se cobró nada. Puede intentarlo de nuevo o elegir otro método.";

export function ClientApp({ token, initial, channel, flash }: { token: string; initial: ClientState; channel: string | null; flash?: "declined" }) {
  const [mode, setMode] = useState<PayMode | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [tipUi, setTipUi] = useState<TipUi>("none");
  const [otherTip, setOtherTip] = useState("");
  const [method, setMethod] = useState<PayMethod>("card");
  const [invoice, setInvoice] = useState<InvoiceInput>({});
  const [notice, setNotice] = useState<string | null>(flash === "declined" ? DECLINED : null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [splitTarget, setSplitTarget] = useState<{ id: string; name: string; amount: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const selRef = useRef<string[]>([]);
  const modeRef = useRef<PayMode | null>(null);
  const firstSync = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSel = useCallback((ids: string[]) => { selRef.current = ids; setSelected(ids); }, []);
  const changeMode = useCallback((m: PayMode | null) => { modeRef.current = m; setMode(m); }, []);

  const onApply = useCallback((next: ClientState, prev: ClientState) => {
    // Cuenta nueva (o primera vez): se parte de cero.
    if (next.billId !== prev.billId) {
      changeMode(null); setSel([]); setNotice(null); setError(null);
      return;
    }
    const bill = next.bill;
    if (!bill) return;
    const pb = prev.bill;

    // Primera lectura: recupera lo que esta sesión ya tenía apartado (recarga de la página).
    if (firstSync.current) {
      firstSync.current = false;
      const mine = bill.lines.filter((l) => l.reserved === "me").map((l) => l.id);
      if (mine.length > 0 && !bill.split) { changeMode("items"); setSel(mine); }
    }

    if (bill.split && modeRef.current === "items") {
      changeMode("equal"); setSel([]);
      setNotice("La mesa decidió pagar en partes iguales. Pague una parte.");
      return;
    }

    if (modeRef.current === "items" && selRef.current.length > 0) {
      const lost: string[] = [];
      let reason: "paid" | "taken" | "expired" | null = null;
      for (const id of selRef.current) {
        const l = bill.lines.find((x) => x.id === id);
        const before = pb?.lines.find((x) => x.id === id);
        if (!l || l.status === "paid") { lost.push(id); reason ??= "paid"; }
        else if (l.reserved === "other") { lost.push(id); reason ??= "taken"; }
        else if (before?.reserved === "me" && l.reserved === "none") { lost.push(id); reason ??= "expired"; }
      }
      if (lost.length > 0) {
        setSel(selRef.current.filter((id) => !lost.includes(id)));
        const names = lost.map((id) => next.bill?.lines.find((x) => x.id === id)?.name ?? pb?.lines.find((x) => x.id === id)?.name ?? "un plato");
        const list = names.join(", ");
        setNotice(reason === "expired"
          ? "Se venció el tiempo de reserva. Elija sus platos de nuevo."
          : reason === "taken"
            ? `Otra persona está pagando: ${list}. Lo quitamos de su selección.`
            : `Otra persona ya pagó: ${list}. Lo quitamos de su selección.`);
      }
    }
  }, [changeMode, setSel]);

  const { state, synced, apply, skew, refresh } = useClientState(token, initial, onApply);
  useBroadcast(channel, refresh);

  useEffect(() => {
    if (flash) window.history.replaceState(null, "", window.location.pathname);
  }, [flash]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const bill = state.bill;
  const tip: TipChoice = useMemo(() => {
    if (tipUi === "5") return { type: "percent", value: 5 };
    if (tipUi === "10") return { type: "percent", value: 10 };
    if (tipUi === "other") return { type: "amount", value: parseInt(otherTip.replace(/\D/g, ""), 10) || 0 };
    return { type: "percent", value: 0 };
  }, [tipUi, otherTip]);
  const q = useMemo(() => quote(state, mode, selected, tip), [state, mode, selected, tip]);
  const invoiceError = invoiceProblem(invoice);

  const reserve = useCallback(async (ids: string[]) => {
    const res = await call<{ conflicts?: { id: string }[]; state?: ClientState }>(`/api/m/${token}/reserve`, "POST", { itemIds: ids });
    if (res.json?.state) apply(res.json.state);
    const conflicts = res.json?.conflicts ?? [];
    if (conflicts.length > 0) {
      const bad = conflicts.map((c) => c.id);
      setSel(selRef.current.filter((id) => !bad.includes(id)));
      setNotice("Otra persona ya eligió uno de esos platos. Lo quitamos de su selección.");
    }
  }, [token, apply, setSel]);

  const scheduleReserve = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void reserve(selRef.current), 350);
  }, [reserve]);

  function pickMode(m: PayMode) {
    if (m === mode) return;
    setNotice(null); setError(null);
    const leavingItems = mode === "items" && selRef.current.length > 0;
    changeMode(m);
    if (m !== "items") {
      setSel([]);
      if (timer.current) clearTimeout(timer.current);
      if (leavingItems) void reserve([]);
    }
  }

  function toggle(id: string) {
    setNotice(null);
    setSel(selRef.current.includes(id) ? selRef.current.filter((x) => x !== id) : [...selRef.current, id]);
    scheduleReserve();
  }

  async function startEqual(parts: number): Promise<boolean> {
    setBusy(true); setError(null);
    const res = await call<{ state?: ClientState }>(`/api/m/${token}/split-equal`, "POST", { parts });
    setBusy(false);
    if (res.json?.ok && res.json.state) { apply(res.json.state); return true; }
    if (res.status === 0) setError("Sin conexión. Intente de nuevo.");
    else setError(res.json?.error ?? "No se pudo dividir la cuenta.");
    return false;
  }

  async function splitItem(id: string, parts: number): Promise<boolean> {
    setBusy(true); setError(null);
    const res = await call<{ state?: ClientState }>(`/api/m/${token}/split-item`, "POST", { itemId: id, parts });
    setBusy(false);
    if (res.json?.ok && res.json.state) { apply(res.json.state); return true; }
    setError(res.status === 0 ? "Sin conexión. Intente de nuevo." : (res.json?.error ?? "No se pudo dividir el plato."));
    return false;
  }

  async function pay() {
    if (!mode || submitting) return;
    if (invoiceError) { setError(invoiceError); return; }
    if (timer.current) clearTimeout(timer.current);
    setSubmitting(true); setError(null);
    const res = await call<{ redirectUrl?: string; unavailable?: Unavailable[]; state?: ClientState }>("/api/payments", "POST", {
      token, mode, itemIds: mode === "items" ? selRef.current : undefined, method, tip, invoice: cleanInvoice(invoice),
    });
    if (res.json?.ok && res.json.redirectUrl) {
      window.location.assign(res.json.redirectUrl);
      return; // se queda en "Un momento…" hasta que cambie la página
    }
    setSubmitting(false);
    if (res.json?.state) apply(res.json.state);
    const un = res.json?.unavailable ?? [];
    if (un.length > 0) {
      setSel(selRef.current.filter((id) => !un.some((u) => u.id === id)));
      setNotice("Algunos platos ya no están disponibles. Revise su selección.");
    } else {
      setError(res.status === 0 ? "Sin conexión. Intente de nuevo." : (res.json?.error ?? "No se pudo iniciar el pago."));
    }
  }

  const remainingMs = bill ? (() => {
    const e = earliestReservation(bill);
    return e ? Date.parse(e) - (now + skew.current) : null;
  })() : null;
  const countdown = mode === "items" && remainingMs !== null && remainingMs > 0
    ? `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}` : null;

  const disabledReason = !synced ? "Actualizando la cuenta…" : q.blocked ?? (invoiceError ? "Revise los datos de factura." : null);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 pb-10" style={{ "--brand": state.restaurant.primaryColor } as React.CSSProperties}>
      <header className="-mx-4 border-b-4 px-4 pb-3 pt-5" style={{ borderColor: "var(--brand)" }}>
        <p className="text-sm font-medium text-muted-foreground">{state.restaurant.name}</p>
        <h1 className="text-3xl font-extrabold">Mesa {state.tableNumber}</h1>
        <p className="text-sm text-muted-foreground">No necesita descargar nada ni registrarse</p>
      </header>

      {state.view === "no_bill" ? (
        <p role="status" className="rounded-2xl border p-5 text-lg">Esta mesa todavía no tiene una cuenta abierta. Pídale la cuenta al salonero.</p>
      ) : null}

      {state.view === "finished" && state.outcome === "closed" ? (
        <p role="status" className="rounded-2xl border p-6 text-center text-xl font-semibold">
          Esta cuenta ya se cerró.
          <span className="mt-1 block text-base font-normal text-muted-foreground">Si tiene dudas, pregunte al salonero.</span>
        </p>
      ) : null}

      {state.view === "finished" && state.outcome !== "closed" ? (
        <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-8 text-center text-emerald-950">
          <CheckIcon className="size-10" aria-hidden />
          <p className="text-2xl font-bold">Esta cuenta ya está pagada. ¡Gracias!</p>
        </div>
      ) : null}

      {state.view === "open" && bill ? (
        <>
          {synced && bill.othersPaying ? (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              Otra persona de la mesa está pagando en este momento.
            </p>
          ) : null}

          <section aria-label="Cuenta">
            <ul className="divide-y rounded-2xl border bg-card">
              {bill.lines.map((l) => {
                const paid = l.status === "paid";
                const other = !paid && l.reserved === "other";
                const pickable = mode === "items" && !paid && !other && !bill.split;
                const checked = selected.includes(l.id);
                const canSplit = mode === "items" && !paid && !other && !bill.split && !l.splitGroupId && l.amount >= 2;
                return (
                  <li key={l.id} className={cn("flex items-center gap-3 px-3", checked && "bg-primary/5")}>
                    <button type="button" disabled={!pickable} onClick={() => toggle(l.id)} aria-pressed={pickable ? checked : undefined}
                      className="flex min-h-14 flex-1 items-center gap-3 py-2 text-left disabled:cursor-default">
                      {mode === "items" ? (
                        <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2",
                          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                          !pickable && "opacity-30")}>
                          {checked ? <CheckIcon className="size-4" /> : null}
                        </span>
                      ) : null}
                      <span className="flex-1">
                        <span className={cn("block text-base", paid && "text-muted-foreground line-through")}>{l.name}</span>
                        {paid ? <span className="mt-0.5 inline-block rounded-full bg-emerald-100 px-2 text-xs font-medium text-emerald-900">Pagado</span> : null}
                        {other ? <span className="block text-xs text-amber-800">Otra persona la está pagando</span> : null}
                      </span>
                      <span className={cn("tabular-nums", paid && "text-muted-foreground line-through")}>{formatCRC(l.amount)}</span>
                    </button>
                    {canSplit ? (
                      <button type="button" onClick={() => setSplitTarget({ id: l.id, name: l.name, amount: l.amount })}
                        className="min-h-11 shrink-0 rounded-lg border px-3 text-sm font-medium">Dividir</button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <dl className="mt-3 flex flex-col gap-1 px-1 text-sm">
              <Row label="Subtotal" value={bill.totals.subtotal} />
              {bill.totals.service > 0 ? <Row label={`Servicio ${Math.round(state.restaurant.serviceRate * 100 * 100) / 100} %`} value={bill.totals.service} /> : null}
              {bill.totals.vat > 0 ? <Row label="IVA" value={bill.totals.vat} /> : null}
              <Row label="Total" value={bill.totals.total} strong />
              {bill.totals.paid > 0 ? <Row label="Pagado" value={-bill.totals.paid} /> : null}
              {bill.totals.paid > 0 ? <Row label="Saldo" value={bill.totals.balance} strong /> : null}
            </dl>
          </section>

          <section aria-label="Cómo desea pagar" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">¿Cómo desea pagar?</h2>
            {MODES.map((m) => {
              const off = m.id === "items" && !!bill.split;
              return (
                <button key={m.id} type="button" disabled={off} aria-pressed={mode === m.id} onClick={() => pickMode(m.id)}
                  className={cn("flex min-h-16 flex-col items-start justify-center rounded-2xl border px-4 py-2 text-left disabled:opacity-50",
                    mode === m.id ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
                  <span className="text-lg font-semibold">{m.title}</span>
                  <span className={cn("text-sm", mode === m.id ? "opacity-90" : "text-muted-foreground")}>
                    {off ? "No disponible: la mesa paga en partes iguales" : m.sub}
                  </span>
                </button>
              );
            })}
          </section>

          {notice ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{notice}</p> : null}

          {mode === "items" && countdown ? (
            <p className="text-sm text-muted-foreground" aria-live="off">Sus platos están apartados por {countdown}.</p>
          ) : null}
          {mode === "items" && selectableLines(bill).length === 0 ? (
            <p className="text-sm text-muted-foreground">No quedan platos libres. Espere un momento.</p>
          ) : null}

          {mode === "equal" ? <EqualSplit bill={bill} busy={busy} onStart={startEqual} /> : null}

          {mode ? (
            <PaySummary quote={q} tipUi={tipUi} onTipUi={setTipUi} otherTip={otherTip} onOtherTip={setOtherTip}
              method={method} onMethod={setMethod} invoice={invoice} onInvoice={setInvoice} invoiceError={invoiceError}
              disabledReason={disabledReason} submitting={submitting} onPay={pay} />
          ) : null}

          {error ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        </>
      ) : null}

      <SplitItemDialog target={splitTarget} onClose={() => setSplitTarget(null)} busy={busy} onConfirm={splitItem} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "text-base font-bold")}>
      <dt>{label}</dt><dd className="tabular-nums">{value < 0 ? `−${formatCRC(-value)}` : formatCRC(value)}</dd>
    </div>
  );
}
