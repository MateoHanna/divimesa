# PROGRESO

Para retomar en otra sesión: leer `SPEC.md`, este archivo, y seguir desde "Siguiente paso".

## Estado

| Fase | Estado |
| --- | --- |
| 0. Proyecto, Supabase, Tailwind, shadcn, deploy | Código listo. Falta crear el repo en GitHub, empujar y desplegar |
| 1. Migraciones, seed, `lib/money.ts` | Completa |
| 2 a 6 | Sin empezar |

## Qué quedó

**Fase 0**
- Next.js 16 (App Router, TypeScript, Tailwind v4) en la raíz de `DemoQr`.
- Librerías: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `qrcode.react`. Dev: `vitest`. De shadcn: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`.
- `components/ui`: button, card, input, badge (escritos a mano con el estilo de shadcn).
- `lib/env.ts` (validación con zod), `lib/supabase/server.ts` (service role), `lib/supabase/browser.ts` (solo Realtime), `/api/health`, portada simple.
- Supabase `demo-qr`: ref `xauhctelzpymsafxlgtj`, us-east-1, URL https://xauhctelzpymsafxlgtj.supabase.co
- Vercel `demo-qr`: id `prj_PITlYGG5Kg0medcKxA6syf04DMKt`, dominio de producción **https://demo-qr-steel.vercel.app**, sin repo conectado todavía. Tiene las variables públicas y `PAYMENT_PROVIDER=mock`. La cuenta de Vercel ya tiene GitHub conectado (usuario `MateoHanna`).
- `.env.local` (no se sube a git) ya tiene `SUPABASE_SERVICE_ROLE_KEY`, `PANEL_PIN` y `MOCK_WEBHOOK_SECRET` (64 caracteres, generado por Claude). `APP_URL` local es `http://localhost:3000`.

**Fase 1**
- `lib/money.ts` con 33 tests: `formatCRC`, `computeTotals`, `balance`, `splitEqual`, `splitItem`, `equalShareDue`, `tipAmount`, `amountForItems`.
- `lib/app-url.ts` con 8 tests: `getAppUrl()` y `tableUrl(token)`. Solo leen `APP_URL`; ignoran `VERCEL_URL` y `VERCEL_BRANCH_URL`.
- `tests/fixtures/totals.json`: 11 casos compartidos entre TypeScript y SQL. Verificado: `calc_totals` en Supabase da lo mismo en los 11.
- `supabase/migrations/`: 0001 (esquema), 0002 (funciones y Realtime) y 0003 (`reset_demo`, `factory_reset`). La 0001 y la 0002 se aplicaron con el conector. **La 0003 la aplicó Mateo a mano en el SQL Editor de Supabase** (el conector la canceló dos veces por su confirmación de SQL que borra datos), y también corrió `seed.sql` a mano. Por eso la lista de migraciones del conector no la muestra.
- Verificado con el conector el 2026-10-09: 1 restaurante, 15 platos, 8 mesas con tokens distintos, 1 cuenta abierta (Mesa 4, 10 líneas). `bill_totals`: subtotal 39500, servicio 3950, IVA 5135, total 48585, pagado 0, saldo 48585. `anon` no puede ejecutar ninguna función.
- Estado actual: lint, typecheck y 43 tests pasan.

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

- La VM de Claude bloquea `supabase.co`, `ui.shadcn.com`, Google Fonts y GitHub con token, y no tiene `gh` (el `gh` autenticado de Mateo está en su Windows y la VM no lo alcanza). Por eso `shadcn init` no corrió, `/api/health` solo se puede verificar ya desplegado, y el repo de GitHub lo crea Mateo desde su terminal.
- `node_modules` vive en una copia local de la VM (`~/work/demo-qr`); el código se sincroniza a esta carpeta. Los `node_modules` de Linux no sirven en Windows: en tu máquina corré `npm install`.

## Pendientes

- [ ] **Crear el repo privado y empujar** (lo hace Mateo, ver comando abajo). Después Claude lo conecta a Vercel, carga las variables secretas y despliega.
- [ ] Variables de Vercel que faltan: `SUPABASE_SERVICE_ROLE_KEY`, `PANEL_PIN`, `MOCK_WEBHOOK_SECRET` (como sensibles) y `APP_URL=https://demo-qr-steel.vercel.app`.
- [ ] Vercel tiene activa la protección de login en los deploys (`ssoProtection`). Apagarla al desplegar, o los clientes no podrán abrir el QR.
- [ ] Comprobar `/api/health` ya desplegado.
- [ ] Mejorar `/api/health` para que consulte una tabla (hoy solo verifica la conexión con Supabase).
- [ ] **Realtime sin verificar.** `realtime.messages` no tenía particiones (proyecto nuevo), así que `realtime.send` falla en silencio. Probablemente se crean cuando conecta el primer cliente. Verificar en la fase 4 con un navegador real.

Comando para el repo (desde esta carpeta, con `gh` autenticado):

```
gh repo create demo-qr --private --source . --remote origin --push
```

## Siguiente paso

Fase 2 (panel del salonero): acceso con PIN, grilla de mesas, abrir cuenta, agregar y quitar platos, QR con `tableUrl()`, pagos manuales, botones "Reiniciar demo" y "Restaurar valores de fábrica", y consulta cada 3 s.
