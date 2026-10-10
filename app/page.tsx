import type { Metadata } from "next";
import Link from "next/link";

import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { BRAND } from "@/lib/brand";
import { computeTotals, formatCRC } from "@/lib/money";

export const metadata: Metadata = {
  title: { absolute: "Divimesa: cada quien paga su parte desde la mesa" },
  alternates: { canonical: "/" },
};

/**
 * Video de la demostración. Mientras esta variable esté vacía, la sección no se muestra.
 * Para activarla: subir el archivo (por ejemplo a public/brand/demo.mp4) y definir
 * NEXT_PUBLIC_DEMO_VIDEO_URL=/brand/demo.mp4 (o una dirección completa) y redesplegar.
 */
const VIDEO_SRC = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL?.trim() || null;

const FOR_RESTAURANT = [
  { title: "El datáfono sigue funcionando igual", text: "Quien prefiera pagar con la tarjeta física o en efectivo lo sigue haciendo. El salonero registra ese pago en el panel y la cuenta se actualiza." },
  { title: "El dinero cae directo a su cuenta", text: "Los pagos de los clientes se depositan en la cuenta del restaurante." },
  { title: "No hay que comprar equipo", text: "Funciona con el celular de cada cliente y con un celular o una tablet para el salonero." },
];

const STEPS = [
  { title: "Escanee", text: "El código QR de la mesa abre la cuenta en su celular. No hay que descargar nada ni registrarse." },
  { title: "Elija", text: "Pague toda la cuenta, solo sus platos o divídala en partes iguales entre quienes están en la mesa." },
  { title: "Pague", text: "Con tarjeta, Apple Pay, Google Pay o SINPE Móvil. El salonero ve el pago al instante en su panel." },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-[#1C1C1E]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <DivimesaLogo className="h-8" />
        <Link href="/panel" className="inline-flex min-h-10 items-center rounded-xl border border-[#1C1C1E]/20 px-4 text-sm font-semibold hover:bg-[#1C1C1E]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D91E18]">
          Ingresar
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-5 pb-16 sm:gap-24 sm:px-8">
        <section className="grid items-center gap-10 pt-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-14 md:pt-10">
          <div className="flex flex-col items-start gap-6">
            <h1 className="max-w-[16ch] text-[2.6rem] leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-6xl">
              Cada quien paga su parte desde la mesa, sin esperar el datáfono
            </h1>
            <p className="max-w-[46ch] text-lg leading-relaxed text-[#1C1C1E]/75">
              Divimesa pone un código QR en cada mesa. Sus clientes ven la cuenta, eligen qué pagar y pagan desde el celular. Usted ve cada pago en el momento.
            </p>
            <a href={BRAND.whatsapp} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-14 items-center rounded-2xl bg-[#D91E18] px-7 text-lg font-semibold text-white transition-colors hover:bg-[#BF1A14] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D91E18]">
              Hablemos por WhatsApp
            </a>
          </div>

          <Bill />
        </section>

        <section aria-labelledby="como-funciona" className="flex flex-col gap-8">
          <h2 id="como-funciona" className="text-3xl font-extrabold tracking-tight">Así paga una mesa</h2>
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2 border-t-2 border-[#1C1C1E] pt-4">
                <span className="text-sm font-semibold text-[#D91E18]">Paso {i + 1}</span>
                <h3 className="text-2xl font-bold">{s.title}</h3>
                <p className="leading-relaxed text-[#1C1C1E]/75">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="restaurante" className="flex flex-col gap-8">
          <h2 id="restaurante" className="text-3xl font-extrabold tracking-tight">Para el restaurante</h2>
          <ul className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {FOR_RESTAURANT.map((f) => (
              <li key={f.title} className="flex flex-col gap-2 border-t-2 border-[#D91E18] pt-4">
                <h3 className="text-xl font-bold">{f.title}</h3>
                <p className="leading-relaxed text-[#1C1C1E]/75">{f.text}</p>
              </li>
            ))}
          </ul>
          <a href={BRAND.whatsapp} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-14 max-w-xl items-center rounded-2xl border-2 border-[#D91E18] px-6 py-3 text-lg font-semibold leading-snug text-[#B3140F] transition-colors hover:bg-[#D91E18] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D91E18]">
            ¿Lo quiere ver con el nombre de su restaurante? Escríbanos por WhatsApp
          </a>
        </section>

        {VIDEO_SRC ? (
          <section aria-labelledby="video" className="flex flex-col gap-4">
            <h2 id="video" className="text-3xl font-extrabold tracking-tight">Véalo funcionando</h2>
            <div className="max-w-3xl overflow-hidden rounded-3xl bg-[#1C1C1E]">
              <video className="aspect-video w-full" src={VIDEO_SRC} controls playsInline preload="metadata" />
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-[#1C1C1E]/10">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-[#1C1C1E]/65 sm:px-8">
          <p>Divimesa, Costa Rica</p>
          <div className="flex gap-5">
            <a className="underline underline-offset-4" href={BRAND.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Una cuenta como la ve el cliente: lo ya pagado va tachado, lo pendiente sigue abierto. */
function Bill() {
  const paid = [["Casado de res", "₡6 500"], ["Chifrijo", "₡4 800"]];
  const open: [string, number][] = [["Ceviche de corvina", 7200], ["Nachos para compartir", 6200]];
  // Mismo cálculo que el sistema real: servicio 10 % e IVA 13 % sobre los platos.
  const total = computeTotals(open.reduce((sum, [, price]) => sum + price, 0), { serviceRate: 0.1, vatRate: 0.13, pricesIncludeTaxes: false }).total;
  return (
    <figure aria-label="Ejemplo de una cuenta con dos platos pagados" className="relative mx-auto w-full max-w-sm rotate-[1.5deg] bg-[#FBFAF8] px-6 pb-9 pt-6 shadow-[0_18px_40px_-18px_rgba(28,28,30,0.45)] ring-1 ring-[#1C1C1E]/10"
      style={{ clipPath: "polygon(0 0,100% 0,100% calc(100% - 10px),95% 100%,90% calc(100% - 10px),85% 100%,80% calc(100% - 10px),75% 100%,70% calc(100% - 10px),65% 100%,60% calc(100% - 10px),55% 100%,50% calc(100% - 10px),45% 100%,40% calc(100% - 10px),35% 100%,30% calc(100% - 10px),25% 100%,20% calc(100% - 10px),15% 100%,10% calc(100% - 10px),5% 100%,0 calc(100% - 10px))" }}>
      <figcaption className="mb-4 flex items-baseline justify-between border-b border-dashed border-[#1C1C1E]/25 pb-3">
        <span className="text-xl font-bold">Mesa 4</span>
        <span className="text-sm text-[#1C1C1E]/60">4 personas</span>
      </figcaption>
      <ul className="flex flex-col gap-2.5 text-lg">
        {paid.map(([n, p]) => (
          <li key={n} className="flex items-baseline justify-between gap-3 text-[#1C1C1E]/45">
            <span className="line-through decoration-2">{n}</span>
            <span className="flex items-baseline gap-2"><span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[13px] font-semibold text-emerald-800">Pagado</span><span className="line-through">{p}</span></span>
          </li>
        ))}
        {open.map(([n, p]) => (
          <li key={n} className="flex items-baseline justify-between gap-3"><span>{n}</span><span className="font-semibold tabular-nums">{formatCRC(p)}</span></li>
        ))}
      </ul>
      <div className="mt-5 flex items-baseline justify-between border-t border-dashed border-[#1C1C1E]/25 pt-3">
        <span className="text-[#1C1C1E]/70">Saldo pendiente</span>
        <span className="text-3xl font-extrabold tracking-tight tabular-nums">{formatCRC(total)}</span>
      </div>
      <p className="mt-1 text-right text-sm text-[#1C1C1E]/60">Incluye servicio e IVA</p>
    </figure>
  );
}
