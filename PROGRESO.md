# PROGRESO

Para retomar en otra sesión: leer `SPEC.md`, este archivo, y seguir desde "Siguiente paso".

## Estado

| Fase | Estado |
| --- | --- |
| 0. Proyecto, Supabase, Tailwind, shadcn, deploy | En curso (ver pendientes) |
| 1. Migraciones, seed, `lib/money.ts` | Sin empezar |
| 2 a 6 | Sin empezar |

## Fase 0: qué quedó

- Next.js 16 (App Router, TypeScript, Tailwind v4) en la raíz de `DemoQr`.
- Librerías: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `qrcode.react`. Dev: `vitest`. Las de shadcn: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`.
- Componentes en `components/ui`: button, card, input, badge (escritos a mano con el estilo de shadcn).
- `lib/env.ts` (validación con zod), `lib/supabase/server.ts` (service role) y `lib/supabase/browser.ts` (solo Realtime).
- `/api/health` y portada simple.
- Proyecto Supabase `demo-qr`, ref `xauhctelzpymsafxlgtj`, región us-east-1, URL https://xauhctelzpymsafxlgtj.supabase.co
- Lint, typecheck, tests (2) y build pasan.

## Decisiones tomadas

- Líneas separadas por cantidad (3 imperiales = 3 líneas), agrupadas visualmente en el panel.
- Vitest como herramienta de tests.
- "Reiniciar demo" solo borra cuentas y pagos y deja la Mesa 4 abierta; conserva nombre, color y menú. Aparte, "Restaurar valores de fábrica" vuelve todo al seed.
- Los canales de Realtime se nombran con uuid (`bill:<uuid>`, `restaurant:<uuid>`), nunca con el número de mesa.
- Realtime solo avisa "cambió algo"; el navegador vuelve a pedir el estado a una API route. Las tablas no tienen políticas para `anon`.
- Pagos pendientes apartan saldo por 3 minutos; `confirm_payment` nunca deja saldo negativo.
- Se quitaron `cacheComponents` y `partialPrefetching` del `next.config.ts` generado, para no tener que envolver todo dato dinámico en Suspense.
- Fuente del sistema en vez de Geist: cero bytes y cero pedidos externos en 4G.
- `@types/node` subido a 22 (Vitest 5 lo exige).

## Notas de entorno

- La VM donde trabaja Claude bloquea `supabase.co`, `ui.shadcn.com` y Google Fonts. Por eso `shadcn init` no se pudo ejecutar, y las migraciones se aplican con el conector de Supabase, no con la CLI.
- `node_modules` se instala en una copia local de la VM (`~/work/demo-qr`) y el código se sincroniza a esta carpeta. Los `node_modules` de Linux no sirven en Windows: en tu máquina corré `npm install`.

## Pendiente de la fase 0

- [ ] Repo privado en GitHub: crear vacío en github.com/new y empujar desde tu máquina (`git remote add origin ...`, `git push -u origin main`).
- [ ] `SUPABASE_SERVICE_ROLE_KEY`: copiarla del dashboard de Supabase (Settings, API Keys) a `.env.local` y a las variables de Vercel. El conector no la expone.
- [ ] `PANEL_PIN` y `MOCK_WEBHOOK_SECRET`: elegirlos y ponerlos en `.env.local` y en Vercel.
- [ ] Deploy en Vercel y comprobar `/api/health`.

## Siguiente paso

Fase 1: migraciones (`0001_schema.sql`, `0002_demo.sql`), `seed.sql`, `lib/money.ts` con tests.
