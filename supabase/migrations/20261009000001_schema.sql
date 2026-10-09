-- Fase 1 / 0001: esquema, constraints, índices y RLS.
create extension if not exists pgcrypto with schema extensions;

-- Token de QR: 24 bytes aleatorios en base64url (32 caracteres, no adivinable).
create or replace function public.new_qr_token() returns text
language sql volatile set search_path = ''
as $$ select translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_') $$;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  primary_color text not null default '#0f766e' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text,
  service_rate numeric(4,3) not null default 0.100 check (service_rate >= 0 and service_rate <= 0.5),
  vat_rate numeric(4,3) not null default 0.130 check (vat_rate >= 0 and vat_rate <= 0.5),
  prices_include_taxes boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  number int not null check (number > 0),
  qr_token text not null unique default public.new_qr_token(),
  created_at timestamptz not null default now(),
  unique (restaurant_id, number)
);
create index tables_restaurant_idx on public.tables (restaurant_id);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  category text not null default 'Platos fuertes',
  price int not null check (price > 0),
  active boolean not null default true,
  sort_order int not null default 0
);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'paid', 'closed')),
  -- Caché de la suma de pagos confirmados. Solo la cambian funciones SQL (confirm_payment).
  paid_amount int not null default 0 check (paid_amount >= 0),
  split_mode text check (split_mode is null or split_mode = 'equal'),
  split_parts int check (split_parts is null or split_parts >= 2),
  split_base_amount int check (split_base_amount is null or split_base_amount > 0),
  split_share_amount int check (split_share_amount is null or split_share_amount > 0),
  split_paid_parts int not null default 0 check (split_paid_parts >= 0),
  split_started_at timestamptz,
  opened_at timestamptz not null default now(),
  paid_at timestamptz,
  closed_at timestamptz,
  check ((split_mode is null) = (split_parts is null))
);
-- Una sola cuenta viva (abierta o pagada sin liberar) por mesa.
create unique index bills_one_live_per_table on public.bills (table_id) where status in ('open', 'paid');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  amount int not null check (amount > 0),
  tip_amount int not null default 0 check (tip_amount >= 0),
  -- Colones cobrados de más (pago vencido que llegó tarde). Para devolución manual.
  overpaid_amount int not null default 0 check (overpaid_amount >= 0),
  method text not null check (method in ('card', 'apple_pay', 'google_pay', 'sinpe', 'terminal', 'cash')),
  source text not null check (source in ('qr', 'panel')),
  kind text not null check (kind in ('full', 'items', 'equal_share', 'amount')),
  split_part_index int,
  provider text,
  provider_ref text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  session_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_bill_idx on public.payments (bill_id, status);

create table public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  unit_price int not null check (unit_price > 0),
  quantity int not null default 1 check (quantity >= 1),
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  -- Plato dividido: N líneas con el mismo split_group_id ("Nachos (2/3)").
  split_group_id uuid,
  split_index int,
  split_count int,
  reserved_by_session text,
  reserved_until timestamptz,
  paid_by_payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  check ((reserved_by_session is null) = (reserved_until is null))
);
create index bill_items_bill_idx on public.bill_items (bill_id, status);

create table public.payment_items (
  payment_id uuid not null references public.payments(id) on delete cascade,
  bill_item_id uuid not null references public.bill_items(id) on delete cascade,
  primary key (payment_id, bill_item_id)
);
create index payment_items_item_idx on public.payment_items (bill_item_id);

create table public.invoice_requests (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  name text,
  id_type text check (id_type in ('fisica', 'juridica')),
  id_number text,
  email text,
  created_at timestamptz not null default now()
);

-- RLS en todo y ninguna política: el navegador (anon/authenticated) no lee ni escribe nada.
-- Todo pasa por API routes con la service role, que salta RLS.
alter table public.restaurants enable row level security;
alter table public.tables enable row level security;
alter table public.menu_items enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.bill_items enable row level security;
alter table public.payment_items enable row level security;
alter table public.invoice_requests enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- Las funciones del esquema public se exponen como RPC: nada ejecutable por defecto.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke execute on function public.new_qr_token() from public, anon, authenticated;
grant execute on function public.new_qr_token() to service_role;
