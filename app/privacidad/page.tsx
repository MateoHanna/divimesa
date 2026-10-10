import type { Metadata } from "next";
import Link from "next/link";

import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos usa Divimesa para mostrar y cobrar su cuenta, para qué, por cuánto tiempo y cómo ejercer sus derechos.",
  // Mientras sea un borrador no se indexa.
  robots: { index: false, follow: true },
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-9 mb-2 text-xl font-bold">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-[#1C1C1E]">
      <header className="border-b border-[#1C1C1E]/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" aria-label="Divimesa, inicio"><DivimesaLogo variant="horizontal" className="h-8" /></Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 leading-relaxed [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1">
        <p role="note" className="mb-6 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          BORRADOR. Este texto todavía no lo ha revisado un abogado y puede cambiar. No es la versión definitiva.
        </p>

        <h1 className="text-3xl font-extrabold tracking-tight">Política de privacidad</h1>
        <p className="mt-2 text-sm text-[#1C1C1E]/65">Última actualización: 10 de octubre de 2026 (borrador).</p>

        <p className="mt-6">
          Esta política explica qué datos suyos se usan cuando escanea el código QR de una mesa y paga su cuenta con Divimesa.
          Está escrita para que se entienda, sin letra menuda.
        </p>

        <H2>1. Quién es el responsable de sus datos</H2>
        <p>
          El responsable de los datos es el <strong>restaurante donde usted paga</strong>: es quien decide emitirle una factura y quien
          recibe su SINPE Móvil. Divimesa es la plataforma que el restaurante usa para mostrarle la cuenta y registrar el pago, y trata
          sus datos solo por cuenta del restaurante y para ese fin. Divimesa es operada por [razón social y cédula jurídica], en
          Costa Rica.
        </p>

        <H2>2. Qué datos se recogen</H2>
        <ul>
          <li><strong>La cuenta de su mesa:</strong> los platos o el total, lo que ya se pagó y lo que falta.</li>
          <li><strong>Su pago:</strong> el monto, la propina si usted la agrega, la forma de pago, la hora y un código corto de referencia (por ejemplo M4-7KQ) para que el restaurante encuentre su SINPE.</li>
          <li><strong>Su nombre, solo si lo escribe</strong> al avisar que hizo el SINPE. Es opcional y ayuda al salonero a reconocer el pago.</li>
          <li><strong>Datos para la factura, solo si usted los pide:</strong> nombre, tipo y número de cédula y correo electrónico. Son opcionales; sin ellos puede pagar igual.</li>
          <li><strong>Un identificador anónimo de su navegador</strong> (se explica en el punto 8), sin nombre ni teléfono, que sirve para saber qué platos está pagando usted.</li>
        </ul>
        <p>No le pedimos cuenta, contraseña, teléfono, ubicación ni acceso a sus contactos.</p>

        <H2>3. Para qué se usan</H2>
        <ul>
          <li>Mostrarle la cuenta de su mesa y dividirla entre quienes pagan.</li>
          <li>Avisar al restaurante que usted pagó y confirmar el pago.</li>
          <li>Emitir su factura, si la pidió.</li>
          <li>Mantener el servicio funcionando y corregir errores.</li>
        </ul>
        <p>No se usan para publicidad ni para perfiles de consumo.</p>

        <H2>4. Datos de tarjeta y de su banco</H2>
        <p>
          Divimesa <strong>no guarda datos de tarjeta</strong> ni de su cuenta bancaria, y esta página nunca se los pide. El pago es un SINPE Móvil
          que usted hace desde la aplicación de su banco, directo al número del restaurante. Divimesa no recibe ni maneja su dinero.
        </p>

        <H2>5. Con quién se comparten</H2>
        <p>
          <strong>No vendemos ni compartimos sus datos con terceros</strong> para publicidad ni para ningún otro fin comercial. Solo los ve:
        </p>
        <ul>
          <li>el restaurante donde usted pagó, incluido su personal de salón, para atender la mesa y emitir la factura;</li>
          <li>los proveedores técnicos que hacen funcionar el servicio, que procesan los datos por nuestra cuenta: el alojamiento de la página (Vercel) y la base de datos (Supabase). Sus servidores pueden estar fuera de Costa Rica;</li>
          <li>una autoridad, si una ley o una orden judicial lo exige.</li>
        </ul>

        <H2>6. Cuánto tiempo se conservan</H2>
        <ul>
          <li>Los datos de la cuenta y del pago se conservan mientras el restaurante los necesite para cuadrar su caja y atender reclamos. Propuesta de este borrador: 12 meses desde el pago, salvo que la ley obligue a conservarlos más tiempo. [Plazo por confirmar con asesoría legal.]</li>
          <li>Los datos de factura se conservan el tiempo que exija la ley tributaria para respaldar la factura emitida. [Plazo por confirmar con asesoría legal.]</li>
          <li>Si usted pide eliminar sus datos y la ley lo permite, se eliminan (punto 7).</li>
        </ul>

        <H2>7. Sus derechos</H2>
        <p>
          La Ley 8968, de Protección de la Persona frente al Tratamiento de sus Datos Personales, le da derecho a saber qué datos suyos se
          tratan (acceso), a corregirlos (rectificación), a pedir que se eliminen (supresión) y a retirar su consentimiento. Para
          ejercerlos escriba a <a className="underline underline-offset-4" href={`mailto:${BRAND.email}`}>{BRAND.email}</a> e indique la fecha, el
          restaurante y el número de mesa, para poder ubicar su pago. También puede pedirlos directamente en el restaurante.
        </p>

        <H2>8. Cookies y almacenamiento en su navegador</H2>
        <ul>
          <li><strong>Para clientes:</strong> la página guarda en su celular un identificador aleatorio (almacenamiento local, no una cookie de seguimiento) para recordar qué platos está pagando y que no se los cobre otra persona al mismo tiempo. Se borra si usted limpia los datos del navegador.</li>
          <li><strong>Para el personal del restaurante:</strong> el panel usa una cookie de sesión (<code>panel_session</code>) que mantiene abierta la sesión del salonero hasta 7 días. Es necesaria para que el panel funcione.</li>
          <li><strong>Demostración pública:</strong> al abrir la demo guardamos una versión cifrada de la dirección IP (un hash, nunca la dirección) para limitar visitas repetidas. No identifica a nadie.</li>
          <li>No usamos cookies de publicidad ni de seguimiento entre sitios.</li>
        </ul>

        <H2>9. Cambios a esta política</H2>
        <p>
          Si la política cambia, se publica aquí con la nueva fecha. Cuando el texto definitivo reemplace a este borrador se quitará el aviso del inicio.
        </p>

        <H2>10. Contacto</H2>
        <p>
          Divimesa, Costa Rica. Correo: <a className="underline underline-offset-4" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.
        </p>
      </main>

      <footer className="border-t border-[#1C1C1E]/10">
        <div className="mx-auto w-full max-w-3xl px-5 py-5 text-sm text-[#1C1C1E]/65">
          <Link className="underline underline-offset-4" href="/">Volver al inicio</Link>
        </div>
      </footer>
    </div>
  );
}
