# PROGRESO

Para retomar en otra sesión: leer `SPEC.md`, este archivo, y seguir desde "Siguiente paso".

## Estado

| Fase | Estado |
| --- | --- |
| 0. Proyecto, Supabase, Tailwind, shadcn, deploy | Código listo. Falta repo de GitHub, deploy y variables secretas (ver pendientes) |
| 1. Migraciones, seed, `lib/money.ts` | `money.ts` y migraciones 0001 y 0002 listas. Falta aplicar la 0003 y correr el seed |
| 2 a 6 | Sin empezar |

## Qué quedó

**Fase 0**
- Next.js 16 (App Router, TypeScript, Tailwind v4) en la raíz de `DemoQr`.
- Librerías: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `qrcode.react`. Dev: `vitest`. De shadcn: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`.
- `components/ui`: button, card, input, badge (escritos a mano con el estilo de shadcn).
- `lib/env.ts` (validación con zod), `lib/supabase/server.ts` (service role), `lib/supabase/browser.ts` (solo Realtime), `/api/health`, portada simple.
- Supabase `demo-qr`: ref `xauhctelzpymsafxlgtj`, us-east-1, URL https://xauhctelzpymsafxlgtj.supabase.co
- Vercel `demo-qr`: id `prj_PITlYGG5Kg0medcKxA6syf04DMKt`, sin repo conectado, con las variables públicas y `PAYMENT_PROVIDER=mock`.

**Fase 1**
- `lib/money.ts` con 33 tests: `formatCRC`, `computeTotals`, `balance`, `splitEqual`, `splitItem`, `equalShareDue`, `tipAmount`, `amountForItems`.
- `tests/fixtures/totals.json`: 11 casos que comparten TypeScript y SQL. Verificado: `calc_totals` en Supabase da lo mismo en los 11.
- `supabase/migrations/`: `..0001_schema.sql` y `..0002_functions_and_realtime.sql` aplicadas en Supabase. `..0003_demo_reset_functions.sql` escrita, NO aplicada.
- `supabase/seed.sql`: `select public.factory_reset();`
- Asesor de seguridad de Supabase: solo "RLS sin políticas" (INFO) en las 8 tablas, que es lo buscado.
- Estado actual: lint, typecheck y 35 tests pasan.

## Decisiones tomadas

- Líneas separadas por cantidad (3 imperiales = 3 líneas), agrupadas visualmente en el panel.
- "Reiniciar demo" solo borra cuentas y pagos y deja la Mesa 4 abierta; conserva nombre, color, tasas, menú y mesas. "Restaurar valores de fábrica" vuelve todo al seed. Ambos conservan las mesas y sus QR.
- Canales de Realtime con uuid (`bill:`, `table:`, `restaurant:` + uuid), nunca con el número de mesa. El mensaje solo dice "cambió algo"; el navegador vuelve a pedir el estado a una API route. Las tablas no tienen políticas para `anon` y las funciones solo las ejecuta `service_role`.
- `amountForItems`: "Pagar mis platos" cobra la parte proporcional del saldo pendiente (`saldo × mis líneas / líneas pendientes`); si elige todas las líneas que quedan, cobra el saldo exacto. Sin pagos por monto equivale a líneas + su parte de servicio e IVA; con un pago de datáfono en medio no cobra de más.
- Redondeo: al colón más cercano, empate hacia arriba, con las tasas pasadas a milésimas enteras (sin decimales binarios). Con impuestos incluidos el IVA es el residuo, para que las piezas sumen exacto.
- Pagos pendientes apartan saldo por 3 minutos; `confirm_payment` nunca deja saldo negativo y guarda el sobrante en `payments.overpaid_amount` para devolución. (Se implementa en la fase 4.)
- Cuenta de la Mesa 4 del seed: 10 líneas, subtotal ₡39 500, total ₡48 585 (el plan decía unas 12 líneas y ₡48 000).
- Vitest como herramienta de tests. `@types/node` subido a 22 (Vitest 5 lo exige).
- Se quitaron `cacheComponents` y `partialPrefetching` del `next.config.ts` generado.
- Fuente del sistema en vez de Geist (cero bytes y cero pedidos externos en 4G).

## Notas de entorno

- La VM de Claude bloquea `supabase.co`, `ui.shadcn.com`, Google Fonts y el registro de GitHub con token. Por eso `shadcn init` no corrió, `/api/health` solo se puede verificar ya desplegado, y las migraciones se aplican con el conector de Supabase.
- `node_modules` vive en una copia local de la VM (`~/work/demo-qr`); el código se sincroniza a esta carpeta. Los `node_modules` de Linux no sirven en Windows: en tu máquina corré `npm install`.
- El conector de Supabase pide confirmación para SQL que borra datos y la canceló dos veces con la 0003 (ver pendientes).

## Pendientes

- [ ] **Aplicar `supabase/migrations/20261009000003_demo_reset_functions.sql`** en Supabase (SQL Editor del dashboard, o aprobando el aviso del conector). Después correr `supabase/seed.sql`. Verificar: 1 restaurante, 15 platos, 8 mesas, Mesa 4 con 10 líneas y `bill_totals` = 39500 / 3950 / 5135 / 48585.
- [ ] **Realtime sin verificar.** `realtime.messages` no tiene particiones todavía (proyecto recién creado), así que `realtime.send` falla en silencio. Probablemente se crean cuando conecta el primer cliente. Verificar en la fase 4 con un navegador real. La página del cliente y el panel deben tener respaldo por polling (cada unos 5 segundos con la pestaña visible), para que un fallo de Realtime nunca deje datos viejos.
- [ ] Repo privado en GitHub: crearlo vacío en github.com/new y, desde esta carpeta, `git remote add origin <url>` y `git push -u origin main`. Después conectarlo al proyecto de Vercel.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`: copiarla del dashboard de Supabase (Settings, API Keys) a `.env.local` y a Vercel. El conector no la expone.
- [ ] `PANEL_PIN` y `MOCK_WEBHOOK_SECRET`: elegirlos y ponerlos en `.env.local` y en Vercel.
- [ ] Vercel tiene activa la protección de login en los deploys (`ssoProtection`). Apagarla al desplegar, o los clientes no podrán abrir el QR.
- [ ] Desplegar y comprobar `/api/health`.
- [ ] Mejorar `/api/health` para que consulte una tabla (hoy solo verifica la conexión con Supabase).

## Siguiente paso

Cuando estén aplicadas la 0003 y el seed, y exista la service role key: fase 2 (panel del salonero). Incluye acceso con PIN, grilla de mesas, abrir cuenta, agregar y quitar platos, QR, pagos manuales, botones "Reiniciar demo" y "Restaurar valores de fábrica", y respaldo por polling.
