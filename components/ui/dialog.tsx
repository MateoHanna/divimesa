"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { useBackLayer } from "@/components/panel/use-back-layer";
import { cn } from "@/lib/utils";

/** El botón de atrás del celular cierra la ventana de arriba (ver use-back-layer). */
function Dialog({ open, onOpenChange, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  useBackLayer(!!open, () => onOpenChange?.(false));
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />;
}
const DialogClose = DialogPrimitive.Close;

/** Ventana modal: centrada en tablet y como hoja desde abajo en celular. */
function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto bg-background p-5 shadow-lg outline-none",
          "inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          className,
        )}
        {...props}
      >
        <div className="sticky top-0 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 border-b bg-background px-5 pt-5 pb-3">
          <div>
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background text-foreground hover:bg-accent" aria-label="Cerrar">
            <XIcon className="size-6" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogClose, DialogContent };
