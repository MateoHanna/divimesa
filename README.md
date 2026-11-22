# Divimesa — QR table payments for restaurants

Diners scan a QR code at their table, see the bill, split it with their tablemates, and pay from their phone. No line at the register, no waiting for the card terminal.

Built for restaurants in Costa Rica and validated directly with restaurant owners during a 2026 pilot.

**Live demo:** https://demo-qr-steel.vercel.app

## How it works

**For diners**
- Scan the table's QR code and the open bill appears on the phone — no app install, no sign-up.
- Split the bill by item or in equal parts and pay only your share.
- Pilot payment flow via **SINPE Móvil** (Costa Rica's instant transfer system): the payment goes **directly to the restaurant's account** — the platform never holds the funds.

**For restaurants**
- A PIN-protected dashboard per restaurant (PINs are stored hashed, never in plain text).
- Open and close tables, track which tables have paid, and see the day's payments.
- Per-restaurant branding (logo, colors, name) applied across the diner experience.

## Engineering highlights

- **Money is handled in integer cents** with a dedicated, fully tested money module (`lib/money.ts`) — no floating-point amounts anywhere in the payment flow.
- **Payment provider abstraction** (`lib/payments/`): a mock provider with signed-webhook verification for development, designed so a real processor (Tilopay was evaluated) can be plugged in without touching the bill logic.
- **Supabase (PostgreSQL)** with row-level security; the service-role key is server-only and never reaches the browser.
- **Test suite with Vitest** covering money splitting, SINPE references, branding, and URL generation.
- Demo mode with a seeded restaurant so the full flow can be tried end to end without real money.

## Stack

Next.js (App Router) · TypeScript · Supabase (PostgreSQL) · Tailwind CSS · Vitest · Deployed on Vercel

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project keys
npm run dev
```

Database schema and migrations live in `supabase/`. To create a restaurant and get its panel PIN:

```bash
node scripts/crear-restaurante.mjs
```

## Status

Pilot project (2026). The problem and the flow were validated through daily outreach to restaurant owners across Costa Rica; card processing via a licensed local provider was evaluated but not launched.

---

Built by [Mateo Hanna](https://github.com/MateoHanna) — software engineer, Costa Rica.
