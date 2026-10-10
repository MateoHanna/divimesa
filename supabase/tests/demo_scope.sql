-- Migración 0010: reset_demo() y factory_reset() solo tocan el restaurante con is_demo.
-- Una sola transacción que termina con un error a propósito (RESULTADO ...) para no dejar nada guardado.
-- Esperado: RESULTADO ok. Cualquier otra cosa lista lo que cambió en el otro restaurante.
do $$
declare
  v_other uuid; t uuid; b uuid; p uuid; mi uuid; msg text := '';
  before_counts text; after_counts text;
  counts text := $q$
    select concat_ws(',',
      (select count(*) from public.restaurants where name = 'Soda Real' and primary_color = '#123456' and service_rate = 0.05),
      (select count(*) from public.tables t join public.restaurants r on r.id = t.restaurant_id where r.name = 'Soda Real'),
      (select count(*) from public.menu_items m join public.restaurants r on r.id = m.restaurant_id where r.name = 'Soda Real'),
      (select count(*) from public.bills b join public.tables t on t.id = b.table_id join public.restaurants r on r.id = t.restaurant_id where r.name = 'Soda Real'),
      (select count(*) from public.bill_items i join public.bills b on b.id = i.bill_id join public.tables t on t.id = b.table_id join public.restaurants r on r.id = t.restaurant_id where r.name = 'Soda Real'),
      (select count(*) from public.payments p join public.bills b on b.id = p.bill_id join public.tables t on t.id = b.table_id join public.restaurants r on r.id = t.restaurant_id where r.name = 'Soda Real'),
      (select count(*) from public.payment_items x join public.payments p on p.id = x.payment_id join public.bills b on b.id = p.bill_id join public.tables t on t.id = b.table_id join public.restaurants r on r.id = t.restaurant_id where r.name = 'Soda Real'),
      (select count(*) from public.invoice_requests q join public.payments p on p.id = q.payment_id join public.bills b on b.id = p.bill_id join public.tables t on t.id = b.table_id join public.restaurants r on r.id = t.restaurant_id where r.name = 'Soda Real'))
  $q$;
begin
  -- Un restaurante real (is_demo = false) con mesa, menú, cuenta, platos, un pago por platos y datos de factura.
  insert into public.restaurants (name, primary_color, service_rate) values ('Soda Real', '#123456', 0.05) returning id into v_other;
  insert into public.tables (restaurant_id, number) values (v_other, 1) returning id into t;
  insert into public.menu_items (restaurant_id, name, price) values (v_other, 'Casado', 4000) returning id into mi;
  insert into public.bills (table_id) values (t) returning id into b;
  insert into public.bill_items (bill_id, menu_item_id, name, unit_price) values (b, mi, 'Casado', 4000), (b, mi, 'Casado', 4000);
  insert into public.payments (bill_id, amount, method, source, kind, status, paid_at)
    values (b, 4000, 'sinpe', 'qr', 'items', 'paid', now()) returning id into p;
  insert into public.payment_items (payment_id, bill_item_id) select p, id from public.bill_items where bill_id = b limit 1;
  insert into public.invoice_requests (payment_id, name) values (p, 'Cliente');

  execute counts into before_counts;
  perform public.reset_demo();
  execute counts into after_counts;
  msg := msg || 'reset_demo ' || case when before_counts = after_counts then 'ok' else 'CAMBIO ' || before_counts || ' -> ' || after_counts end || '; ';

  perform public.factory_reset();
  execute counts into after_counts;
  msg := msg || 'factory_reset ' || case when before_counts = after_counts then 'ok' else 'CAMBIO ' || before_counts || ' -> ' || after_counts end || '; ';

  -- Y la demo sí quedó restaurada.
  msg := msg || 'demo ' || case when
    (select name from public.restaurants where is_demo) = 'Su Restaurante'
    and (select count(*) from public.bill_items i join public.bills b on b.id = i.bill_id join public.tables t on t.id = b.table_id join public.restaurants r on r.id = t.restaurant_id where r.is_demo) = 10
    then 'ok' else 'MAL' end;

  raise exception 'RESULTADO %', case when msg = 'reset_demo ok; factory_reset ok; demo ok' then 'ok' else msg end;
end $$;
