"use client";

import { formatCRC } from "@/lib/money";
import type { PanelTable } from "@/lib/panel/types";
import { cn } from "@/lib/utils";

import { STATUS_CLASS, STATUS_LABEL } from "./status";

export function TableGrid({
  tables, selectedId, onSelect,
}: { tables: PanelTable[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
      {tables.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={selectedId === t.id}
            aria-label={`Mesa ${t.number}, ${STATUS_LABEL[t.status]}`}
            className={cn(
              "flex min-h-28 w-full flex-col items-start justify-between rounded-2xl border-2 p-3 text-left transition active:scale-[0.98]",
              STATUS_CLASS[t.status],
              selectedId === t.id && "ring-4 ring-primary/40",
            )}
          >
            <span className="text-3xl leading-none font-bold">{t.number}</span>
            <span className="flex w-full flex-col">
              <span className="text-sm font-semibold">{STATUS_LABEL[t.status]}</span>
              {t.bill ? (
                <span className="text-sm">
                  {t.bill.status === "paid" ? formatCRC(t.bill.totals.total) : `Saldo ${formatCRC(t.bill.totals.balance)}`}
                </span>
              ) : (
                <span className="text-sm">&nbsp;</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
