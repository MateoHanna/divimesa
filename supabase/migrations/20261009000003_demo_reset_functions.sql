-- Fase 1 / 0003: reinicios de la demo. (PENDIENTE de aplicar en Supabase: ver PROGRESO.md)

-- "Reiniciar demo": borra cuentas y pagos y deja la Mesa 4 abierta con la cuenta de ejemplo.
-- Conserva nombre, color, tasas, menú y mesas (con sus QR).
create or replace function public.reset_demo() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_rest uuid; v_table uuid; v_bill uuid;
begin
  perform set_config('app.mute_notify', '1', true);
  select id into v_rest from public.restaurants order by created_at limit 1;
  if v_rest is null then
    raise exception 'No hay restaurante. Ejecute factory_reset() primero.';
  end if;

  delete from public.invoice_requests where true;
  delete from public.payment_items where true;
  delete from public.payments where true;
  delete from public.bill_items where true;
  delete from public.bills where true;

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

-- "Restaurar valores de fábrica": todo vuelve al seed (nombre, color, tasas, menú, cuentas).
-- Las mesas existentes se conservan con sus QR, para que los códigos impresos sigan sirviendo.
create or replace function public.factory_reset() returns void
language plpgsql security definer set search_path = ''
as $$
declare v_rest uuid; n int;
begin
  perform set_config('app.mute_notify', '1', true);
  select id into v_rest from public.restaurants order by created_at limit 1;
  if v_rest is null then
    insert into public.restaurants (name) values ('Restaurante Demo') returning id into v_rest;
  else
    update public.restaurants
       set name = 'Restaurante Demo', primary_color = '#0f766e', logo_url = null,
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

revoke execute on function public.reset_demo() from public, anon, authenticated;
revoke execute on function public.factory_reset() from public, anon, authenticated;
grant execute on function public.reset_demo() to service_role;
grant execute on function public.factory_reset() to service_role;
