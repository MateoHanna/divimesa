"use client";

import { ChartPieIcon, CircleCheckIcon, CircleDashedIcon, CreditCardIcon, SmartphoneIcon, UtensilsCrossedIcon } from "lucide-react";

import { AnimatedMoney } from "@/components/ui/animated-number";
import type { PanelTable, TableStatus } from "@/lib/panel/types";
import { cn } from "@/lib/utils";

import { OpenFor } from "./open-for";
import { STATUS_LABEL } from "./status";

// Cada estado se distingue por color, forma del borde, ícono y texto (nunca solo por el color).
const CARD: Record<TableStatus, string> = {
  free: "border-dashed border-slate-300 bg-white text-slate-500",
  open: "border-amber-400 bg-amber-100 text-amber-950",
  partial: "border-sky-500 bg-sky-100 text-sky-950",
  paid: "border-emerald-700 bg-emerald-600 text-white",
};
const DOT: Record<TableStatus, string> = {
  free: "border border-dashed border-slate-400 bg-white",
  open: "bg-amber-400",
  partial: "bg-sky-500",
  paid: "bg-emerald-600",
};
const ICON = {
  free: CircleDashedIcon,
  open: UtensilsCrossedIcon,
  partial: ChartPieIcon,
  paid: CircleCheckIcon,
} satisfies Record<TableStatus, unknown>;
const ORDER: TableStatus[] = ["free", "open", "partial", "paid"];

export function TableGrid({
  tables, selectedId, onSelect, flashing,
}: {
  tables: PanelTable[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  flashing: ReadonlyMap<string, "payment" | "paid">;
}) {
  const counts = Object.fromEntries(ORDER.map((s) => [s, tables.filter((t) => t.status === s).length])) as Record<TableStatus, number>;
  return (
    <>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Resumen de mesas">
        {ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-full", DOT[s])} />
            <span className="font-semibold tabular-nums">{counts[s]}</span>
            <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
          </li>
        ))}
      </ul>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {tables.map((t) => {
          const Icon = ICON[t.status];
          const blink = flashing.get(t.id);
          const totals = t.bill?.totals;
          const toConfirm = t.bill?.pending.length ?? 0;
          const wantsTerminal = t.bill?.pending.some((p) => p.method === "terminal") ?? false;
          const wantsSinpe = t.bill?.pending.some((p) => p.method === "sinpe") ?? false;
          const pct = totals && totals.total > 0 ? Math.min(100, Math.round((totals.paid / totals.total) * 100)) : 0;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                aria-pressed={selectedId === t.id}
                aria-label={`Mesa ${t.number}, ${STATUS_LABEL[t.status]}${toConfirm > 0 ? `, ${toConfirm === 1 ? "un pago por confirmar" : `${toConfirm} pagos por confirmar`}` : ""}`}
                className={cn(
                  "relative flex min-h-32 w-full flex-col items-start justify-between rounded-2xl border-2 p-3 text-left shadow-sm transition-colors duration-500 active:scale-[0.98]",
                  CARD[t.status],
                  blink === "payment" && "animate-card-blink",
                  blink === "paid" && "animate-card-blink-paid",
                  selectedId === t.id && "ring-4 ring-primary/50",
                  toConfirm > 0 && "border-rose-500 ring-4 ring-rose-500/70",
                )}
              >
                <span className="flex w-full items-start justify-between">
                  <span className="text-4xl leading-none font-extrabold">{t.number}</span>
                  <Icon aria-hidden className="size-6 opacity-80" />
                </span>
                <span className="flex w-full flex-col gap-1">
                  {wantsSinpe ? (
                    <span className="flex w-fit items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                      <SmartphoneIcon className="size-3.5 animate-pulse" aria-hidden /> SINPE por confirmar
                    </span>
                  ) : null}
                  {wantsTerminal ? (
                    <span className="flex w-fit items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                      <CreditCardIcon className="size-3.5 animate-pulse" aria-hidden /> Pide el datáfono
                    </span>
                  ) : null}
                  {t.status === "open" && t.bill ? (
                    <OpenFor openedAt={t.bill.openedAt} className="text-sm font-bold" />
                  ) : (
                    <span className="text-sm font-bold tracking-wide uppercase">{STATUS_LABEL[t.status]}</span>
                  )}
                  {t.status === "partial" && t.bill ? <OpenFor openedAt={t.bill.openedAt} className="text-xs font-medium" /> : null}
                  {totals ? (
                    <span className="text-sm">
                      {t.status === "paid" ? <AnimatedMoney value={totals.total} /> : <>Saldo <AnimatedMoney value={totals.balance} /></>}
                    </span>
                  ) : (
                    <span className="text-sm">&nbsp;</span>
                  )}
                  {t.status === "partial" ? (
                    <span className="mt-0.5 flex items-center gap-2" aria-hidden>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-sky-200">
                        <span className="block h-full rounded-full bg-sky-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="text-xs font-semibold tabular-nums">{pct}%</span>
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
