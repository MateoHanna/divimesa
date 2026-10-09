# Demo: pago y división de cuenta por QR en la mesa

## Contexto

Estoy construyendo un sistema para restaurantes en Costa Rica. Cada mesa tiene un QR fijo. El cliente lo escanea, ve la cuenta de su mesa, elige qué pagar y paga desde el celular. El salonero ve en un panel cómo baja el saldo en vivo.

Esta versión es una DEMO para enseñarle a dueños de restaurantes en noviembre de 2026, en persona y en un video corto. No procesa pagos reales. Pero la arquitectura tiene que ser la misma del producto real, para que después solo haya que conectar una pasarela de verdad (Tilopay, ONVO, TeleDólar o la del banco del restaurante).

Prioridades, en este orden:
1. Que el flujo completo funcione sin fallar frente a un cliente.
2. Que se vea bien y cargue rápido en el celular.
3. Que el código quede listo para conectar pagos reales.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase en la nube (proyecto gratis, sin Docker): Postgres + Realtime. Migraciones en `supabase/migrations` y datos de ejemplo en `supabase/seed.sql`
- Deploy en Vercel
- Librerías permitidas: @supabase/supabase-js, @supabase/ssr, zod, qrcode.react (o equivalente). Preguntame antes de agregar cualquier otra dependencia.

## Las tres piezas

1. **Página del cliente** (`/m/[token]`): se abre al escanear el QR de la mesa. Mobile first.
2. **Panel del salonero** (`/panel`): estado de todas las mesas en vivo. Pensado para tablet o celular.
3. **Servidor**: API routes de Next.js + funciones de Postgres. Recibe los webhooks de la pasarela y descuenta saldos. Toda la lógica de dinero vive aquí, nunca en el navegador.

## Reglas de negocio

**Moneda.** Colones (CRC), enteros, sin decimales. Formato `₡12 500` con `Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 })`.

**Impuestos.** Configurables por restaurante:
- `service_rate` = 0.10 (servicio) y `vat_rate` = 0.13 (IVA), ambos calculados sobre el subtotal.
- `prices_include_taxes` (default `false`). Si es `false`: total = subtotal + servicio + IVA.
- Mostrar siempre el desglose: subtotal, servicio, IVA, total.

**Cuenta.** Una cuenta abierta por mesa. Dura lo que dure abierta, no expira por tiempo.
- Saldo pendiente = total − suma de pagos confirmados.
- El saldo es la fuente de verdad. Cuando llega a 0, todas las líneas quedan pagadas aunque se hayan cubierto con pagos por monto.
- Ningún pago puede cobrar más que el saldo pendiente.

**Modos de pago del cliente** (todos sobre el saldo pendiente):

1. **Pagar todo:** paga el saldo completo.
2. **Pagar mis platos:** selecciona líneas. Monto = suma de esas líneas + su parte proporcional de servicio e IVA.
   - Al seleccionar, las líneas quedan reservadas a esa sesión por 3 minutos para que nadie más las pague. Si no paga, se liberan solas (revisar `reserved_until < now()` al leer, no hace falta cron).
   - Plato compartido: opción "Dividir este plato" entre N personas. La línea se convierte en N líneas de precio/N y la última absorbe el redondeo.
   - Las líneas pagadas se muestran tachadas con la etiqueta "Pagado".
3. **Partes iguales:** pregunta "¿Entre cuántas personas?". El primero que lo elige fija la división: cuota = saldo pendiente en ese momento / N, y la última cuota absorbe el redondeo. Desde ahí la cuenta queda en modo partes iguales: los demás ven "Faltan X de N partes, cada una de ₡Y" y la selección de platos se deshabilita. El salonero puede cancelar ese modo desde el panel.

**Propina extra.** Opcional: 0%, 5%, 10% o monto libre, aparte del servicio. Se guarda separada del monto que reduce el saldo.

**Pagos fuera del QR.** El datáfono y el efectivo siguen existiendo. Desde el panel el salonero registra un pago con datáfono o en efectivo, por monto o por líneas, y el saldo baja igual que con el QR.

**Cierre.** Cuando el saldo llega a 0, la cuenta pasa a "pagada", el panel muestra una alerta ("Mesa 4 pagó completo") y el salonero toca "Liberar mesa".

**Factura electrónica (simulada).** Antes de pagar, campos opcionales: nombre, tipo de cédula (física o jurídica), número y correo. Después del pago se muestra un comprobante en pantalla con "Factura enviada a correo@...". No se emite factura real ni se manda ningún correo.

## Flujo del cliente (`/m/[token]`)

1. Si la mesa no tiene cuenta abierta: "Esta mesa todavía no tiene una cuenta abierta. Pídale la cuenta al salonero." La página se actualiza sola cuando el salonero abre la cuenta.
2. Si tiene cuenta: nombre del restaurante, número de mesa, platos con precio, subtotal, servicio, IVA, total, pagado y saldo pendiente.
3. Tres botones grandes: Pagar todo, Pagar mis platos, Partes iguales.
4. Resumen: monto a pagar, propina extra y datos de factura (sección colapsada, opcional).
5. Método de pago: Tarjeta, Apple Pay, Google Pay, SINPE Móvil. En la demo todos son simulados.
6. Checkout simulado, confirmación y comprobante.
7. Todo se actualiza en vivo si otra persona de la mesa paga mientras tanto. Si lo que iba a pagar ya lo pagó otro, avisar y recalcular antes de cobrar.

Lenguaje: español de Costa Rica, tratando de usted, textos cortos, botones grandes. Tiene que cargar en menos de 2 segundos en 4G.

## Panel (`/panel`)

- Acceso con PIN (variable de entorno `PANEL_PIN`), guardado en una cookie httpOnly.
- Grilla de mesas con estado y color: libre, abierta, pagando (tiene pagos parciales), pagada.
- Abrir cuenta, agregar y quitar platos del menú con cantidad, y editar el precio de una línea.
- Ver el QR de cada mesa para imprimir, y un botón "Mostrar QR grande".
- Lista de pagos de la cuenta en vivo: hora, método, monto y qué cubrió.
- Registrar pago con datáfono o efectivo.
- Cancelar modo partes iguales, liberar mesa y cerrar cuenta.
- Sonido corto o vibración cuando entra un pago.

## Pagos: arquitectura

Interfaz en `lib/payments/`:

```ts
interface PaymentProvider {
  id: string;
  createCheckout(p: {
    paymentId: string;
    amount: number;          // colones, entero
    currency: 'CRC';
    description: string;
    returnUrl: string;
  }): Promise<{ redirectUrl: string; providerRef: string }>;
  parseWebhook(req: Request): Promise<{ providerRef: string; status: 'paid' | 'failed' }>; // valida la firma
}
```

Flujo, igual para cualquier pasarela:

1. El cliente pide pagar: `POST /api/payments`. El servidor calcula el monto (nunca confía en el monto que manda el navegador), crea el registro en `payments` con estado `pending` y llama a `createCheckout`.
2. El cliente va al `redirectUrl`.
3. La pasarela llama a `POST /api/webhooks/[provider]`. El servidor valida la firma y llama a una función de Postgres `confirm_payment(provider_ref)` que, en una transacción con `select ... for update` sobre la cuenta, marca el pago como `paid`, marca las líneas cubiertas como pagadas y recalcula el saldo.
4. Idempotencia: si el mismo webhook llega dos veces, no descuenta dos veces (`provider_ref` único).
5. Realtime avisa a la página del cliente y al panel.

**Proveedor `mock`** (el que usa la demo): `createCheckout` devuelve `/checkout-demo/[paymentId]`, una pantalla que imita un checkout con el monto, el método elegido y un botón "Pagar". Al tocarlo espera unos 1,5 segundos y el servidor se manda a sí mismo el webhook a `/api/webhooks/mock` firmado con `MOCK_WEBHOOK_SECRET`. Incluir una forma discreta de simular "Pago rechazado".

El proveedor se elige con `PAYMENT_PROVIDER=mock`.

## Modelo de datos (propuesta, ajustala si hace falta)

- `restaurants`: id, name, primary_color, logo_url, service_rate, vat_rate, prices_include_taxes
- `tables`: id, restaurant_id, number, qr_token (aleatorio y no adivinable)
- `menu_items`: id, restaurant_id, name, category, price, active
- `bills`: id, table_id, status (open, paid, closed), split_mode (null o 'equal'), split_parts, split_share_amount, opened_at, closed_at
- `bill_items`: id, bill_id, menu_item_id, name, unit_price, quantity, status (pending, paid), reserved_by_session, reserved_until, paid_by_payment_id
- `payments`: id, bill_id, amount, tip_amount, method (card, apple_pay, google_pay, sinpe, terminal, cash), source (qr, panel), provider, provider_ref (único), status (pending, paid, failed), created_at, paid_at
- `payment_items`: payment_id, bill_item_id
- `invoice_requests`: payment_id, name, id_type, id_number, email. Esta tabla no se puede leer desde el navegador.

Seguridad:
- RLS activado en todas las tablas.
- El navegador solo lee lo necesario para mostrar cuentas (vía Realtime) y nunca escribe directo. Toda escritura pasa por API routes con la service role key.
- Los datos de factura nunca se exponen al cliente anónimo.
- Sesión del cliente: un id aleatorio en localStorage (envuelto en try/catch) para las reservas de platos. Los clientes no hacen login.

## Datos de ejemplo (seed)

- Restaurante "Restaurante Demo".
- Menú tico de unos 15 platos con precios realistas de San José (₡2 000 a ₡9 500): casado de pollo, casado de res, chifrijo, ceviche, patacones con frijoles, arroz con camarones, sopa negra, hamburguesa, nachos para compartir, refresco natural, imperial, café chorreado, tres leches, etc.
- 8 mesas. La Mesa 4 con una cuenta abierta de 6 personas por unos ₡48 000, lista para la demo.
- Botón "Reiniciar demo" en el panel que vuelve todo a este estado.

## Pulido para la demo

- Desde el panel se pueden cambiar el nombre y el color del restaurante, para enseñarle a cada dueño la demo con el nombre de su local.
- Página `/demo` para grabar el video: a la izquierda la página del cliente dentro de un marco de celular, a la derecha el panel, los dos en vivo.
- Animación suave cuando baja el saldo y cuando una línea pasa a pagada.
- Estados de carga y de error claros. Ninguna pantalla en blanco.

## Fuera de alcance (no construir)

Integración con sistemas de caja (POS), factura electrónica real, envío de correos, toma de pedidos, menú digital, reservaciones, pagos reales, registro de varios restaurantes, app nativa.

## Orden de trabajo

- **Fase 0:** proyecto, conexión a Supabase, Tailwind, shadcn y deploy vacío en Vercel.
- **Fase 1:** migraciones, seed y funciones de cálculo en `lib/money.ts` (impuestos, partes iguales, redondeo, plato dividido) con tests unitarios.
- **Fase 2:** panel del salonero.
- **Fase 3:** página del cliente.
- **Fase 4:** pagos mock, webhook, `confirm_payment` y Realtime.
- **Fase 5:** pulido de la demo.
- **Fase 6 (opcional):** proveedor Stripe en modo prueba para mostrar la hoja real de Apple Pay y Google Pay. Verificar si acepta CRC; si no, usar USD solo para la prueba.

Al terminar cada fase: correr tests y lint, y explicarme qué quedó y cómo probarlo.

## Prueba de aceptación (tiene que salir completa sin errores)

1. En el panel: abrir la Mesa 2, agregar 4 platos y mostrar el QR.
2. Celular A escanea, elige "Pagar mis platos", selecciona 2 platos y paga con tarjeta (mock). El panel muestra el pago y el nuevo saldo en menos de 2 segundos.
3. Celular B abre la misma mesa: ve esos 2 platos como pagados y no los puede seleccionar.
4. Celular B divide los nachos entre 3 y paga una parte.
5. El salonero registra un pago con datáfono por ₡5 000.
6. Celular C elige "Partes iguales" entre 2 para el resto y paga. Celular D paga la segunda parte.
7. El saldo queda en 0, la mesa pasa a "pagada", el panel avisa y el salonero libera la mesa.
8. Dos personas intentan pagar el mismo plato al mismo tiempo: solo una lo logra y la otra ve un aviso claro.
9. El mismo webhook enviado dos veces no descuenta dos veces.
10. "Reiniciar demo" deja todo como al principio.

## README

Incluir: cómo correrlo en local, variables de entorno, cómo correr las migraciones y el seed, cómo hacer deploy en Vercel y cómo cambiar de proveedor de pago.
