"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, CreditCardIcon, LockIcon, ShieldCheckIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react";

import type { ClientState, InvoiceInput, PayMethod, PayMode, TipChoice, Unavailable } from "@/lib/client/types";
import { earliestReservation, quote, selectableLines } from "@/lib/client/quote";
import { formatCRC } from "@/lib/money";
import { ErrorNote } from "@/components/ui/error-note";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { BrandMark } from "@/components/brand/brand-mark";
import { DivimesaFooter } from "@/components/brand/divimesa-logo";
import { useBroadcast } from "@/components/realtime/use-broadcast";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { useJustPaid } from "@/components/ui/use-just-paid";
import { brandVars } from "@/lib/branding";
import { canDemoConfirm, confirmedByStaff, orderedMethods } from "@/lib/client/methods";
import { displayTableNumber } from "@/lib/demo/display";

import { call } from "./call";
import { EqualSplit } from "./equal-split";
import { PaySummary, type TipUi } from "./pay-summary";
import { SinpeScreen } from "./sinpe-screen";
import { SplitItemDialog } from "./split-item-dialog";
import { TerminalScreen } from "./terminal-screen";
import { useClientState } from "./use-client-state";

const MODES: { id: PayMode; title: string; sub: string }[] = [
  { id: "all", title: "Pagar toda la cuenta", sub: "Una sola persona paga todo" },
  { id: "items", title: "Pagar mis platos", sub: "Elija lo que usted consumió" },
  { id: "equal", title: "Partes iguales", sub: "Se divide entre varias personas" },
  { id: "amount", title: "Pagar un monto", sub: "Usted decide cuánto paga" },
];
/** Cuenta por platos: sin monto libre. Cuenta de solo el total: sin platos. */
const MODES_BY_BILL = { items: ["all", "items", "equal"], total: ["all", "equal", "amount"] } as const;

const SEEN_KEY = "divimesa-sinpe-seen";
function readSeen(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-20) : [];
  } catch {
    return [];
  }
}
function writeSeen(ids: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    /* sin almacenamiento: el aviso solo se quita hasta recargar */
  }
}

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

export function ClientApp({ token, initial, channel, flash, host, recording = false, demo = false }: { token: string; initial: ClientState; channel: string | null; flash?: "declined"; host: string | null; recording?: boolean; demo?: boolean }) {
  const [mode, setMode] = useState<PayMode | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [tipUi, setTipUi] = useState<TipUi>("none");
  const [otherTip, setOtherTip] = useState("");
  const [method, setMethod] = useState<PayMethod>("sinpe");
  const [freeText, setFreeText] = useState("");
  const [seen, setSeen] = useState<string[] | null>(null); // avisos de SINPE ya cerrados (null: aún no se leyó)
  const [reporting, setReporting] = useState(false);
  const [sinpeError, setSinpeError] = useState<string | null>(null);
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

    // Terminó el SINPE de esta sesión (confirmado o rechazado): se vuelve a la cuenta sin selección.
    if (pb?.mySinpe?.status === "pending" && bill.mySinpe?.id === pb.mySinpe.id && bill.mySinpe.status !== "pending") {
      changeMode(null); setSel([]); setSinpeError(null);
    }

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

  const { state, synced, offline, apply, skew, refresh } = useClientState(token, initial, onApply);
  const justPaid = useJustPaid(state.bill?.lines);
  useBroadcast(channel, refresh);

  useEffect(() => {
    if (flash) window.history.replaceState(null, "", window.location.pathname);
  }, [flash]);
  useEffect(() => {
    const t = setTimeout(() => setSeen(readSeen()), 0);
    return () => clearTimeout(t);
  }, []);

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
  const freeAmount = parseInt(freeText.replace(/\D/g, ""), 10) || 0;
  const q = useMemo(() => quote(state, mode, selected, tip, freeAmount), [state, mode, selected, tip, freeAmount]);
  const sinpeInfo = state.restaurant.sinpe;
  // SINPE solo si el restaurante tiene número; el datáfono siempre (lo cobra el salonero).
  const methods = orderedMethods(state.restaurant.methods).filter((m) => m !== "sinpe" || !!sinpeInfo);
  const effectiveMethod: PayMethod = methods.includes(method) ? method : methods[0] ?? "sinpe";
  const noMethods = methods.length === 0; // restaurante sin ningún método por aquí
  // Pago propio por confirmar: un SINPE (instrucciones o espera) o el datáfono pedido.
  const mine = bill?.mySinpe ?? null;
  const minePending = mine?.status === "pending" && (mine.method === "terminal" || !!sinpeInfo);
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
      token, mode, itemIds: mode === "items" ? selRef.current : undefined, amount: mode === "amount" ? freeAmount : undefined,
      method: effectiveMethod, tip, invoice: cleanInvoice(invoice),
    });
    if (res.json?.ok && res.json.redirectUrl) {
      window.location.assign(res.json.redirectUrl);
      return; // se queda en "Un momento…" hasta que cambie la página
    }
    if (res.json?.ok && confirmedByStaff(effectiveMethod) && res.json.state) {
      // SINPE o datáfono: no hay pasarela. El estado trae la pantalla siguiente (my_sinpe).
      setSubmitting(false); setSinpeError(null);
      apply(res.json.state);
      return;
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

  async function reportSinpe(payerName: string) {
    const id = bill?.mySinpe?.id;
    if (!id || reporting) return;
    setReporting(true); setSinpeError(null);
    const res = await call<{ state?: ClientState }>(`/api/payments/${id}/report`, "POST", { payerName: payerName.trim() || undefined });
    setReporting(false);
    if (res.json?.ok && res.json.state) apply(res.json.state);
    else setSinpeError(res.status === 0 ? "Sin conexión. Intente de nuevo." : (res.json?.error ?? "No se pudo avisar al restaurante. Intente de nuevo."));
  }

  async function backFromSinpe() {
    const id = bill?.mySinpe?.id;
    if (!id) return;
    setReporting(true); setSinpeError(null);
    await call(`/api/payments/${id}/cancel`, "POST");
    setReporting(false);
    await refresh();
  }

  // "Ya no, cancelar" del datáfono pedido. Si el salonero ya lo cobró, el estado lo muestra como pagado.
  async function cancelTerminal() {
    const id = bill?.mySinpe?.id;
    if (!id || reporting) return;
    setReporting(true); setSinpeError(null);
    const res = await call<{ status?: string }>(`/api/payments/${id}/cancel`, "POST");
    setReporting(false);
    if (res.json?.ok && res.json.status === "failed") closeNotice(id); // lo canceló él: sin aviso de "cancelado"
    else if (!res.json?.ok) setSinpeError(res.status === 0 ? "Sin conexión. Intente de nuevo." : (res.json?.error ?? "No se pudo cancelar. Intente de nuevo."));
    await refresh();
  }

  function closeNotice(id: string) {
    const next = [...(seen ?? []), id];
    setSeen(next);
    writeSeen(next);
  }

  const remainingMs = bill ? (() => {
    const e = earliestReservation(bill);
    return e ? Date.parse(e) - (now + skew.current) : null;
  })() : null;
  const countdown = mode === "items" && remainingMs !== null && remainingMs > 0
    ? `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}` : null;

  const disabledReason = !synced ? "Actualizando la cuenta…" : q.blocked ?? (invoiceError ? "Revise los datos de factura." : null);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 pb-10" style={{ ...brandVars(state.restaurant.primaryColor), ...(recording ? { paddingTop: 40 } : {}) } as React.CSSProperties}>
      {/* Video de demo: franja fija bajo el notch del marco, para que nunca tape el contenido. */}
      {recording ? <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-10 bg-primary" /> : null}
      {demo ? (
        <p role="note" className="-mx-4 -mb-4 bg-[#1C1C1E] px-4 py-2 text-center text-sm font-semibold text-white">Esto es una demo. No se cobra nada.</p>
      ) : null}
      <header className="-mx-4 bg-primary px-4 pb-4 pt-5 text-primary-foreground">
        <div className="flex items-center gap-3">
          <BrandMark name={state.restaurant.name} logoUrl={state.restaurant.logoUrl} className="size-14 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl leading-tight font-extrabold">{state.restaurant.name}</h1>
            <p className="text-sm font-medium opacity-90">Mesa {displayTableNumber(state.tableNumber)}</p>
          </div>
        </div>
      </header>
      <div className="-mx-4 -mt-4 flex flex-col gap-0.5 border-b bg-card px-4 py-2.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <LockIcon className="size-3.5 shrink-0" aria-hidden /> No necesita descargar nada ni registrarse
        </p>
        {host ? <p className="pl-5">Está en <span className="font-semibold text-foreground">{host}</span></p> : null}
      </div>

      {offline ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <WifiOffIcon className="size-4 shrink-0" aria-hidden /> Sin conexión. Reintentando… la cuenta puede estar desactualizada.
        </p>
      ) : null}

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

          {bill.mySinpe && bill.mySinpe.status !== "pending" && seen !== null && !seen.includes(bill.mySinpe.id) ? (
            bill.mySinpe.status === "paid" ? (
              <div role="status" className="flex flex-col gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
                <p className="flex items-center gap-2 text-lg font-bold"><CheckIcon className="size-5" aria-hidden /> Pago confirmado</p>
                <p className="text-sm">
                  {bill.mySinpe.method === "terminal"
                    ? <>El salonero registró su pago con tarjeta de {formatCRC(bill.mySinpe.amount + bill.mySinpe.tip)}. ¡Gracias!</>
                    : <>El restaurante recibió su SINPE de {formatCRC(bill.mySinpe.amount + bill.mySinpe.tip)}. ¡Gracias!</>}
                </p>
                <button type="button" className="min-h-11 self-start rounded-lg border border-emerald-400 bg-white px-4 text-sm font-semibold"
                  onClick={() => closeNotice(bill.mySinpe!.id)}>Listo</button>
              </div>
            ) : bill.mySinpe.method === "terminal" ? (
              <div role="status" className="flex flex-col gap-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
                <p className="flex items-center gap-2 text-lg font-bold"><CreditCardIcon className="size-5" aria-hidden /> Se canceló el cobro con tarjeta</p>
                <p className="text-sm">El salonero canceló la solicitud del datáfono. Si todavía le falta pagar, elija cómo hacerlo.</p>
                <button type="button" className="min-h-11 self-start rounded-lg border border-amber-400 bg-white px-4 text-sm font-semibold"
                  onClick={() => closeNotice(bill.mySinpe!.id)}>Entendido</button>
              </div>
            ) : (
              <div role="alert" className="flex flex-col gap-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
                <p className="flex items-center gap-2 text-lg font-bold"><TriangleAlertIcon className="size-5" aria-hidden /> No encontramos su SINPE</p>
                <p className="text-sm">El restaurante no encontró su SINPE. Hable con su salonero.</p>
                <button type="button" className="min-h-11 self-start rounded-lg border border-amber-400 bg-white px-4 text-sm font-semibold"
                  onClick={() => closeNotice(bill.mySinpe!.id)}>Entendido</button>
              </div>
            )
          ) : null}

          {minePending && mine?.method === "sinpe" && sinpeInfo ? (
            <SinpeScreen mine={mine} sinpe={sinpeInfo} busy={reporting} error={sinpeError}
              onReport={(n) => void reportSinpe(n)} onBack={() => void backFromSinpe()}
              onDemoConfirm={canDemoConfirm(state, demo) ? () => { void fetch(`/api/demo/mesa/${token}/confirm`, { method: "POST" }).then(() => refresh()); } : undefined} />
          ) : null}
          {minePending && mine?.method === "terminal" ? (
            <TerminalScreen mine={mine} test={!!sinpeInfo?.test} busy={reporting} error={sinpeError}
              onCancel={() => void cancelTerminal()}
              onDemoConfirm={canDemoConfirm(state, demo) ? () => { void fetch(`/api/demo/mesa/${token}/confirm`, { method: "POST" }).then(() => refresh()); } : undefined} />
          ) : null}

          {!minePending ? (
          <>
          <section aria-label="Cuenta">
            {bill.mode === "items" ? (
            <ul className="divide-y rounded-2xl border bg-card">
              {bill.lines.map((l) => {
                const paid = l.status === "paid";
                const other = !paid && l.reserved === "other";
                const pickable = mode === "items" && !paid && !other && !bill.split;
                const checked = selected.includes(l.id);
                const canSplit = mode === "items" && !paid && !other && !bill.split && !l.splitGroupId && l.amount >= 2;
                return (
                  <li key={l.id} className={cn("flex items-center gap-3 px-3 transition-colors duration-500", checked && "bg-primary/5", justPaid.has(l.id) && "animate-paid-flash")}>
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
            ) : null}
            <dl className={cn("flex flex-col gap-1 px-1 text-sm", bill.mode === "items" ? "mt-3" : "rounded-2xl border bg-card p-4 text-base")}>
              {bill.mode === "items" ? <Row label="Subtotal" value={bill.totals.subtotal} /> : null}
              {bill.mode === "items" && bill.totals.service > 0 ? <Row label={`Servicio ${Math.round(state.restaurant.serviceRate * 100 * 100) / 100} %`} value={bill.totals.service} /> : null}
              {bill.mode === "items" && bill.totals.vat > 0 ? <Row label="IVA" value={bill.totals.vat} /> : null}
              <Row label="Total" value={bill.totals.total} strong />
              {bill.totals.paid > 0 ? <Row label="Pagado" value={-bill.totals.paid} /> : null}
              {bill.totals.paid > 0 ? <Row label="Saldo" value={bill.totals.balance} strong /> : null}
            </dl>
          </section>

          <section aria-label="Cómo desea pagar" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">¿Cómo desea pagar?</h2>
            {MODES.filter((m) => (MODES_BY_BILL[bill.mode] as readonly PayMode[]).includes(m.id)).map((m) => {
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

          {mode === "amount" ? (
            <div className="flex flex-col gap-2 rounded-2xl border p-4">
              <label htmlFor="monto-libre" className="text-lg font-semibold">¿Cuánto va a pagar?</label>
              <Input id="monto-libre" inputMode="numeric" autoComplete="off" placeholder="₡ 0" className="h-14 text-center text-2xl"
                value={freeText} onChange={(e) => setFreeText(e.target.value)} />
              <p className="text-sm text-muted-foreground">
                Puede pagar hasta {formatCRC(bill.amounts.all)}. Solo colones enteros.
              </p>
              {bill.amounts.all > 0 ? (
                <button type="button" className="min-h-11 self-start rounded-lg border px-3 text-sm font-medium"
                  onClick={() => setFreeText(String(bill.amounts.all))}>Todo lo que falta ({formatCRC(bill.amounts.all)})</button>
              ) : null}
            </div>
          ) : null}

          {noMethods ? (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              Este restaurante todavía no recibe pagos por aquí. Pague con su salonero.
            </p>
          ) : mode && !(mode === "equal" && !bill.split) ? (
            <PaySummary quote={q} tipUi={tipUi} onTipUi={setTipUi} otherTip={otherTip} onOtherTip={setOtherTip}
              methods={methods} method={effectiveMethod} onMethod={setMethod} invoice={invoice} onInvoice={setInvoice} invoiceError={invoiceError}
              disabledReason={disabledReason} submitting={submitting} onPay={pay} />
          ) : null}

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          </>
          ) : null}
        </>
      ) : null}

      <details className="group mt-auto rounded-xl border bg-card text-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-medium">
          <ShieldCheckIcon className="size-4 shrink-0 text-emerald-700" aria-hidden /> ¿Es seguro pagar aquí?
        </summary>
        <ul className="flex flex-col gap-1.5 px-3 pb-3 text-muted-foreground">
          <li>Solo ve la cuenta de su mesa. No instala nada ni crea una cuenta.</li>
          {methods.includes("card") ? (
            <li>En esta página no se escriben datos de tarjeta: el pago se completa en la pantalla del proveedor de pagos.</li>
          ) : methods.includes("sinpe") ? (
            <li>El pago es un SINPE Móvil que usted hace en su banco, directo al restaurante. Divimesa no recibe su dinero ni le pide datos de tarjeta.</li>
          ) : null}
          {methods.includes("terminal") ? (
            <li>Si paga con tarjeta, el salonero se la cobra con el datáfono del restaurante, como siempre. Aquí no se escriben datos de tarjeta.</li>
          ) : null}
          <li>Los datos de factura son opcionales y solo se usan para su comprobante.</li>
          <li>Si algo no le parece bien, pídale ayuda al salonero antes de pagar.</li>
        </ul>
      </details>

      <DivimesaFooter />

      <SplitItemDialog target={splitTarget} onClose={() => setSplitTarget(null)} busy={busy} onConfirm={splitItem} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "text-base font-bold")}>
      <dt>{label}</dt><dd>{value < 0 ? <>−<AnimatedMoney value={-value} /></> : <AnimatedMoney value={value} />}</dd>
    </div>
  );
}
