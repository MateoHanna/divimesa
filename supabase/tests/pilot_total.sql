-- Migración 0011 (modo piloto): cuentas de solo el total, SINPE por confirmar y regla "simulado solo en la demo".
-- Una sola transacción que termina con un error a propósito (RESULTADO ...) para no dejar nada guardado.
-- Esperado: RESULTADO ok. Cualquier otra cosa lista las comprobaciones que fallaron.
create temp table fails (msg text);

-- Comprueba que la sentencia falle con un mensaje que contenga `want`.
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
  rs uuid; t1 uuid; tok text; bill uuid; bill2 uuid; r jsonb; st jsonb; p1 uuid; p2 uuid; p3 uuid; tot record; code text;
  sa text := 'sesion-aaaaaaaaaaaaaaaa'; sb text := 'sesion-bbbbbbbbbbbbbbbb'; sc text := 'sesion-cccccccccccccccc';
  demo_tok text; demo_table uuid; dbill uuid; ids uuid[]; q text; n int;
begin
  -- ---- Restricciones del restaurante
  perform pg_temp.expect('sin_sinpe', $q$insert into public.restaurants (name, bill_mode) values ('Sin SINPE', 'total')$q$, 'restaurants_total_needs_sinpe');
  perform pg_temp.expect('numero_corto', $q$insert into public.restaurants (name, bill_mode, sinpe_number, sinpe_holder) values ('Mal numero', 'total', '8888', 'Titular')$q$, 'sinpe_number');

  insert into public.restaurants (name, bill_mode, sinpe_number, sinpe_holder, service_rate, vat_rate)
    values ('Soda Piloto', 'total', '88887777', 'Soda Piloto SA', 0.10, 0.13) returning id into rs;
  insert into public.tables (restaurant_id, number) values (rs, 1) returning id, qr_token into t1, tok;

  -- ---- Abrir cuenta
  perform pg_temp.expect('abrir_sin_total', format('select public.panel_open_bill(%L)', t1), 'total_required');
  perform pg_temp.expect('total_cero', format('select public.panel_open_bill_total(%L, 0)', t1), 'invalid_total');
  bill := public.panel_open_bill_total(t1, 25000);
  select * into tot from public.bill_totals(bill);
  perform pg_temp.assert('totales_fijos', tot.total = 25000 and tot.service = 0 and tot.vat = 0 and tot.subtotal = 25000 and tot.balance = 25000);
  perform pg_temp.expect('agregar_platos', format('select public.panel_add_items(%L, gen_random_uuid(), 1)', bill), 'total_bill');

  st := public.client_state(tok, sa);
  perform pg_temp.assert('estado_modo', st #>> '{bill,mode}' = 'total' and st #>> '{restaurant,sinpe,number}' = '88887777'
    and st #>> '{restaurant,sinpe,test}' = 'false' and st #> '{restaurant,methods}' = '["sinpe", "terminal"]'::jsonb and jsonb_array_length(st #> '{bill,lines}') = 0);

  -- ---- Métodos y modos permitidos
  perform pg_temp.expect('tarjeta_en_real', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sa, 'all', 'card', 'percent', 'mock'), 'method_not_available');
  perform pg_temp.expect('platos_en_total', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sa, 'items', 'sinpe', 'percent', 'x'), 'invalid_kind');

  -- ---- SINPE: pagar todo con 10 % de propina
  r := public.client_create_payment(tok, sa, 'all', null, 'sinpe', 'percent', 10, 'x', '{"name":"Ana","email":"ana@example.com"}'::jsonb);
  p1 := (r->>'payment_id')::uuid; code := r->>'reference_code';
  perform pg_temp.assert('sinpe_monto', (r->>'amount')::int = 25000 and (r->>'tip')::int = 2500 and r->>'kind' = 'full');
  perform pg_temp.assert('codigo_formato', code ~ '^M1-[2-9A-HJKMNP-Z]{3}$');
  perform pg_temp.assert('sin_pasarela', (select provider = 'sinpe' and provider_ref = 'sinpe_' || p1 and reported_at is null from public.payments where id = p1));
  st := public.client_state(tok, sa);
  perform pg_temp.assert('mi_sinpe_instrucciones', st #>> '{bill,my_sinpe,status}' = 'pending' and st #>> '{bill,my_sinpe,reported}' = 'false' and st #>> '{bill,my_sinpe,code}' = code);
  st := public.client_state(tok, sb);
  perform pg_temp.assert('otro_no_ve_mi_sinpe', st #> '{bill,my_sinpe}' = 'null'::jsonb and (st #>> '{bill,others_paying}') = 'true');
  perform pg_temp.expect('otro_paga_todo', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sb, 'all', 'sinpe', 'percent', 'x'), 'others_paying');

  -- Sin reportar, el salonero no puede confirmar ni rechazar.
  perform pg_temp.expect('confirmar_sin_reportar', format('select public.panel_confirm_sinpe(%L)', p1), 'payment_not_pending');
  perform pg_temp.expect('rechazar_sin_reportar', format('select public.panel_reject_sinpe(%L)', p1), 'payment_not_pending');
  -- Otra sesión no puede reportar un pago ajeno.
  perform pg_temp.expect('reportar_ajeno', format('select public.client_report_sinpe(%L,%L,%L)', p1, sb, 'X'), 'payment_not_found');

  -- ---- "Ya hice el SINPE"
  r := public.client_report_sinpe(p1, sa, '  Ana Mora  ');
  perform pg_temp.assert('reportado', r->>'status' = 'pending');
  perform pg_temp.assert('reportado_fila', (select reported_at is not null and expires_at = 'infinity' and payer_name = 'Ana Mora' from public.payments where id = p1));
  r := public.client_report_sinpe(p1, sa, 'otro');
  perform pg_temp.assert('reportar_dos_veces', (select payer_name = 'Ana Mora' from public.payments where id = p1));
  st := public.client_state(tok, sb);
  perform pg_temp.assert('reserva_no_vence', (st #>> '{bill,others_paying}') = 'true');
  perform pg_temp.expect('segundo_sinpe_mismo_celular', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sa, 'all', 'sinpe', 'percent', 'x'), 'sinpe_pending');
  r := public.client_cancel_payment(p1, sa);
  perform pg_temp.assert('volver_no_cancela_reportado', r->>'status' = 'pending');
  perform pg_temp.expect('corregir_total_con_pendiente', format('select public.panel_set_total(%L, 30000)', bill), 'sinpe_pending');
  perform pg_temp.expect('cerrar_con_pendiente', format('select public.panel_close_bill(%L)', bill), 'sinpe_pending');

  -- ---- "No llegó"
  r := public.panel_reject_sinpe(p1);
  perform pg_temp.assert('rechazado', (select status = 'failed' from public.payments where id = p1) and (select paid_amount = 0 from public.bills where id = bill));
  st := public.client_state(tok, sa);
  perform pg_temp.assert('mi_sinpe_rechazado', st #>> '{bill,my_sinpe,status}' = 'failed' and st #>> '{bill,my_sinpe,reported}' = 'true');
  perform pg_temp.expect('confirmar_rechazado', format('select public.panel_confirm_sinpe(%L)', p1), 'payment_not_pending');
  st := public.client_state(tok, sb);
  perform pg_temp.assert('saldo_liberado', (st #>> '{bill,amounts,all}')::int = 25000 and (st #>> '{bill,others_paying}') = 'false');

  -- ---- "Recibido" (idempotente) y liberar mesa
  r := public.client_create_payment(tok, sb, 'all', null, 'sinpe', 'amount', 0, 'x', null);
  p2 := (r->>'payment_id')::uuid;
  perform public.client_report_sinpe(p2, sb, null);
  r := public.panel_confirm_sinpe(p2);
  perform pg_temp.assert('confirmado', (r->>'paid_in_full')::boolean and (select status = 'paid' and paid_at is not null from public.payments where id = p2));
  perform pg_temp.assert('cuenta_pagada', (select status = 'paid' and paid_amount = 25000 from public.bills where id = bill));
  r := public.panel_confirm_sinpe(p2);
  perform pg_temp.assert('confirmar_dos_veces', (r->>'already')::boolean and (select paid_amount = 25000 from public.bills where id = bill));
  perform pg_temp.expect('rechazar_pagado', format('select public.panel_reject_sinpe(%L)', p2), 'payment_already_paid');
  perform public.panel_release_table(bill);

  -- ---- Monto libre
  bill := public.panel_open_bill_total(t1, 30000);
  perform pg_temp.expect('monto_cero', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null,0)', tok, sa, 'amount', 'sinpe', 'percent', 'x'), 'invalid_amount');
  perform pg_temp.expect('monto_sin_valor', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null)', tok, sa, 'amount', 'sinpe', 'percent', 'x'), 'invalid_amount');
  perform pg_temp.expect('monto_mayor', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null,30001)', tok, sa, 'amount', 'sinpe', 'percent', 'x'), 'amount_exceeds_balance');
  r := public.client_create_payment(tok, sa, 'amount', null, 'sinpe', 'percent', 5, 'x', null, 10000);
  p1 := (r->>'payment_id')::uuid;
  perform pg_temp.assert('monto_libre', r->>'kind' = 'amount' and (r->>'amount')::int = 10000 and (r->>'tip')::int = 500);
  perform public.client_report_sinpe(p1, sa, 'Ana');
  -- El saldo que puede pagar otra persona baja mientras ese SINPE está por confirmar.
  r := public.client_create_payment(tok, sb, 'amount', null, 'sinpe', 'percent', 0, 'x', null, 20000);
  p2 := (r->>'payment_id')::uuid;
  perform pg_temp.expect('monto_sobre_reservado', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null,1)', tok, sc, 'amount', 'sinpe', 'percent', 'x'), 'others_paying');
  perform public.panel_confirm_sinpe(p1);
  perform pg_temp.assert('saldo_tras_monto', (select balance = 20000 from public.bill_totals(bill)));
  -- p2 sigue sin reportar: corregir el total lo cancela (el cliente vuelve a la cuenta).
  r := public.panel_set_total(bill, 35000);
  perform pg_temp.assert('total_corregido', (select total = 35000 and balance = 25000 from public.bill_totals(bill)) and (select status = 'failed' from public.payments where id = p2));
  perform pg_temp.expect('total_bajo_lo_pagado', format('select public.panel_set_total(%L, 9000)', bill), 'total_below_paid');
  perform pg_temp.expect('total_negativo', format('select public.panel_set_total(%L, -5)', bill), 'invalid_total');

  -- ---- Partes iguales: la última paga lo que queda
  perform public.client_start_split(tok, sa, 3);   -- saldo 25000 -> cuota 8333
  perform pg_temp.expect('monto_libre_con_partes', format('select public.client_create_payment(%L,%L,%L,null,%L,%L,0,%L,null,100)', tok, sa, 'amount', 'sinpe', 'percent', 'x'), 'split_active');
  r := public.client_create_payment(tok, sa, 'equal', null, 'sinpe', 'percent', 0, 'x', null);  p1 := (r->>'payment_id')::uuid;
  perform pg_temp.assert('parte_1', (r->>'amount')::int = 8333);
  perform public.client_report_sinpe(p1, sa, 'A');
  r := public.client_create_payment(tok, sb, 'equal', null, 'sinpe', 'percent', 0, 'x', null);  p2 := (r->>'payment_id')::uuid;
  perform pg_temp.assert('parte_2', (r->>'amount')::int = 8333);
  perform public.client_report_sinpe(p2, sb, 'B');
  r := public.client_create_payment(tok, sc, 'equal', null, 'sinpe', 'percent', 0, 'x', null);  p3 := (r->>'payment_id')::uuid;
  perform pg_temp.assert('parte_3_resto', (r->>'amount')::int = 8334);
  perform public.client_report_sinpe(p3, sc, 'C');
  perform pg_temp.expect('cancelar_partes_con_pendiente', format('select public.panel_cancel_split(%L)', bill), 'sinpe_pending');
  perform pg_temp.expect('empezar_partes_con_pendiente', format('select public.client_start_split(%L,%L,2)', tok, sa), 'split_active');
  perform public.panel_confirm_sinpe(p1);
  perform public.panel_confirm_sinpe(p2);
  r := public.panel_confirm_sinpe(p3);
  perform pg_temp.assert('partes_pagadas', (r->>'paid_in_full')::boolean and (select status = 'paid' and paid_amount = 35000 and split_paid_parts = 3 from public.bills where id = bill));
  perform public.panel_release_table(bill);

  -- ---- Pago fuera del QR sobre una cuenta de solo el total
  bill := public.panel_open_bill_total(t1, 12000);
  r := public.record_panel_payment(bill, 'cash', 'amount', 12000, null);
  perform pg_temp.assert('efectivo_en_total', (select status = 'paid' from public.bills where id = bill));
  perform public.panel_release_table(bill);

  -- ---- Regla fija: ningún pago simulado fuera de la demo
  bill := public.panel_open_bill_total(t1, 5000);
  perform pg_temp.expect('trigger_mock', format($q$insert into public.payments (bill_id, amount, method, source, kind, provider) values (%L, 100, 'sinpe', 'qr', 'amount', 'mock')$q$, bill), 'simulated_only_demo');
  perform pg_temp.expect('trigger_mock_ref', format($q$insert into public.payments (bill_id, amount, method, source, kind, provider_ref) values (%L, 100, 'sinpe', 'qr', 'amount', 'mock_abc')$q$, bill), 'simulated_only_demo');
  perform pg_temp.expect('trigger_tarjeta', format($q$insert into public.payments (bill_id, amount, method, source, kind) values (%L, 100, 'card', 'qr', 'amount')$q$, bill), 'simulated_only_demo');
  perform pg_temp.expect('trigger_apple', format($q$insert into public.payments (bill_id, amount, method, source, kind) values (%L, 100, 'apple_pay', 'qr', 'amount')$q$, bill), 'simulated_only_demo');
  insert into public.payments (bill_id, amount, method, source, kind, status) values (bill, 100, 'sinpe', 'qr', 'amount', 'failed') returning id into p1;
  perform pg_temp.expect('trigger_update', format($q$update public.payments set provider = 'mock' where id = %L$q$, p1), 'simulated_only_demo');
  insert into public.payments (bill_id, amount, method, source, kind, status) values (bill, 100, 'terminal', 'panel', 'amount', 'failed');
  perform pg_temp.assert('terminal_real_ok', true);

  -- ---- La demo sigue igual: número de prueba, todos los métodos, cuenta por platos
  select visit.token, visit.table_id into demo_tok, demo_table from public.create_demo_visit('hash-de-prueba-0123456789') visit;
  select id into dbill from public.bills where table_id = demo_table;
  st := public.client_state(demo_tok, sa);
  perform pg_temp.assert('demo_sinpe_prueba', st #>> '{restaurant,sinpe,number}' = '00000000' and st #>> '{restaurant,sinpe,test}' = 'true'
    and jsonb_array_length(st #> '{restaurant,methods}') = 5 and st #>> '{bill,mode}' = 'items');
  -- Tarjeta simulada en la demo: permitida.
  r := public.client_create_payment(demo_tok, sa, 'all', null, 'card', 'percent', 0, 'mock', null);
  perform pg_temp.assert('demo_tarjeta', r->>'ok' = 'true');
  perform public.client_cancel_payment((r->>'payment_id')::uuid, sa);
  -- SINPE por platos en la demo: aparta los platos sin vencimiento hasta que el salonero responda.
  select array_agg(id order by created_at, id) into ids from (select id, created_at from public.bill_items where bill_id = dbill and status = 'pending' order by created_at, id limit 2) x;
  r := public.client_create_payment(demo_tok, sa, 'items', ids, 'sinpe', 'percent', 0, 'x', null);
  p1 := (r->>'payment_id')::uuid;
  perform public.client_report_sinpe(p1, sa, 'Prueba');
  perform pg_temp.assert('demo_platos_apartados', (select count(*) from public.bill_items where reserved_until = 'infinity') = 2);
  st := public.client_state(demo_tok, sb);
  perform pg_temp.assert('demo_otro_ve_apartado', (select count(*) from jsonb_array_elements(st #> '{bill,lines}') l where l->>'reserved' = 'other') = 2);
  st := public.client_state(demo_tok, sa);
  perform pg_temp.assert('demo_mi_estado_sin_infinity', (select count(*) from jsonb_array_elements(st #> '{bill,lines}') l where l->>'reserved' = 'me' and l->>'reserved_until' is null) = 2
    and st::text not like '%infinity%');
  r := public.client_state(demo_tok, sa);
  perform public.panel_reject_sinpe(p1);
  perform pg_temp.assert('demo_platos_liberados', (select count(*) from public.bill_items where bill_id = dbill and reserved_until is not null) = 0);
  -- Un SINPE confirmado por platos los marca pagados (con el botón público de la demo).
  r := public.client_create_payment(demo_tok, sa, 'items', ids, 'sinpe', 'percent', 0, 'x', null);
  p1 := (r->>'payment_id')::uuid;
  perform pg_temp.expect('demo_confirmar_sin_reporte', format('select public.demo_confirm_sinpe(%L)', demo_tok), 'payment_not_found');
  perform public.client_report_sinpe(p1, sa, null);
  perform pg_temp.expect('demo_confirmar_token_real', format('select public.demo_confirm_sinpe(%L)', tok), 'payment_not_found');
  perform public.demo_confirm_sinpe(demo_tok);
  perform pg_temp.assert('demo_platos_pagados', (select count(*) from public.bill_items where id = any(ids) and status = 'paid') = 2);

  -- Un SINPE reportado en un restaurante REAL no se puede confirmar con la función pública de la demo.
  perform public.panel_close_bill(bill);
  bill := public.panel_open_bill_total(t1, 7000);
  r := public.client_create_payment(tok, sa, 'all', null, 'sinpe', 'percent', 0, 'x', null);
  perform public.client_report_sinpe((r->>'payment_id')::uuid, sa, null);
  perform pg_temp.expect('demo_no_confirma_real', format('select public.demo_confirm_sinpe(%L)', tok), 'payment_not_found');
  perform pg_temp.assert('real_sigue_pendiente', (select status = 'pending' from public.payments where id = (r->>'payment_id')::uuid));

  -- ---- Lo que ya existía sigue igual: abrir cuenta por platos en un restaurante "items"
  perform pg_temp.assert('abrir_items', public.panel_open_bill((select id from public.tables where restaurant_id = (select id from public.restaurants where is_demo) and number = 1)) is not null);

  -- ---- Ninguna función nueva queda abierta al navegador
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prokind = 'f' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'));
  perform pg_temp.assert('permisos', n = 0);

  select string_agg(msg, ' | ') into q from fails;
  raise exception 'RESULTADO %', coalesce(q, 'ok');
end $$;
