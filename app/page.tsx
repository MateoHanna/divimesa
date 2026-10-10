import type { Metadata } from "next";
import Link from "next/link";

import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { DemoVideo } from "@/components/demo/demo-video";
import { BRAND } from "@/lib/brand";
import { computeTotals, formatCRC } from "@/lib/money";

const TITLE = "Pago y división de la cuenta por QR en la mesa";
const DESCRIPTION = "Cada quien paga su parte desde el celular y el salonero lo ve al instante. Piloto gratis de 2 semanas para 5 restaurantes fundadores.";
const POSTER = "/video/demo-poster.jpg";

export const metadata: Metadata = {
  title: { absolute: `Divimesa: ${TITLE.charAt(0).toLowerCase()}${TITLE.slice(1)}` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", locale: "es_CR", siteName: "Divimesa", url: "/",
    title: TITLE, description: DESCRIPTION,
    images: [{ url: POSTER, width: 1280, height: 720, alt: "Divimesa: ¿La mesa quiere pagar por separado?" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [POSTER] },
};

const FOR_RESTAURANT = [
  { title: "El datáfono sigue funcionando igual", text: "Quien prefiera pagar con la tarjeta física o en efectivo lo sigue haciendo. El salonero registra ese pago en el panel y la cuenta se actualiza." },
  { title: "El dinero cae directo a su cuenta", text: "Los pagos de los clientes se depositan en la cuenta del restaurante." },
  { title: "No hay que comprar equipo", text: "Funciona con el celular de cada cliente y con un celular o una tablet para el salonero." },
];

const FAQ = [
  { q: "¿Tengo que cambiar mi sistema de caja?", a: "No. Su caja y su datáfono siguen igual. El salonero escribe el total de la cuenta en Divimesa, unos segundos por mesa, y cuando la mesa termina de pagar la cierra en su caja como siempre." },
  { q: "¿Quién hace la factura electrónica?", a: "Su sistema, como hoy. Si el cliente pide factura, sus datos le llegan al salonero junto con el pago." },
  { q: "¿A dónde llega el dinero?", a: "Directo a la cuenta del restaurante. Divimesa nunca recibe ni guarda el dinero de sus clientes." },
  { q: "¿Cuánto cuesta?", a: "El piloto de 2 semanas es gratis. Después es una mensualidad fija por local. Divimesa no cobra comisión por cada pago." },
];

const STEPS: { title: string; text: string; note?: string }[] = [
  { title: "Escanee", text: "El código QR de la mesa abre la cuenta en su celular. No hay que descargar nada ni registrarse." },
  { title: "Elija", text: "Pague toda la cuenta, solo sus platos o divídala en partes iguales entre quienes están en la mesa." },
  { title: "Pague", text: "Con tarjeta, Apple Pay, Google Pay o SINPE Móvil. El salonero ve el pago al instante en su panel.", note: "Durante el piloto, los pagos son por SINPE Móvil. Tarjeta, Apple Pay y Google Pay se activan después." },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-[#1C1C1E]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <DivimesaLogo variant="wordmark" className="h-9" />
        <Link href="/panel" className="inline-flex min-h-10 items-center rounded-xl border border-[#1C1C1E]/20 px-4 text-sm font-semibold hover:bg-[#1C1C1E]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D91E18]">
          Ingresar
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-5 pb-16 sm:gap-24 sm:px-8">
        <section className="grid items-center gap-8 pt-2 text-center lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-10 lg:pt-4 lg:text-left">
          <div className="contents lg:flex lg:flex-col lg:items-start lg:gap-6">
            <h1 className="order-1 mx-auto max-w-[20ch] lg:order-none lg:mx-0 text-[2.4rem] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance sm:text-6xl lg:text-[2.9rem]">
              Cada quien paga su parte desde la mesa, sin esperar el datáfono
            </h1>
            <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row order-3 sm:self-center lg:order-none lg:self-start">
              <Link href="/demo/mesa"
                className="inline-flex h-14 items-center justify-center whitespace-nowrap lg:h-12 lg:px-5 lg:text-base rounded-2xl bg-[#D91E18] px-6 text-lg font-semibold text-white transition-colors hover:bg-[#BF1A14] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D91E18]">
                Pruébelo usted mismo
              </Link>
              <a href={BRAND.whatsappVideo} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-14 items-center justify-center whitespace-nowrap lg:h-12 lg:px-5 lg:text-base rounded-2xl border-2 border-[#1C1C1E] px-6 text-lg font-semibold transition-colors hover:bg-[#1C1C1E] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1C1C1E]">
                Escríbanos por WhatsApp
              </a>
            </div>
            <div className="mx-auto max-w-xl rounded-2xl bg-[#1C1C1E]/[0.04] px-6 py-4 order-4 lg:order-none lg:mx-0">
              <p className="text-lg font-semibold leading-snug">Piloto gratis de 2 semanas para 5 restaurantes fundadores.</p>
              <p className="mt-1 text-[#1C1C1E]/75">Sin instalación ni plazo mínimo.</p>
            </div>
          </div>
          <DemoVideo className="order-2 lg:order-none" />
        </section>

        <section aria-labelledby="como-funciona" className="flex flex-col gap-8">
          <h2 id="como-funciona" className="text-3xl font-extrabold tracking-tight">Así paga una mesa</h2>
          <p className="-mt-4 max-w-[52ch] text-lg leading-relaxed text-[#1C1C1E]/75">
            Divimesa pone un código QR en cada mesa. Sus clientes ven la cuenta, eligen qué pagar y pagan desde el celular. Usted ve cada pago en el momento.
          </p>
          <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-14">
          <ol className="grid gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2 border-t-2 border-[#1C1C1E] pt-4">
                <span className="text-sm font-semibold text-[#D91E18]">Paso {i + 1}</span>
                <h3 className="text-2xl font-bold">{s.title}</h3>
                <p className="leading-relaxed text-[#1C1C1E]/75">{s.text}</p>
                {s.note ? <p className="text-sm leading-snug text-[#1C1C1E]/60">{s.note}</p> : null}
              </li>
            ))}
          </ol>
          <Bill />
          </div>
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
        </section>

        <section aria-labelledby="faq" className="flex flex-col gap-6">
          <h2 id="faq" className="text-3xl font-extrabold tracking-tight">Preguntas frecuentes</h2>
          <dl className="grid gap-x-10 gap-y-8 md:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="flex flex-col gap-2 border-t-2 border-[#1C1C1E] pt-4">
                <dt className="text-xl font-bold">{f.q}</dt>
                <dd className="leading-relaxed text-[#1C1C1E]/75">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="cierre" className="flex flex-col items-center gap-5 rounded-3xl bg-[#1C1C1E]/[0.04] px-6 py-12 text-center">
          <h2 id="cierre" className="max-w-[24ch] text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">¿Lo quiere ver con el nombre de su restaurante?</h2>
          <a href={BRAND.whatsappVideo} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#D91E18] px-7 text-lg font-semibold text-white transition-colors hover:bg-[#BF1A14] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D91E18]">
            Escríbanos por WhatsApp
          </a>
        </section>
      </main>

      <footer className="border-t border-[#1C1C1E]/10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-6 text-sm text-[#1C1C1E]/65 sm:px-8">
          <p>Divimesa, Costa Rica</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a className="underline underline-offset-4" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
            <a className="underline underline-offset-4" href={BRAND.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a className="underline underline-offset-4" href={BRAND.instagram} target="_blank" rel="noopener noreferrer">Instagram {BRAND.instagramHandle}</a>
            <Link className="underline underline-offset-4" href="/privacidad">Privacidad</Link>
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
