-- Parte B / 0010: demo publica con una cuenta por visita. Solo agrega (no borra ni renombra nada).
-- Toca: restaurants (columna is_demo + marca al restaurante de demostracion), tables (columna is_hidden),
-- tabla nueva demo_visits y la funcion nueva create_demo_visit.

alter table public.restaurants add column if not exists is_demo boolean not null default false;
alter table public.tables add column if not exists is_hidden boolean not null default false;

-- El restaurante de la demostracion es el primero que se creo (el mismo que usa reset_demo).
update public.restaurants set is_demo = true
 where id = (select id from public.restaurants order by created_at limit 1) and not is_demo;

-- Una fila por visita a /demo/mesa. Guarda un hash de la IP, nunca la IP.
create table if not exists public.demo_visits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null check (length(ip_hash) between 16 and 128),
  table_id uuid references public.tables(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists demo_visits_ip_idx on public.demo_visits (ip_hash, created_at desc);
alter table public.demo_visits enable row level security;
revoke all on public.demo_visits from anon, authenticated;

-- Numeros de las mesas ocultas de la demo: empiezan en 1001, lejos de las mesas reales.
create sequence if not exists public.demo_table_number_seq start 1001;
revoke all on sequence public.demo_table_number_seq from anon, authenticated;

-- Crea una cuenta nueva para una visita (copia de la cuenta de ejemplo de la Mesa 4) en una mesa oculta.
-- Maximo 10 visitas por IP por hora. Borra las cuentas de demo de mas de 24 horas.
create or replace function public.create_demo_visit(p_ip_hash text) returns table (token text, table_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_rest uuid; v_table uuid; v_token text; v_bill uuid; v_count int;
begin
  perform set_config('app.mute_notify', '1', true);
  select id into v_rest from public.restaurants where is_demo order by created_at limit 1;
  if v_rest is null then raise exception 'demo_not_available'; end if;

  perform pg_advisory_xact_lock(hashtext('demo_visit:' || p_ip_hash));
  select count(*) into v_count from public.demo_visits
   where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_count >= 10 then raise exception 'rate_limited'; end if;

  -- Limpieza: las mesas ocultas viejas se llevan sus cuentas, items y pagos (on delete cascade).
  delete from public.tables where restaurant_id = v_rest and is_hidden and created_at < now() - interval '24 hours';
  delete from public.demo_visits where created_at < now() - interval '24 hours';

  insert into public.tables (restaurant_id, number, is_hidden)
  values (v_rest, nextval('public.demo_table_number_seq')::int, true)
  returning id, qr_token into v_table, v_token;

  insert into public.bills (table_id) values (v_table) returning id into v_bill;
  insert into public.bill_items (bill_id, menu_item_id, name, unit_price)
  select v_bill, (select m.id from public.menu_items m where m.restaurant_id = v_rest and m.name = d.name limit 1), d.name, d.price
  from (values
    (1, 'Casado de pollo', 5500), (2, 'Casado de pollo', 5500), (3, 'Casado de res', 6500),
    (4, 'Chifrijo', 4800), (5, 'Nachos para compartir', 6200),
    (6, 'Refresco natural', 2000), (7, 'Refresco natural', 2000), (8, 'Refresco natural', 2000),
    (9, 'Imperial', 2500), (10, 'Imperial', 2500)
  ) as d(pos, name, price) order by d.pos;

  insert into public.demo_visits (ip_hash, table_id) values (p_ip_hash, v_table);
  return query select v_token, v_table;
end $$;

revoke execute on function public.create_demo_visit(text) from public, anon, authenticated;
grant execute on function public.create_demo_visit(text) to service_role;
