# Demo: pago y división de cuenta por QR

Demo para restaurantes de Costa Rica. Cada mesa tiene un QR; el cliente ve su cuenta, elige qué pagar y paga desde el celular. El salonero ve el saldo bajar en vivo. Los pagos son simulados, pero la arquitectura es la del producto real.

La especificación completa está en `SPEC.md`. El estado del trabajo y las decisiones tomadas están en `PROGRESO.md`.

## Correr en local

Requisitos: Node 22 o superior.

```bash
npm install
cp .env.example .env.local   # y completar los valores
npm run dev
```

Abrir http://localhost:3000. Para comprobar la conexión con Supabase: http://localhost:3000/api/health

## Variables de entorno

Ver `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` es secreta: solo va en el servidor y en las variables de Vercel, nunca con prefijo `NEXT_PUBLIC_`.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Tests con Vitest |

Las secciones de migraciones, deploy y cambio de proveedor de pago se completan en la fase 5.
