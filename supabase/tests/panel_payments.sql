-- Escenarios de la migración 0004. Se ejecuta en una sola transacción que termina con un error
-- a propósito (RESULTADO ...) para que nada quede guardado. Correr con el conector de Supabase
-- o en el SQL Editor y comparar con los valores esperados al final de este archivo.
do $$
declare
  v_rest uuid; v_t2 uuid; v_t3 uuid; v_bill uuid; v_bill2 uuid; v_bill3 uuid;
  v_casado uuid; v_imperial uuid; r jsonb; t record; ids uuid[]; msg text := '';
  v_line uuid;
begin
  select id into v_rest from public.restaurants order by created_at limit 1;
  select id into v_t2 from public.tables where restaurant_id = v_rest and number = 2;
  select id into v_t3 from public.tables where restaurant_id = v_rest and number = 3;
  select id into v_casado from public.menu_items where restaurant_id = v_rest and name = 'Casado de pollo';
  select id into v_imperial from public.menu_items where restaurant_id = v_rest and name = 'Imperial';

  -- A. Abrir cuenta en la Mesa 2 y agregar 4 platos (2 casados de 5500 y 2 imperiales de 2500)
  v_bill := public.panel_open_bill(v_t2);
  perform public.panel_add_items(v_bill, v_casado, 2);
  perform public.panel_add_items(v_bill, v_imperial, 2);
  select * into t from public.bill_totals(v_bill);
  msg := msg || 'A.totales=' || t.subtotal || '/' || t.service || '/' || t.vat || '/' || t.total || '; ';

  -- B. Una segunda cuenta viva en la misma mesa debe fallar
  begin perform public.panel_open_bill(v_t2); msg := msg || 'B.PERMITIDA; ';
  exception when others then msg := msg || 'B.' || sqlerrm || '; '; end;

  -- C. Pago por monto con datáfono de 5000
  r := public.record_panel_payment(v_bill, 'terminal', 'amount', 5000, null);
  select * into t from public.bill_totals(v_bill);
  msg := msg || 'C.aplicado=' || (r->>'applied') || ' pagado=' || t.paid || ' saldo=' || t.balance || '; ';

  -- D. Monto mayor al saldo debe fallar
  begin perform public.record_panel_payment(v_bill, 'cash', 'amount', 20000, null); msg := msg || 'D.PERMITIDO; ';
  exception when others then msg := msg || 'D.' || sqlerrm || '; '; end;

  -- E. Pago en efectivo por platos: los dos casados
  select array_agg(id) into ids from public.bill_items where bill_id = v_bill and name = 'Casado de pollo';
  r := public.record_panel_payment(v_bill, 'cash', 'items', null, ids);
  select * into t from public.bill_totals(v_bill);
  msg := msg || 'E.monto=' || (r->>'amount') || ' saldo=' || t.balance
      || ' casados_pagados=' || (select count(*) from public.bill_items where bill_id = v_bill and name = 'Casado de pollo' and status = 'paid') || '; ';

  -- F. Volver a pagar las mismas líneas debe fallar
  begin perform public.record_panel_payment(v_bill, 'cash', 'items', null, ids); msg := msg || 'F.PERMITIDO; ';
  exception when others then msg := msg || 'F.' || sqlerrm || '; '; end;

  -- G. Una línea reservada por otra persona no se puede anular, ni editar, ni pagar desde el panel
  select id into v_line from public.bill_items where bill_id = v_bill and status = 'pending' order by created_at limit 1;
  update public.bill_items set reserved_by_session = 'sesion-x', reserved_until = now() + interval '2 minutes' where id = v_line;
  begin perform public.panel_void_item(v_line); msg := msg || 'G1.PERMITIDO; ';
  exception when others then msg := msg || 'G1.' || sqlerrm || '; '; end;
  begin perform public.panel_set_price(v_line, 3000); msg := msg || 'G2.PERMITIDO; ';
  exception when others then msg := msg || 'G2.' || sqlerrm || '; '; end;
  begin perform public.record_panel_payment(v_bill, 'cash', 'items', null, array[v_line]); msg := msg || 'G3.PERMITIDO; ';
  exception when others then msg := msg || 'G3.' || sqlerrm || '; '; end;
  update public.bill_items set reserved_by_session = null, reserved_until = null where id = v_line;

  -- H. Pagar el resto por monto exacto cierra la cuenta y marca todo pagado
  select * into t from public.bill_totals(v_bill);
  r := public.record_panel_payment(v_bill, 'terminal', 'amount', t.balance, null);
  msg := msg || 'H.estado=' || (select status from public.bills where id = v_bill)
      || ' pendientes=' || (select count(*) from public.bill_items where bill_id = v_bill and status = 'pending')
      || ' saldo=' || (select balance from public.bill_totals(v_bill)) || '; ';

  -- I. Con la cuenta pagada no se agregan platos, y liberar la mesa la cierra
  begin perform public.panel_add_items(v_bill, v_casado, 1); msg := msg || 'I1.PERMITIDO; ';
  exception when others then msg := msg || 'I1.' || sqlerrm || '; '; end;
  perform public.panel_release_table(v_bill);
  msg := msg || 'I2.estado=' || (select status from public.bills where id = v_bill) || '; ';
  begin perform public.panel_release_table(v_bill); msg := msg || 'I3.PERMITIDO; ';
  exception when others then msg := msg || 'I3.' || sqlerrm || '; '; end;

  -- J. Confirmación idempotente (como un webhook repetido) y pago de más
  v_bill2 := public.panel_open_bill(v_t2);
  perform public.panel_add_items(v_bill2, v_casado, 1);              -- total 6765
  insert into public.payments (bill_id, amount, method, source, kind, provider, provider_ref, status)
  values (v_bill2, 3000, 'card', 'qr', 'amount', 'mock', 'test-ref-1', 'pending');
  r := public.confirm_payment('test-ref-1');
  msg := msg || 'J1.ya=' || coalesce(r->>'already', 'false');
  r := public.confirm_payment('test-ref-1');
  msg := msg || ' J2.ya=' || coalesce(r->>'already', 'false') || ' pagado=' || (select paid_amount from public.bills where id = v_bill2) || '; ';
  insert into public.payments (bill_id, amount, method, source, kind, provider, provider_ref, status)
  values (v_bill2, 5000, 'card', 'qr', 'amount', 'mock', 'test-ref-2', 'pending');
  r := public.confirm_payment('test-ref-2');                         -- saldo 3765: aplica 3765 y sobran 1235
  msg := msg || 'J3.aplicado=' || (r->>'applied') || ' sobrante=' || (r->>'overpaid')
      || ' estado=' || (select status from public.bills where id = v_bill2)
      || ' pagado=' || (select paid_amount from public.bills where id = v_bill2) || '; ';
  begin perform public.confirm_payment('no-existe'); msg := msg || 'J4.PERMITIDO; ';
  exception when others then msg := msg || 'J4.' || sqlerrm || '; '; end;

  -- K. Anular y editar precio, y no bajar el total por debajo de lo ya pagado
  v_bill3 := public.panel_open_bill(v_t3);
  perform public.panel_add_items(v_bill3, v_casado, 2);              -- 11000
  select id into v_line from public.bill_items where bill_id = v_bill3 order by created_at limit 1;
  perform public.panel_set_price(v_line, 4000);                       -- 4000 + 5500 = 9500
  select * into t from public.bill_totals(v_bill3);
  msg := msg || 'K1.subtotal=' || t.subtotal || ' total=' || t.total || '; ';
  perform public.record_panel_payment(v_bill3, 'cash', 'amount', 9000, null);   -- total 9500*1.23 = 11685
  begin perform public.panel_set_price(v_line, 1000); msg := msg || 'K2.PERMITIDO; ';
  exception when others then msg := msg || 'K2.' || sqlerrm || '; '; end;
  begin perform public.panel_void_item(v_line); msg := msg || 'K3.PERMITIDO; ';  -- total 6765 < 9000 pagado
  exception when others then msg := msg || 'K3.' || sqlerrm || '; '; end;

  raise exception 'RESULTADO %', msg;
exception when others then
  if sqlerrm like 'RESULTADO %' then raise; end if;
  raise exception 'RESULTADO % | ERROR_NO_CAPTURADO=% (%)', msg, sqlerrm, sqlstate;
end $$;
-- Esperado (ver PROGRESO.md): A.totales=16000/1600/2080/19680; B.table_has_bill; C.aplicado=5000 pagado=5000 saldo=14680;
-- D.amount_exceeds_balance; E.monto=10093 saldo=4587 casados_pagados=2; F.item_not_pending; G1/G2/G3=item_reserved;
-- H.estado=paid pendientes=0 saldo=0; I1.bill_not_open I2.estado=closed I3.bill_not_paid; J1.ya=false J2.ya=true pagado=3000;
-- J3.aplicado=3765 sobrante=1235 estado=paid pagado=6765; J4.payment_not_found; K1.subtotal=9500 total=11685;
-- K2.total_below_paid (6500*1.23=7995 < 9000); K3.total_below_paid (5500*1.23=6765 < 9000)
