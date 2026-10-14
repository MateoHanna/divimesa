"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, MinusIcon, MoreVerticalIcon, PencilIcon, QrCodeIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

import { AnimatedMoney } from "@/components/ui/animated-number";
import { useJustPaid } from "@/components/ui/use-just-paid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCRC } from "@/lib/money";
import { groupLines } from "@/lib/panel/state";
import type { PanelTable } from "@/lib/panel/types";
import { cn } from "@/lib/utils";

import { AddItemsDialog } from "./add-items-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { InvoiceInfo } from "./invoice-info";
import { PaymentDialog } from "./payment-dialog";
import { OpenFor } from "./open-for";
import { PendingSinpe } from "./pending-sinpe";
import { parseColones, TotalDialog } from "./total-dialog";
import { PriceDialog } from "./price-dialog";
import { KIND_LABEL, METHOD_LABEL, STATUS_CLASS, STATUS_LABEL } from "./status";
import type { PanelState } from "@/lib/panel/types";

type Act = (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, okText?: string) => Promise<boolean>;

export function TableDetail({
  table, menu, billMode, busy, act, onBack,
}: { table: PanelTable; menu: PanelState["menu"]; billMode: "items" | "total"; busy: boolean; act: Act; onBack: () => void }) {
  const justPaid = useJustPaid(table.bill?.lines);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [price, setPrice] = useState<{ id: string; name: string; price: number } | null>(null);
  const [confirm, setConfirm] = useState<null | "close" | "release" | "split">(null);
  const [options, setOptions] = useState(false);
  const [editTotal, setEditTotal] = useState(false);
  const [openText, setOpenText] = useState("");
  const bill = table.bill;
  const isTotal = bill?.mode === "total";
  const openTotal = parseColones(openText);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Volver a las mesas" className="md:hidden"><ArrowLeftIcon /></Button>
        <h2 className="text-2xl font-bold">Mesa {table.number}</h2>
        <Badge variant="outline" className={cn("ml-auto text-sm", STATUS_CLASS[table.status])}>{STATUS_LABEL[table.status]}</Badge>
        {bill?.status === "open" ? (
          <Button variant="ghost" size="icon" aria-label="Más opciones de la mesa" onClick={() => setOptions(true)}><MoreVerticalIcon /></Button>
        ) : null}
      </header>

      {bill?.status === "open" ? <OpenFor openedAt={bill.openedAt} className="-mt-2 text-sm text-muted-foreground" /> : null}

      {!bill && billMode === "total" ? (
        <form className="flex flex-col gap-3 rounded-2xl border p-4" onSubmit={(e) => {
          e.preventDefault();
          if (openTotal > 0) void act("/api/panel/bills", "POST", { tableId: table.id, total: openTotal });
        }}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Total de la cuenta (ya con servicio e impuestos)
            <Input inputMode="numeric" autoComplete="off" placeholder="₡ 0" className="h-14 text-center text-2xl" value={openText}
              onChange={(e) => setOpenText(e.target.value)} />
          </label>
          <Button size="xl" type="submit" disabled={busy || openTotal <= 0}>Abrir mesa{openTotal > 0 ? ` con ${formatCRC(openTotal)}` : ""}</Button>
        </form>
      ) : null}
      {!bill && billMode !== "total" ? (
        <Button size="xl" disabled={busy} onClick={() => act("/api/panel/bills", "POST", { tableId: table.id })}>Abrir cuenta</Button>
      ) : null}

      {bill ? (
        <>
          <PendingSinpe pending={bill.pending} busy={busy}
            onConfirm={(p) => act(`/api/panel/payments/${p.id}/confirm`, "POST", undefined, p.method === "terminal" ? "Pago con datáfono registrado" : "SINPE confirmado")}
            onReject={(p) => act(`/api/panel/payments/${p.id}/reject`, "POST", undefined, p.method === "terminal" ? "Cobro con datáfono cancelado" : "Marcado como «No llegó»")} />

          {bill.split ? (
            <div className="flex flex-col gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
              <p>
                <strong>Partes iguales:</strong> {bill.split.paidParts} de {bill.split.parts} pagadas, {formatCRC(bill.split.share)} cada una.
              </p>
              <div className="flex items-center gap-3" aria-hidden>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-sky-200">
                  <span className="block h-full rounded-full bg-sky-600 transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round((bill.split.paidParts / bill.split.parts) * 100))}%` }} />
                </span>
                <span className="text-xs font-bold tabular-nums">{bill.split.paidParts}/{bill.split.parts}</span>
              </div>
              {bill.status === "open" ? (
                <Button size="sm" variant="outline" onClick={() => setConfirm("split")}>Cancelar partes iguales</Button>
              ) : null}
            </div>
          ) : null}

          {isTotal ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
              <div>
                <p className="text-sm text-muted-foreground">Total de la cuenta</p>
                <p className="text-3xl font-extrabold tabular-nums"><AnimatedMoney value={bill.totals.total} /></p>
              </div>
              {bill.status === "open" ? (
                <Button variant="outline" size="lg" disabled={busy || bill.pending.length > 0 || !!bill.split} onClick={() => setEditTotal(true)}>
                  <PencilIcon /> Corregir
                </Button>
              ) : null}
            </div>
          ) : null}
          {isTotal && bill.status === "open" && bill.pending.length > 0 ? (
            <p className="-mt-2 text-sm text-muted-foreground">Para corregir el total, primero responda el pago por confirmar.</p>
          ) : null}
          {isTotal && bill.status === "open" && bill.split ? (
            <p className="-mt-2 text-sm text-muted-foreground">Para corregir el total, primero cancele las partes iguales.</p>
          ) : null}

          {!isTotal ? (
          <ul className="flex flex-col divide-y rounded-xl border">
            {bill.lines.length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">Todavía no hay platos.</li> : null}
            {groupLines(bill.lines).map((g) => {
              const editable = bill.status === "open" && !bill.split && g.status === "pending";
              const freeId = bill.lines.find((l) => g.ids.includes(l.id) && !l.reserved)?.id;
              return (
                <li key={g.key} className={cn("flex items-center gap-2 p-3", g.status === "paid" && "text-muted-foreground", g.ids.some((id) => justPaid.has(id)) && "animate-paid-flash")}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{g.count > 1 ? `${g.count} × ` : ""}{g.name}</p>
                    <p className="text-sm">
                      {formatCRC(g.unitPrice)}{g.count > 1 ? " c/u" : ""}
                      {g.status === "paid" ? " · Pagado" : ""}
                      {g.reservedCount ? ` · ${g.reservedCount} en pago por QR` : ""}
                    </p>
                  </div>
                  {editable && freeId ? (
                    <>
                      <Button variant="ghost" size="icon" aria-label={`Cambiar precio de ${g.name}`}
                        onClick={() => setPrice({ id: freeId, name: g.name, price: g.unitPrice })}><PencilIcon /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Quitar una unidad de ${g.name}`} disabled={busy}
                        onClick={() => act(`/api/panel/items/${freeId}`, "DELETE")}><MinusIcon /></Button>
                      {g.splitGroupId ? (
                        <Button variant="outline" size="sm" disabled={busy} aria-label={`Deshacer la división de ${g.name}`}
                          onClick={() => act(`/api/panel/items/${freeId}/unsplit`, "POST")}>Deshacer división</Button>
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
          ) : null}

          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {!isTotal ? (
              <>
                <dt>Subtotal</dt><dd className="text-right tabular-nums"><AnimatedMoney value={bill.totals.subtotal} /></dd>
                <dt>Servicio</dt><dd className="text-right tabular-nums"><AnimatedMoney value={bill.totals.service} /></dd>
                <dt>IVA</dt><dd className="text-right tabular-nums"><AnimatedMoney value={bill.totals.vat} /></dd>
              </>
            ) : null}
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold tabular-nums"><AnimatedMoney value={bill.totals.total} /></dd>
            <dt>Pagado</dt><dd className="text-right tabular-nums"><AnimatedMoney value={bill.totals.paid} /></dd>
            <dt className="text-base font-bold">Saldo</dt><dd className="text-right text-base font-bold tabular-nums"><AnimatedMoney value={bill.totals.balance} /></dd>
          </dl>

          {bill.status === "open" ? (
            <div className="grid grid-cols-2 gap-2">
              {!bill.split && !isTotal ? <Button size="lg" variant="outline" onClick={() => setAdding(true)}>Agregar platos</Button> : <span />}
              <Button size="lg" disabled={bill.totals.balance <= 0} onClick={() => setPaying(true)}>Registrar pago</Button>
            </div>
          ) : (
            <Button size="xl" disabled={busy} onClick={() => setConfirm("release")}>Liberar mesa</Button>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Pagos</h3>
            {bill.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pagos todavía.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {bill.payments.map((p) => (
                  <li key={p.id} className="animate-notice-in flex items-center justify-between gap-2 p-3 text-sm">
                    <div>
                      <p className="flex items-center gap-1.5 font-medium">
                        <CheckIcon className="size-4 shrink-0 text-emerald-600" aria-label="Pagado" />
                        {METHOD_LABEL[p.method] ?? p.method} · {KIND_LABEL[p.kind] ?? p.kind}
                      </p>
                      {p.items.length > 0 ? (
                        <p>{p.items.map((i) => `${i.count > 1 ? `${i.count} × ` : ""}${i.name}`).join(", ")}</p>
                      ) : null}
                      {p.code || p.payerName ? (
                        <p>{p.code ? <span className="font-mono">{p.code}</span> : null}{p.code && p.payerName ? " · " : ""}{p.payerName ? `a nombre de ${p.payerName}` : ""}</p>
                      ) : null}
                      <InvoiceInfo invoice={p.invoice} />
                      <p className="text-muted-foreground">
                        {time(p.paidAt)} · {p.source === "qr" ? "Por QR" : "Salonero"}
                        {p.tip ? ` · propina ${formatCRC(p.tip)}` : ""}
                        {p.overpaid ? ` · sobraron ${formatCRC(p.overpaid)}` : ""}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatCRC(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Dialog open={options} onOpenChange={setOptions}>
            <DialogContent title={`Opciones · Mesa ${table.number}`} description="Acciones poco frecuentes de esta cuenta.">
              <Button variant="outline" size="lg" className="text-destructive"
                onClick={() => { setOptions(false); setConfirm("close"); }}>Cerrar cuenta sin cobrar el saldo</Button>
              <p className="-mt-2 text-sm text-muted-foreground">Para cuando el cliente se fue o la cuenta se anula. Pide confirmación.</p>
            </DialogContent>
          </Dialog>

          <TotalDialog open={editTotal} onOpenChange={setEditTotal} current={bill.totals.total} paid={bill.totals.paid} busy={busy}
            onSave={(total) => act(`/api/panel/bills/${bill.id}/total`, "PATCH", { total }, `Total corregido a ${formatCRC(total)}`)} />
          <AddItemsDialog open={adding} onOpenChange={setAdding} menu={menu} busy={busy}
            onAdd={(menuItemId, quantity) => act(`/api/panel/bills/${bill.id}/items`, "POST", { menuItemId, quantity })} />
          <PaymentDialog bill={bill} tableNumber={table.number} open={paying} onOpenChange={setPaying} busy={busy}
            onPay={(body, shown) => act(`/api/panel/bills/${bill.id}/payments`, "POST", body, `Pago de ${formatCRC(shown)} registrado en la Mesa ${table.number}`)} />
          <PriceDialog target={price} onClose={() => setPrice(null)} busy={busy}
            onSave={(id, p) => act(`/api/panel/items/${id}`, "PATCH", { price: p }, "Precio actualizado")} />
          <ConfirmDialog open={confirm === "close"} onOpenChange={(o) => !o && setConfirm(null)} destructive busy={busy}
            title="¿Cerrar la cuenta?" confirmLabel="Cerrar cuenta"
            description={`Quedan ${formatCRC(bill.totals.balance)} sin cobrar. La mesa se libera y la cuenta no se puede reabrir.`}
            onConfirm={async () => { if (await act(`/api/panel/bills/${bill.id}/close`, "POST", undefined, "Cuenta cerrada")) onBack(); }} />
          <ConfirmDialog open={confirm === "release"} onOpenChange={(o) => !o && setConfirm(null)} busy={busy}
            title="¿Liberar la mesa?" confirmLabel="Liberar mesa" description="La cuenta ya está pagada. La mesa queda libre para el próximo grupo."
            onConfirm={async () => { if (await act(`/api/panel/bills/${bill.id}/release`, "POST", undefined, "Mesa liberada")) onBack(); }} />
          <ConfirmDialog open={confirm === "split"} onOpenChange={(o) => !o && setConfirm(null)} busy={busy}
            title="¿Cancelar las partes iguales?" confirmLabel="Cancelar partes iguales"
            description="Lo que ya se pagó se queda pagado. Los clientes vuelven a ver la cuenta completa."
            onConfirm={async () => { await act(`/api/panel/bills/${bill.id}/cancel-split`, "POST", undefined, "Partes iguales canceladas"); }} />
        </>
      ) : null}

      <Button variant="ghost" size="sm" className="self-center text-muted-foreground" asChild>
        <Link href={`/panel/qr/${table.number}`}><QrCodeIcon /> Mostrar QR grande</Link>
      </Button>
    </div>
  );
}
