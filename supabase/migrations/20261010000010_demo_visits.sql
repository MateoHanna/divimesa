-- Parte B / 0010: demo publica con una cuenta por visita. Solo agrega (no borra ni renombra nada).
-- Toca: restaurants (columna is_demo, indice unico parcial, marca y nombre del restaurante de demostracion),
-- tables (columna is_hidden), tabla nueva demo_visits, funciones nuevas create_demo_visit y cleanup_demo,
-- y reset_demo / factory_reset (ahora solo tocan el restaurante con is_demo; factory_reset restaura el nombre 'Su Restaurante').

alter table public.restaurants add column if not exists is_demo boolean not null default false;
alter table public.tables add column if not exists is_hidden boolean not null default false;

-- El restaurante de la demostracion se marca por su nombre. Si no hay exactamente uno, la migracion falla y no cambia nada.
-- Tambien pasa a llamarse "Su Restaurante", como en el video.
do $$
declare n int;
begin
  update public.restaurants set is_demo = true, name = 'Su Restaurante'
   where name in ('Restaurante Demo', 'Su Restaurante');
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Se esperaba marcar exactamente 1 restaurante de demostracion y se marcaron %', n;
  end if;
end $$;
-- Garantia permanente: nunca puede haber mas de un restaurante de demostracion.
create unique index if not exists restaurants_one_demo on public.restaurants ((true)) where is_demo;

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

-- Limpieza: borra las mesas ocultas de mas de 24 horas (se llevan sus cuentas, items y pagos por on delete cascade)
-- y las filas de demo_visits de mas de 24 horas. Se llama en cada visita nueva.
create or replace function public.cleanup_demo(p_rest uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('app.mute_notify', '1', true);
  delete from public.tables where restaurant_id = p_rest and is_hidden and created_at < now() - interval '24 hours';
  delete from public.demo_visits where created_at < now() - interval '24 hours';
end $$;

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

  perform public.cleanup_demo(v_rest);

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
revoke execute on function public.cleanup_demo(uuid) from public, anon, authenticated;
grant execute on function public.cleanup_demo(uuid) to service_role;

-- reset_demo: igual que antes, pero SOLO toca el restaurante con is_demo. Antes borraba las cuentas y pagos de todos
-- los restaurantes ("where true"); con un restaurante real en la misma base eso era un riesgo.
create or replace function public.reset_demo() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_rest uuid; v_table uuid; v_bill uuid;
begin
  perform set_config('app.mute_notify', '1', true);
  select id into v_rest from public.restaurants where is_demo;
  if v_rest is null then
    raise exception 'No hay restaurante de demostracion. Ejecute factory_reset() primero.';
  end if;

  -- Solo lo que cuelga de las mesas del restaurante de demostracion.
  delete from public.invoice_requests where payment_id in (
    select p.id from public.payments p join public.bills b on b.id = p.bill_id join public.tables t on t.id = b.table_id
     where t.restaurant_id = v_rest);
  delete from public.payment_items where payment_id in (
    select p.id from public.payments p join public.bills b on b.id = p.bill_id join public.tables t on t.id = b.table_id
     where t.restaurant_id = v_rest);
  delete from public.payments where bill_id in (
    select b.id from public.bills b join public.tables t on t.id = b.table_id where t.restaurant_id = v_rest);
  delete from public.bill_items where bill_id in (
    select b.id from public.bills b join public.tables t on t.id = b.table_id where t.restaurant_id = v_rest);
  delete from public.bills where table_id in (select id from public.tables where restaurant_id = v_rest);
  -- Las mesas ocultas de las visitas a /demo/mesa tambien se van.
  delete from public.tables where restaurant_id = v_rest and is_hidden;

  select id into v_table from public.tables where restaurant_id = v_rest and number = 4;
  if v_table is null then
    insert into public.tables (restaurant_id, number) values (v_rest, 4) returning id into v_table;
  end if;

  insert into public.bills (table_id) values (v_table) returning id into v_bill;

  -- Cuenta de la Mesa 4 (6 personas): subtotal 39 500, total 48 585 con servicio e IVA.
  insert into public.bill_items (bill_id, menu_item_id, name, unit_price)
  select v_bill,
         (select m.id from public.menu_items m where m.restaurant_id = v_rest and m.name = d.name limit 1),
         d.name, d.price
  from (values
    (1, 'Casado de pollo', 5500), (2, 'Casado de pollo', 5500), (3, 'Casado de res', 6500),
    (4, 'Chifrijo', 4800), (5, 'Nachos para compartir', 6200),
    (6, 'Refresco natural', 2000), (7, 'Refresco natural', 2000), (8, 'Refresco natural', 2000),
    (9, 'Imperial', 2500), (10, 'Imperial', 2500)
  ) as d(pos, name, price)
  order by d.pos;

  perform public.notify_restaurant(v_rest);
end $$;
revoke execute on function public.reset_demo() from public, anon, authenticated;
grant execute on function public.reset_demo() to service_role;

-- factory_reset: igual que antes, pero solo toca el restaurante con is_demo y restaura el nombre "Su Restaurante".
create or replace function public.factory_reset() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_rest uuid; n int;
begin
  perform set_config('app.mute_notify', '1', true);
  select id into v_rest from public.restaurants where is_demo;
  if v_rest is null then
    insert into public.restaurants (name, is_demo) values ('Su Restaurante', true) returning id into v_rest;
  else
    update public.restaurants
       set name = 'Su Restaurante', primary_color = '#D91E18', logo_url = null,
           service_rate = 0.100, vat_rate = 0.130, prices_include_taxes = false
     where id = v_rest;
  end if;

  delete from public.menu_items where restaurant_id = v_rest;
  insert into public.menu_items (restaurant_id, category, name, price, sort_order) values
    (v_rest, 'Platos fuertes', 'Casado de pollo', 5500, 1),
    (v_rest, 'Platos fuertes', 'Casado de res', 6500, 2),
    (v_rest, 'Platos fuertes', 'Chifrijo', 4800, 3),
    (v_rest, 'Platos fuertes', 'Ceviche de corvina', 7200, 4),
    (v_rest, 'Platos fuertes', 'Arroz con camarones', 8500, 5),
    (v_rest, 'Platos fuertes', 'Hamburguesa tica', 6900, 6),
    (v_rest, 'Platos fuertes', 'Filete de res', 9500, 7),
    (v_rest, 'Entradas', 'Patacones con frijoles', 3500, 8),
    (v_rest, 'Entradas', 'Sopa negra', 3800, 9),
    (v_rest, 'Entradas', 'Nachos para compartir', 6200, 10),
    (v_rest, 'Bebidas', 'Refresco natural', 2000, 11),
    (v_rest, 'Bebidas', 'Imperial', 2500, 12),
    (v_rest, 'Bebidas', 'Limonada con hierbabuena', 2800, 13),
    (v_rest, 'Bebidas', 'Café chorreado', 2000, 14),
    (v_rest, 'Postres', 'Tres leches', 3200, 15);

  for n in 1..8 loop
    insert into public.tables (restaurant_id, number) values (v_rest, n)
    on conflict (restaurant_id, number) do nothing;
  end loop;
  delete from public.tables where restaurant_id = v_rest and number > 8;

  perform public.reset_demo();
end $$;
revoke execute on function public.factory_reset() from public, anon, authenticated;
grant execute on function public.factory_reset() to service_role;

-- Auditoria de permisos: ninguna funcion de public puede ser ejecutada desde el navegador (anon, authenticated, public).
-- Si alguna lo permitiera, esta migracion falla en vez de dejarla abierta.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute'));
  if bad is not null then
    raise exception 'Funciones de public ejecutables desde el navegador: %', bad;
  end if;
end $$;
