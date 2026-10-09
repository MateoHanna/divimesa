# PROGRESO

Para retomar en otra sesión: leer `SPEC.md`, este archivo, y seguir desde "Siguiente paso".

## Estado

| Fase | Estado |
| --- | --- |
| 0. Proyecto, Supabase, Tailwind, shadcn, deploy | Completa, salvo vincular el repo al proyecto de Vercel para que cada push despliegue solo |
| 1. Migraciones, seed, `lib/money.ts` | Completa |
| 2. Panel del salonero (`/panel`) | Código completo y probado en lógica y SQL; falta la prueba de punta a punta en el sitio desplegado |
| 3 a 6 | Sin empezar |

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
- Tests: `lib/panel/panel.test.ts` (sesión, PIN, limitador, errores, estado de mesas, agrupación y el monto por platos con `tests/fixtures/items-amount.json`, que también se verificó en SQL). Total 64 tests, lint y typecheck limpios, `next build` ok.
- Reglas asumidas: el pago por platos del salonero usa el mismo cálculo proporcional que el cliente; el pago por monto es libre hasta el saldo; con partes iguales activas no se pueden cambiar platos ni cobrar por platos (sí por monto).

## Decisiones tomadas

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

## Pendientes

- [ ] **Vincular el repo al proyecto de Vercel** (auto-deploy en cada push). Las herramientas de Claude no pueden reconectar un proyecto existente: en Vercel, proyecto `demo-qr`, Settings, Git, Connect Git Repository, elegir `MateoHanna/demo-qr`. Comprobación: el siguiente `git push` debería crear un deploy de producción solo. Hasta entonces los deploys se hacen desde Claude con el conector (`create_deployment` con `gitSource` de la rama `main`).
- [ ] Las tres claves secretas están en Vercel solo para **production**. Los deploys de preview no las tienen (no importa para `/api/health`, pero sí para el panel y los pagos). Si se usan previews, agregarles también esos destinos.
- [ ] Mejorar `/api/health` para que consulte una tabla (hoy solo verifica la conexión con Supabase).
- [ ] **Realtime sin verificar.** `realtime.messages` no tenía particiones (proyecto nuevo), así que `realtime.send` falla en silencio. Probablemente se crean cuando conecta el primer cliente. Verificar en la fase 4 con un navegador real.

## Siguiente paso

1. Mateo hace `git push` del commit de la fase 2; Claude despliega y prueba `/panel` de punta a punta (PIN, abrir cuenta, pagos, QR, reinicios) en celular y tablet, y anota el resultado acá.
2. Fase 3: página del cliente `/m/[token]` (ver cuenta, pagar todo / mis platos / partes iguales, línea que explica el ajuste cuando ya hubo pagos por otro medio).
3. Fase 4: proveedor de pago mock, webhook `/api/webhooks/[provider]` que llama a `confirm_payment`, y verificar Realtime.
