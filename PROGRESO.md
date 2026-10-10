# PROGRESO

Para retomar en otra sesión: leer `SPEC.md`, este archivo, y seguir desde "Siguiente paso".

## Estado

| Fase | Estado |
| --- | --- |
| 0. Proyecto, Supabase, Tailwind, shadcn, deploy | Completa. El repo está conectado a Vercel: cada push despliega solo |
| 1. Migraciones, seed, `lib/money.ts` | Completa |
| 2. Panel del salonero (`/panel`) | Código completo y probado en lógica y SQL; falta la prueba de punta a punta en el sitio desplegado |
| 3. Página del cliente (`/m/[token]`) | Código completo, SQL probado contra Supabase y 85 tests; falta probarla en un celular real |
| 4. Checkout simulado, webhook, comprobante, Realtime | Código completo; SQL y Realtime probados contra Supabase; falta la prueba a mano en celulares tras el deploy |
| 5. Pulido de la demo (marca, `/demo`, avisos, animaciones, estados de carga y error) | Código completo, tsc, eslint, 115 tests y `next build` limpios; migración 0008 aplicada; falta la prueba visual a mano |
| 5b. Marca Divimesa, portada, vista previa, dominio | Código completo; migración 0009 aplicada; falta cambiar `APP_URL` a mano (ver Pendientes) |
| 6 | Sin empezar |

## Qué quedó

**Fase 0**
- Next.js 16 (App Router, TypeScript, Tailwind v4) en la raíz de `DemoQr`.
- Librerías: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `qrcode.react`. Dev: `vitest`. De shadcn: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`.
- `components/ui`: button, card, input, badge (escritos a mano con el estilo de shadcn).
- `lib/env.ts` (validación con zod), `lib/supabase/server.ts` (service role), `lib/supabase/browser.ts` (solo Realtime), `/api/health`, portada simple.
- Supabase `demo-qr`: ref `xauhctelzpymsafxlgtj`, us-east-1, URL https://xauhctelzpymsafxlgtj.supabase.co
- Vercel `demo-qr`: id `prj_PITlYGG5Kg0medcKxA6syf04DMKt`, dominio de producción **https://demo-qr-steel.vercel.app**, sin repo conectado todavía. Tiene las variables públicas y `PAYMENT_PROVIDER=mock`. La cuenta de Vercel ya tiene GitHub conectado (usuario `MateoHanna`).
- Deploy de producción (2026-10-09): `dpl_CiwFEp61SQJiT73kRnxy18Ct4ZgW`, commit `c996adf`, en https://demo-qr-steel.vercel.app. `/api/health` responde `ok: true`, Supabase 200 (unos 400 ms) y `service_role_key_set: true`. La portada carga sin login.
- Repo: https://github.com/MateoHanna/demo-qr (privado, rama `main`), creado y subido por Mateo.
- Vercel: protección de login (`ssoProtection`) apagada. Variables cargadas: públicas y `PAYMENT_PROVIDER` (todos los destinos), `APP_URL=https://demo-qr-steel.vercel.app` (production y preview), y `SUPABASE_SERVICE_ROLE_KEY`, `PANEL_PIN`, `MOCK_WEBHOOK_SECRET` como sensibles (solo production, las cargó Mateo).
- `.env.local` (no se sube a git) ya tiene `SUPABASE_SERVICE_ROLE_KEY`, `PANEL_PIN` y `MOCK_WEBHOOK_SECRET` (64 caracteres, generado por Claude). `APP_URL` local es `http://localhost:3000`.

**Fase 1**
- `lib/money.ts` con 33 tests: `formatCRC`, `computeTotals`, `balance`, `splitEqual`, `splitItem`, `equalShareDue`, `tipAmount`, `amountForItems`.
- `lib/app-url.ts` con 8 tests: `getAppUrl()` y `tableUrl(token)`. Solo leen `APP_URL`; ignoran `VERCEL_URL` y `VERCEL_BRANCH_URL`.
- `tests/fixtures/totals.json`: 11 casos compartidos entre TypeScript y SQL. Verificado: `calc_totals` en Supabase da lo mismo en los 11.
- `supabase/migrations/`: 0001 (esquema), 0002 (funciones y Realtime) y 0003 (`reset_demo`, `factory_reset`). La 0001 y la 0002 se aplicaron con el conector. **La 0003 la aplicó Mateo a mano en el SQL Editor de Supabase** (el conector la canceló dos veces por su confirmación de SQL que borra datos), y también corrió `seed.sql` a mano. Por eso la lista de migraciones del conector no la muestra.
- Verificado con el conector el 2026-10-09: 1 restaurante, 15 platos, 8 mesas con tokens distintos, 1 cuenta abierta (Mesa 4, 10 líneas). `bill_totals`: subtotal 39500, servicio 3950, IVA 5135, total 48585, pagado 0, saldo 48585. `anon` no puede ejecutar ninguna función.

**Fase 2 (panel del salonero)**
- Migración `0004_panel_payments.sql`, aplicada con el conector (sin borrados). Funciones: `calc_items_amount`, `finish_if_paid`, `settle_payment`, `confirm_payment` (adelantada de la fase 4: idempotente por `provider_ref`, nunca cobra más que el saldo, guarda el sobrante en `overpaid_amount`), `record_panel_payment`, `panel_open_bill`, `panel_add_items`, `lock_editable_item`, `panel_void_item`, `panel_set_price`, `panel_cancel_split`, `panel_close_bill`, `panel_release_table`. Solo `service_role` las ejecuta. Los errores salen como código en el mensaje (`amount_exceeds_balance`, `item_reserved`, `total_below_paid`...).
- `supabase/tests/panel_payments.sql`: escenario A a K en una transacción que termina con error a propósito (no deja datos). Corrido contra Supabase: todos los valores dieron lo esperado (totales 16000/1600/2080/19680, pago por platos 10093, confirmación repetida sin doble cobro, sobrante 1235, no se puede bajar el total por debajo de lo pagado, líneas reservadas protegidas).
- Seguridad: cookie `panel_session` firmada con HMAC (clave: la service role key; el mensaje incluye el PIN, así que cambiar `PANEL_PIN` cierra todas las sesiones), httpOnly, SameSite=Lax, `secure` en https, 7 días. PIN comparado en tiempo constante, retraso al fallar y límite de 5 intentos por minuto por IP (en memoria; en serverless es débil). Toda ruta `/api/panel/*` verifica cookie y que el `Origin` sea el mismo host. `/panel/qr/[mesa]` también pide la cookie y no consulta el token sin ella. El estado que recibe el navegador no incluye tokens de QR.
- QR: codifica `tableUrl(qr_token)` = `${APP_URL}/m/<token>`, nunca el número de mesa. **`/m/<token>` no existe hasta la fase 3: escanear hoy da 404.**
- API: `GET /api/panel/state`, `POST /login`, `/logout`, `/bills`, `/bills/[id]/items|payments|cancel-split|close|release`, `PATCH|DELETE /items/[id]`, `POST /demo/reset`, `/demo/factory-reset`. Cada mutación devuelve el estado fresco.
- UI: `components/panel/*`. Grilla con color y texto por estado (Libre, Abierta, Pago parcial, Pagada); en celular el detalle ocupa toda la pantalla, en tablet es una columna lateral. Líneas agrupadas ("2 × Casado"), quitar una unidad, cambiar el precio de una línea, agregar platos con cantidad, cobrar por monto o por platos (datáfono o efectivo), lista de pagos, liberar mesa (solo si está pagada), cerrar cuenta con saldo (con confirmación), cancelar partes iguales, menú con los dos reinicios con confirmación. Consulta cada 3 s solo con la pestaña visible; pitido y vibración con cada pago nuevo y aviso "Mesa N pagó completo" (el sonido se activa con el primer toque).
- Tests: `lib/panel/panel.test.ts` (sesión, PIN, limitador, errores, estado de mesas, agrupación y el monto por platos con `tests/fixtures/items-amount.json`, que también se verificó en SQL). Total 66 tests, lint y typecheck limpios, `next build` ok.
- **Ajustes tras la primera prueba en celular (2026-10-09):**
  - Todas las ventanas tienen salida: encabezado fijo con una X grande (no se pierde al desplazar), botón "Cancelar" en cobro y precio, "Listo, volver a la mesa" al agregar platos. El botón de atrás del celular cierra la ventana de arriba y, desde el detalle, vuelve a la grilla (`components/panel/use-back-layer.ts`, una entrada de historial por capa). Tras cobrar, la ventana se cierra y sale el aviso "Pago de ₡X registrado en la Mesa N".
  - "Cerrar cuenta sin cobrar el saldo" ahora está en el menú de tres puntos del detalle (con confirmación), lejos de "Registrar pago".
  - "Mostrar QR grande" quedó como enlace secundario al pie del detalle. El menú del panel tiene "Imprimir QR de todas las mesas" (`/panel/qr`: hoja A4 con las 8 mesas, nombre del restaurante y número; pide la cookie del PIN).
  - La lista de pagos muestra qué platos cubrió cada pago por platos (`payment_items`).
  - **Sin probar todavía en un navegador a 390 px**: la VM no puede iniciar sesión en el sitio. Falta confirmar en el celular el botón de atrás y la hoja impresa.
- Reglas asumidas: el pago por platos del salonero usa el mismo cálculo proporcional que el cliente; el pago por monto es libre hasta el saldo; con partes iguales activas no se pueden cambiar platos ni cobrar por platos (sí por monto).

**Fase 3 (página del cliente)**
- Migraciones `20261009000005_client_flow.sql` y `20261009000006_client_state_order.sql` (ya aplicadas en Supabase): `client_state`, `client_reserve_items`, `client_split_item`, `client_start_split`, `client_create_payment`, `client_cancel_payment`, `panel_unsplit_item`. Escenario completo en `supabase/tests/client_flow.sql` (corrido contra la base, todos los valores esperados coinciden).
- `/m/[token]`: la cuenta se ve de una (se dibuja en el servidor, sin pedir datos). Encabezado con restaurante, mesa y "No necesita descargar nada ni registrarse". Tres modos: pagar todo, mis platos (reserva de 3 minutos con cronómetro, "Dividir" un plato entre N) y partes iguales. Propina opcional, datos de factura colapsados, nota de ajuste ("Ya se pagaron ₡X por otro medio; su parte se ajustó."), cuatro métodos. Se actualiza cada 3 s con la pestaña visible y avisa si otra persona pagó o apartó lo que había elegido.
- Mismo celular que inicia un pago nuevo: se cancela su pago pendiente anterior y sus propias reservas no lo bloquean.
- `/checkout-demo/[paymentId]` (provisional): muestra monto, propina y método; "Volver" cancela el pago pendiente y libera lo apartado. El botón "Pagar" está deshabilitado hasta la fase 4.
- Cuenta pagada o cerrada: "Esta cuenta ya está pagada. ¡Gracias!". Si el salonero abre otra cuenta en la mesa, la página pasa sola a la nueva.
- Panel: "Deshacer división" en los platos que el cliente dividió, mientras ninguna parte esté pagada ni en pago.
- Proveedor de pago: interfaz en `lib/payments/` con proveedor mock (firma HMAC del webhook). El webhook y el pago simulado son de la fase 4.
- Confirmado en SQL (transacción revertida): `reset_demo()` borra pagos (incluidos pendientes) y reservas; queda 1 cuenta abierta en la Mesa 4 con total ₡48 585.
- **Sin probar en un navegador real a 390 px**: la VM no puede iniciar sesión en el sitio (el PIN no lo escribe Claude).

**Fase 4 (checkout simulado, webhook, comprobante, Realtime)**
- Migración `20261009000007_checkout.sql` (aplicada en Supabase): `restaurants.show_decline_demo`, `fail_payment(provider_ref)`, `payment_receipt(payment_id)` y `client_state` con `outcome` (`paid` o `closed`) cuando la cuenta terminó.
- `/checkout-demo/[paymentId]`: monto, propina, método, "Pagar" y "Volver". "Pagar" llama a `POST /api/checkout-demo/[id]/pay`, que espera 1,5 s, manda el webhook firmado a `/api/webhooks/mock` y **espera a que el webhook termine antes de responder** (no queda nada en segundo plano que Vercel pueda cortar).
- Webhook `POST /api/webhooks/[provider]`: valida la firma HMAC (401 si falla, 400 si el cuerpo no sirve, 404 si el pago no existe), luego `confirm_payment` o `fail_payment`. Repetido no descuenta dos veces (probado en SQL y en Vitest). La lógica está en `lib/payments/webhook.ts` y `lib/payments/mock-checkout.ts`.
- Interruptor "Mostrar 'Simular rechazo' en el checkout" en el menú del panel, guardado por restaurante (`restaurants.show_decline_demo`), apagado por defecto. Cuando está encendido, el checkout muestra un enlace gris "Simular rechazo" al pie. El servidor también lo exige: con el interruptor apagado, el rechazo responde 403. "Reiniciar demo" y "Restaurar valores de fábrica" no lo tocan.
- Rechazo: el pago pasa a fallido, se libera lo apartado y el cliente vuelve a `/m/<token>` con "El pago fue rechazado y no se cobró nada...".
- Comprobante (en la misma URL del checkout cuando el pago ya está pagado): monto, propina, total, método, fecha y "Factura enviada a correo@..." si puso correo. No sale ningún correo.
- Cuenta terminada: "Esta cuenta ya está pagada. ¡Gracias!" si se pagó completa (aunque el salonero ya liberó la mesa) y "Esta cuenta ya se cerró." si se cerró con saldo pendiente.
- Realtime: el panel escucha `restaurant:<uuid>` y la página del cliente `table:<uuid>`. Cada mensaje dispara una consulta inmediata (con 120 ms de espera para juntar varios). La consulta cada 3 s sigue como respaldo. La librería de Supabase se carga después de mostrar la cuenta.
- **Realtime verificado en un navegador real** (panel integrado de la app de escritorio, suscripción desde el dominio de producción con la anon key): conectó (`SUBSCRIBED`), recibió `realtime.send` directo y también el aviso que dispara el trigger al abrir una cuenta. Latencia medida de punta a punta: unos 84 ms (reloj del navegador contra reloj de la base, con la salvedad de que pueden diferir unos ms). Para llegar a "menos de 2 s" en el panel falta sumar la consulta que sigue al aviso (una sola API route); eso se confirma con el pitido en el celular.
- Prueba de aceptación del SPEC: `supabase/tests/acceptance.sql` cubre los pasos 1 a 10 contra las funciones SQL (todo coincide con lo esperado, valores al final del archivo), más rechazo y cuenta cerrada. 99 tests de Vitest.
- **Sin probar en celulares reales** (la VM no puede iniciar sesión en el panel): el pitido, el diseño en pantalla chica y el flujo completo en el sitio desplegado. Lista corta en la respuesta de cierre de fase.

**Fase 5**
- Marca por restaurante: el panel tiene "Personalizar restaurante" (menú) para cambiar nombre, color y logo. El texto sobre el color se elige solo por contraste (`lib/branding.ts`). El logo se sube a un bucket público `logos` (migración `20261009000008_branding.sql`, ya aplicada), se valida por bytes (PNG, JPG, WebP, máx. según `LOGO_MAX_BYTES`) y se reduce en el navegador antes de subir. Sin logo se muestra la inicial.
- `/demo`: el cliente (`/m/<token>`) en un marco de celular a la izquierda y el panel a la derecha, los dos en vivo. `?barra=0` oculta la barra superior para grabar. El sonido necesita un toque dentro del panel (política del navegador).
- Grilla: cada estado (libre, abierta, pago parcial, pagada) con color, ícono y barra de avance distintos, y leyenda con conteos.
- Animaciones: el saldo cuenta hacia abajo (`AnimatedMoney`) y la línea que pasa a pagado destella. Respetan `prefers-reduced-motion`.
- Avisos del panel (`lib/panel/events.ts`, `use-panel.ts`): pago normal = aviso arriba con mesa, monto y método, pitido corto, se quita a los 5 s y la tarjeta parpadea. Mesa pagada completa = tarjeta verde, aviso fijo con otro sonido y botón "Liberar mesa" hasta que el salonero lo toque.
- Carga y error: `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, esqueletos y banners de "sin conexión" en panel y cliente. Landing nueva en `/`.
- Página del cliente más confiable: nombre y logo del local, franja de confianza, pie con el dominio y qué se hace con el pago.
- **Sin probar**: nada de la fase 5 se vio en un navegador real (la VM no puede entrar al panel de producción). Pendiente a mano: subir logo y cambiar color, `/demo`, pitidos, parpadeo, aviso fijo, pantallas de error, diseño en celular chico.
- Sobrante: `.git/harness-src.tgz` es un archivo temporal mío dentro de `.git`; se puede borrar. `factory_reset` no reinicia `show_decline_demo`. No se agregó la marca "Divimesa" a la interfaz.

**Fase 5b (marca Divimesa)**
- Archivos de marca en `public/brand/` usados tal cual. `app/icon.svg` y `app/apple-icon.png` salen de `divimesa-app.*`, `app/favicon.ico` se generó del PNG de 1024. Logo horizontal en el panel (`components/brand/divimesa-logo.tsx`) y pie "Pagos con Divimesa" en la página del cliente y el checkout.
- Tipografía Outfit con `next/font/local` (`app/fonts/outfit-latin-wght.woff2`, licencia OFL en la misma carpeta). Se copió el archivo del paquete `@fontsource-variable/outfit` sin dejarlo como dependencia, porque la VM no alcanza Google Fonts y la regla es no sumar dependencias. Solo subconjunto latino (32 KB).
- Colores: escarlata `#D91E18` es el color por defecto del restaurante (migración 0009: columna, fila actual si seguía en `#0f766e`, y `factory_reset`). Si el dueño elige otro color, los botones lo siguen. Texto sobre el color elegido: blanco, casi negro `#111` o negro puro según contraste (4,5 o más garantizado, probado con 216 colores).
- Errores en ámbar con ícono (`components/ui/error-note.tsx`, y `--destructive` es ámbar `#b45309`). El rojo queda solo para la marca. "pagado" sigue en verde.
- Panel: nombre del restaurante en grande y logo de Divimesa chico al lado.
- Portada `/`: frase, cuenta de ejemplo con platos tachados, tres pasos, botón a `https://wa.me/18063006454`, hueco de video (`VIDEO_SRC` en `app/page.tsx`; con una dirección ahí aparece el reproductor). Sin precios, tratando de usted.
- Vista previa al compartir: Open Graph y Twitter en `app/layout.tsx`, imagen `public/brand/og-divimesa.png` (1200x630), `metadataBase` fijo a `https://divimesa.com` (`lib/brand.ts`).
- Verificado en un navegador del contenedor: la portada a 390 y 1280 px. Sin ver en pantalla: panel, cliente y `/demo` con la marca nueva.
- Dominio: `https://divimesa.com/api/health` responde con esta app (mismo Supabase). No pude leer ni editar el proyecto de Vercel desde la sesión (403 de permisos), así que `APP_URL` sigue en `https://demo-qr-steel.vercel.app` y el redirect de `www` sin confirmar.
- Ajustes de la portada: "Ingresar" arriba a la derecha lleva a `/panel` (se quitó del pie). El tiquete de ejemplo calcula el saldo con `computeTotals` (₡13 400 de platos, servicio 10 % e IVA 13 % = ₡16 482) y dice "Incluye servicio e IVA". Sección "Para el restaurante" con el segundo botón de WhatsApp. El video queda oculto hasta definir `NEXT_PUBLIC_DEMO_VIDEO_URL` (por ejemplo `/brand/demo.mp4` con el archivo en `public/brand/`) y redesplegar.
- Panel instalable: `public/panel.webmanifest` (inicio y alcance `/panel`, `display: standalone`, íconos `public/brand/pwa-*.png`) enlazado desde `app/panel/page.tsx`, más las metas de iOS. En Android/Chrome se agrega desde el menú ("Instalar app" o "Agregar a pantalla de inicio"); en iPhone/iPad, Compartir y "Agregar a inicio". No se probó en un dispositivo real.
- Logo nuevo (Mateo reemplazó `public/brand/`): se regeneraron desde ahí `app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`, `public/brand/og-divimesa.png` (1200x630, logo horizontal) y los `pwa-*.png` del panel. Portada: `divimesa-logo.svg` (solo el nombre). Pie "Pagos con Divimesa" del cliente: `divimesa-logo.svg`. Panel: `divimesa-horizontal.svg` (ícono y nombre). Componente: `components/brand/divimesa-logo.tsx` (`variant="horizontal" | "wordmark"`, `dark` usa las versiones de fondo oscuro). Si se vuelve a cambiar el logo, repetir esa regeneración (los comandos son `convert` sobre `divimesa-app-1024.png` y `divimesa-horizontal.png`).
- Sobrantes: `.git/harness-src.tgz` y `.git/landing-src.tgz` son archivos temporales míos, se pueden borrar.

## Decisiones tomadas

- El rechazo discreto es un interruptor del panel por restaurante (no un parámetro en la URL), así se activa antes de una demo sin tocar la dirección del celular.
- El comprobante vive en la URL del checkout y se identifica solo por el uuid del pago (no adivinable). Muestra el correo de factura a quien tenga esa URL.
- Líneas separadas por cantidad (3 imperiales = 3 líneas), agrupadas visualmente en el panel.
- "Reiniciar demo" solo borra cuentas y pagos y deja la Mesa 4 abierta; conserva nombre, color, tasas, menú y mesas. "Restaurar valores de fábrica" vuelve todo al seed. Ambos conservan las mesas y sus QR.
- Canales de Realtime con uuid (`bill:`, `table:`, `restaurant:` + uuid), nunca con el número de mesa. El mensaje solo dice "cambió algo"; el navegador vuelve a pedir el estado a una API route. Las tablas no tienen políticas para `anon` y las funciones solo las ejecuta `service_role`.
- **Respaldo por consulta:** la página del cliente y el panel vuelven a pedir el estado cada 3 segundos, solo mientras la pestaña está visible (`document.visibilityState`). Al volver a la pestaña se consulta de inmediato. Sirve de red de seguridad si Realtime falla.
- **"Pagar mis platos":** cobra la parte proporcional del saldo pendiente (`saldo × mis líneas / líneas pendientes`); si elige todas las líneas que quedan, cobra el saldo exacto. Cuando el monto queda distinto al que tocaría sin pagos por otro medio, la pantalla muestra una línea que lo explica, por ejemplo "Ya se pagaron ₡5 000 por otro medio; su parte se ajustó". Ese monto sale de la suma de los pagos confirmados de tipo `amount` (datáfono o efectivo por monto). Se implementa en la fase 3.
- **QR siempre a producción:** `tableUrl()` usa solo `APP_URL` (https://demo-qr-steel.vercel.app en Vercel). Nunca `VERCEL_URL`, la URL del request ni la de un deploy. Lo mismo para `returnUrl` y webhooks.
- Redondeo: al colón más cercano, empate hacia arriba, con las tasas pasadas a milésimas enteras. Con impuestos incluidos el IVA es el residuo, para que las piezas sumen exacto.
- Pagos pendientes apartan saldo por 3 minutos; `confirm_payment` nunca deja saldo negativo y guarda el sobrante en `payments.overpaid_amount` para devolución (fase 4).
- Cuenta de la Mesa 4 del seed: 10 líneas, subtotal ₡39 500, total ₡48 585.
- Vitest como herramienta de tests. `@types/node` subido a 22 (Vitest 5 lo exige).
- Se quitaron `cacheComponents` y `partialPrefetching` del `next.config.ts` generado.
- Fuente del sistema en vez de Geist (cero bytes y cero pedidos externos en 4G).

## Notas de entorno

- La VM de Claude bloquea `supabase.co`, `ui.shadcn.com`, Google Fonts y GitHub con token, y no tiene `gh` (el `gh` autenticado de Mateo está en su Windows y la VM no lo alcanza). Por eso `shadcn init` no corrió y `/api/health` solo se puede verificar ya desplegado. El repo de GitHub lo creó Mateo desde su terminal.
- `node_modules` vive en una copia local de la VM (`~/work/demo-qr`); el código se sincroniza a esta carpeta. Los `node_modules` de Linux no sirven en Windows: en tu máquina corré `npm install`.

## Parte A: portada para compartir (oct 2026)

- La portada `/` ahora lleva el video debajo del título (vertical en celular, horizontal en compu, solo se descarga uno), los botones "Pruébelo usted mismo" (a `/demo/mesa`) y "Escribirme por WhatsApp" (con el mensaje escrito), y el bloque "Piloto gratis de 2 semanas para 5 restaurantes fundadores. Sin instalación ni plazo mínimo."
- Pie con hola@divimesa.com, WhatsApp e Instagram @divimesacr (`BRAND.email`, `BRAND.instagram`).
- Metadatos de la portada con el póster horizontal como og:image. Se quitó `NEXT_PUBLIC_DEMO_VIDEO_URL` (el video ya no es opcional).
- `/demo` redirige a `/`. `/demo/en-vivo` y `/demo/mesa` siguen igual.
- Tests nuevos: todo enlace `wa.me` del código usa 18063006454 y la portada no dice "contrato".
- Logo: todos los archivos (favicon, apple-icon, og, PWA, panel) son del diseño nuevo; se borraron los SVG de la plantilla de Next en `public/`.
- `APP_URL` en Vercel: no pude confirmarlo (403 del MCP). Mateo debe revisar `/panel/qr`.

## Parte B: demo pública con una cuenta por visita (oct 2026)

- `/demo/mesa` crea una cuenta nueva por visita (copia de la cuenta de ejemplo de la Mesa 4) en una mesa oculta (`tables.is_hidden`, numeradas desde 1001; quien prueba siempre ve "Mesa 4") y redirige a `/demo/mesa/<token>`. Máximo 10 por IP por hora, contado en la base (`demo_visits`, guarda un hash HMAC de la IP, nunca la IP). Cada visita borra las mesas ocultas de más de 24 horas (con sus cuentas, items y pagos). Si se pasa del límite: página 429 en español.
- `/demo/mesa/<token>`: en 1024 px o más, dos columnas ("Así lo ve su cliente" con la cuenta en un marco de celular, "Así lo ve usted" con la mesa como la ve el salonero, en vivo) y abajo un QR a la misma cuenta. En celular, la cuenta del cliente con la franja "Esto es una demo. No se cobra nada." (también sale en `/m/<token>` de cualquier restaurante `is_demo`, salvo con `?embed=1`).
- Ruta pública de solo lectura `GET /api/demo/mesa/<token>`: solo responde mesas de restaurantes con `is_demo`; para restaurantes reales o tokens inexistentes, 404 (con tests).
- El panel, la hoja de QR y la demo en vivo ocultan las mesas `is_hidden`.
- Migración `20261010000010_demo_visits.sql`: agrega `restaurants.is_demo` (marcado por nombre, falla si no marca exactamente uno, índice único parcial), `tables.is_hidden`, tabla `demo_visits`, secuencia y funciones `create_demo_visit` y `cleanup_demo`. Renombra el restaurante demo a "Su Restaurante". `reset_demo` y `factory_reset` ahora solo tocan el restaurante `is_demo` (antes `reset_demo` borraba cuentas y pagos de todos los restaurantes). Termina con una auditoría que falla si alguna función de `public` es ejecutable desde el navegador. Test: `supabase/tests/demo_scope.sql` (RESULTADO ok; con la versión vieja falla). Aplicar ANTES del push.
- Pendiente (B4): SINPE de prueba y botón "Recibido" en la columna derecha, después de la parte C.

## Pendientes

- [ ] **Mateo:** en Vercel, Settings, Environment Variables, editar `APP_URL` (Production) a `https://divimesa.com` y redesplegar. Después abrir `/panel/qr` y ver que los QR digan divimesa.com. En Settings, Domains, confirmar que `www.divimesa.com` redirige a `divimesa.com`. Los QR ya impresos con vercel.app siguen sirviendo.
- [ ] Las tres claves secretas están en Vercel solo para **production**. Los deploys de preview no las tienen (no importa para `/api/health`, pero sí para el panel y los pagos). Si se usan previews, agregarles también esos destinos.
- [ ] Mejorar `/api/health` para que consulte una tabla (hoy solo verifica la conexión con Supabase).

## Siguiente paso

1. Mateo hace `git push` de los commits de la fase 5 y 5b (se despliega solo) y corre la lista de pruebas a mano (ver la respuesta de cierre de fase). Anotar acá qué falla.
2. Si se quiere, fase 6 (Stripe en modo prueba), según SPEC.md.
