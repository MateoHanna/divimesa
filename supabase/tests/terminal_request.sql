-- Migración 0013: "Tarjeta con el salonero" (solicitud de datáfono desde el QR).
-- Una sola transacción que termina con un error a propósito (RESULTADO ...) para no dejar nada guardado.
-- Esperado: RESULTADO ok. Cualquier otra cosa lista las comprobaciones que fallaron.
create temp table fails (msg text);

create function pg_temp.expect(name text, q text, want text) returns void language plpgsql as $$
declare e text;
begin
  begin execute q; e := 'sin error';
  exception when others then e := sqlerrm; end;
  if e not like '%' || want || '%' then insert into fails values (name || ': esperaba "' || want || '" y fue "' || e || '"'); end if;
end $$;

create function pg_temp.assert(name text, cond boolean) returns void language plpgsql as $$
begin if cond is not true then insert into fails values (name); end if; end $$;

do $$
declare
  rs uuid; rs2 uuid; t1 uuid; t2 uuid; tok text; tok2 text; bill uuid; r jsonb; st jsonb; p1 uuid; p2 uuid; m1 uuid;
  sa text := 'sesion-aaaaaaaaaaaaaaaa'; sb text := 'sesion-bbbbbbbbbbbbbbbb'; sc text := 'sesion-cccccccccccccccc';
  demo_tok text; demo_table uuid; dbill uuid; ids uuid[]; q text; n int;
begin
  -- ---- Restaurante real de solo el total, con SINPE
  insert into public.restaurants (name, bill_mode, sinpe_number, sinpe_holder, service_rate, vat_rate)
    values ('Soda Datáfono', 'total', '88887777', 'Soda Datafono SA', 0.10, 0.13) returning id into rs;
  insert into public.tables (restaurant_id, number) values (rs, 3) returning id, qr_token into t1, tok;
  bill := public.panel_open_bill_total(t1, 25000);

  st := public.client_state(tok, sa);
  perform pg_temp.assert('metodos_real', st #> '{restaurant,methods}' = '["sinpe", "terminal"]'::jsonb);
  perform pg_temp.expect('tarjeta_en_linea_sigue_fuera', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sa, 'all', 'card', 'percent', 'mock'), 'method_not_available');

  -- ---- Pedir el datáfono para toda la cuenta, con 10 % de propina
  r := public.client_create_payment(tok, sa, 'all', null, 'terminal', 'percent', 10, 'x', '{"email":"ana@example.com"}'::jsonb);
  p1 := (r->>'payment_id')::uuid;
  perform pg_temp.assert('monto', (r->>'amount')::int = 25000 and (r->>'tip')::int = 2500 and r->>'kind' = 'full' and r->>'reference_code' is null);
  perform pg_temp.assert('fila', (select provider = 'terminal' and provider_ref = 'terminal_' || p1 and reported_at is not null
    and expires_at = 'infinity' and source = 'qr' and status = 'pending' from public.payments where id = p1));
  perform pg_temp.assert('factura', exists (select 1 from public.invoice_requests where payment_id = p1 and email = 'ana@example.com'));
  st := public.client_state(tok, sa);
  perform pg_temp.assert('mi_solicitud', st #>> '{bill,my_sinpe,method}' = 'terminal' and st #>> '{bill,my_sinpe,status}' = 'pending'
    and st #>> '{bill,my_sinpe,reported}' = 'true');
  st := public.client_state(tok, sb);
  perform pg_temp.assert('otro_ve_pago_en_curso', st #> '{bill,my_sinpe}' = 'null'::jsonb and (st #>> '{bill,others_paying}') = 'true');
  perform pg_temp.expect('otro_paga_todo', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sb, 'all', 'sinpe', 'percent', 'x'), 'others_paying');
  perform pg_temp.expect('segundo_pago_mismo_celular', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sa, 'all', 'sinpe', 'percent', 'x'), 'sinpe_pending');
  perform pg_temp.expect('partes_con_solicitud', format('select public.client_start_split(%L,%L,2)', tok, sa), 'sinpe_pending');
  perform pg_temp.expect('report_no_aplica', format('select public.client_report_sinpe(%L,%L,null)', p1, sa), 'payment_not_found');
  perform pg_temp.expect('corregir_total', format('select public.panel_set_total(%L, 30000)', bill), 'sinpe_pending');
  perform pg_temp.expect('cerrar', format('select public.panel_close_bill(%L)', bill), 'sinpe_pending');

  -- ---- "Cobrado" (idempotente), la cuenta queda pagada
  r := public.panel_confirm_sinpe(p1);
  perform pg_temp.assert('cobrado', (r->>'paid_in_full')::boolean and (select status = 'paid' and paid_at is not null from public.payments where id = p1));
  perform pg_temp.assert('cuenta_pagada', (select status = 'paid' and paid_amount = 25000 from public.bills where id = bill));
  r := public.panel_confirm_sinpe(p1);
  perform pg_temp.assert('cobrar_dos_veces', (r->>'already')::boolean and (select paid_amount = 25000 from public.bills where id = bill));
  perform pg_temp.expect('cancelar_cobrado', format('select public.panel_reject_sinpe(%L)', p1), 'payment_already_paid');
  perform public.panel_release_table(bill);

  -- ---- El cliente cancela su solicitud; después el salonero ya no la puede cobrar
  bill := public.panel_open_bill_total(t1, 12000);
  r := public.client_create_payment(tok, sa, 'amount', null, 'terminal', 'percent', 0, 'x', null, 5000);
  p1 := (r->>'payment_id')::uuid;
  r := public.client_cancel_payment(p1, sa);
  perform pg_temp.assert('cliente_cancela', r->>'status' = 'failed' and (select status = 'failed' from public.payments where id = p1));
  perform pg_temp.expect('cobrar_cancelado', format('select public.panel_confirm_sinpe(%L)', p1), 'payment_not_pending');
  st := public.client_state(tok, sb);
  perform pg_temp.assert('saldo_libre_tras_cancelar', (st #>> '{bill,amounts,all}')::int = 12000);

  -- ---- El salonero cancela: se suelta el saldo
  r := public.client_create_payment(tok, sa, 'amount', null, 'terminal', 'percent', 0, 'x', null, 5000);
  p1 := (r->>'payment_id')::uuid;
  perform public.panel_reject_sinpe(p1);
  st := public.client_state(tok, sa);
  perform pg_temp.assert('salonero_cancela', st #>> '{bill,my_sinpe,status}' = 'failed' and st #>> '{bill,my_sinpe,method}' = 'terminal');
  perform pg_temp.assert('saldo_libre_tras_rechazo', (st #>> '{bill,amounts,all}')::int = 12000);

  -- ---- Mezcla: un SINPE y un datáfono en la misma mesa
  r := public.client_create_payment(tok, sa, 'amount', null, 'sinpe', 'percent', 0, 'x', null, 7000);
  p1 := (r->>'payment_id')::uuid;
  perform public.client_report_sinpe(p1, sa, 'Ana');
  r := public.client_create_payment(tok, sb, 'all', null, 'terminal', 'percent', 0, 'x', null);
  p2 := (r->>'payment_id')::uuid;
  perform pg_temp.assert('resto_con_datafono', (r->>'amount')::int = 5000 and r->>'kind' = 'amount');
  perform public.panel_confirm_sinpe(p2);
  r := public.panel_confirm_sinpe(p1);
  perform pg_temp.assert('mezcla_pagada', (r->>'paid_in_full')::boolean and (select paid_amount = 12000 from public.bills where id = bill));
  perform public.panel_release_table(bill);

  -- ---- Partes iguales: una parte con datáfono cuenta como parte pagada
  bill := public.panel_open_bill_total(t1, 20000);
  perform public.client_start_split(tok, sa, 2);
  r := public.client_create_payment(tok, sa, 'equal', null, 'terminal', 'percent', 0, 'x', null);
  p1 := (r->>'payment_id')::uuid;
  perform pg_temp.expect('cancelar_partes_con_solicitud', format('select public.panel_cancel_split(%L)', bill), 'sinpe_pending');
  perform public.panel_confirm_sinpe(p1);
  perform pg_temp.assert('parte_con_datafono', (select split_paid_parts = 1 and paid_amount = 10000 from public.bills where id = bill));
  r := public.client_create_payment(tok, sb, 'equal', null, 'terminal', 'percent', 0, 'x', null);
  perform public.panel_confirm_sinpe((r->>'payment_id')::uuid);
  perform pg_temp.assert('partes_pagadas', (select status = 'paid' and split_paid_parts = 2 from public.bills where id = bill));
  perform public.panel_release_table(bill);

  -- ---- Tope de 8 pagos por confirmar por cuenta (SINPE y datáfono juntos)
  bill := public.panel_open_bill_total(t1, 90000);
  for i in 1..8 loop
    r := public.client_create_payment(tok, 'sesion-tope-' || lpad(i::text, 10, '0'), 'amount', null, 'terminal', 'percent', 0, 'x', null, 1000);
  end loop;
  perform pg_temp.expect('tope', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null,1000)', tok, sc, 'amount', 'terminal', 'percent', 'x'), 'too_many_pending');

  -- ---- Restaurante real por platos SIN SINPE configurado: solo datáfono
  insert into public.restaurants (name, bill_mode) values ('Bar Sin SINPE', 'items') returning id into rs2;
  insert into public.tables (restaurant_id, number) values (rs2, 1) returning id, qr_token into t2, tok2;
  insert into public.menu_items (restaurant_id, name, category, price) values (rs2, 'Casado', 'Platos', 5000) returning id into m1;
  bill := public.panel_open_bill(t2);
  perform public.panel_add_items(bill, m1, 2);
  st := public.client_state(tok2, sa);
  perform pg_temp.assert('solo_datafono', st #> '{restaurant,methods}' = '["terminal"]'::jsonb and st #> '{restaurant,sinpe}' = 'null'::jsonb);
  perform pg_temp.expect('sinpe_sin_configurar', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok2, sa, 'all', 'sinpe', 'percent', 'x'), 'sinpe_not_configured');
  -- Por platos: aparta el plato sin vencimiento hasta que el salonero responda.
  select array_agg(id) into ids from (select id from public.bill_items where bill_id = bill order by created_at, id limit 1) x;
  r := public.client_create_payment(tok2, sa, 'items', ids, 'terminal', 'percent', 0, 'x', null);
  p1 := (r->>'payment_id')::uuid;
  perform pg_temp.assert('plato_apartado', (select reserved_until = 'infinity' and reserved_by_session = sa from public.bill_items where id = ids[1]));
  perform pg_temp.expect('panel_no_cobra_plato_apartado', format('select public.record_panel_payment(%L,%L,%L,null,%L)', bill, 'cash', 'items', ids), 'item_reserved');
  perform public.panel_reject_sinpe(p1);
  perform pg_temp.assert('plato_libre', (select reserved_until is null from public.bill_items where id = ids[1]));
  r := public.client_create_payment(tok2, sa, 'items', ids, 'terminal', 'percent', 0, 'x', null);
  perform public.panel_confirm_sinpe((r->>'payment_id')::uuid);
  perform pg_temp.assert('plato_pagado', (select status = 'paid' from public.bill_items where id = ids[1]));

  -- ---- Demo: la columna del salonero también "cobra" una solicitud de datáfono, solo en mesas de la demo
  select visit.token, visit.table_id into demo_tok, demo_table from public.create_demo_visit('hash-de-prueba-0123456789') visit;
  select id into dbill from public.bills where table_id = demo_table;
  st := public.client_state(demo_tok, sa);
  perform pg_temp.assert('metodos_demo', st #> '{restaurant,methods}' = '["card", "apple_pay", "google_pay", "sinpe", "terminal"]'::jsonb);
  r := public.client_create_payment(demo_tok, sa, 'all', null, 'terminal', 'percent', 0, 'x', null);
  perform public.demo_confirm_sinpe(demo_tok);
  perform pg_temp.assert('demo_cobrado', (select status = 'paid' from public.bills where id = dbill));
  -- La mesa real t1 todavía tiene los 8 datáfonos pedidos del tope: la función de la demo no los toca.
  perform pg_temp.expect('demo_no_cobra_real', format('select public.demo_confirm_sinpe(%L)', tok), 'payment_not_found');

  -- ---- Ninguna función queda abierta al navegador
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prokind = 'f' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'));
  perform pg_temp.assert('permisos', n = 0);

  select string_agg(msg, ' | ') into q from fails;
  raise exception 'RESULTADO %', coalesce(q, 'ok');
end $$;
