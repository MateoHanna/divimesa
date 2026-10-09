-- Escenarios de la migración 0005 (página del cliente). Una sola transacción que termina con un error
-- a propósito (RESULTADO ...) para que no quede nada guardado. Valores esperados al final del archivo.
do $$
declare
  v_rest uuid; t2 uuid; t3 uuid; t5 uuid; t6 uuid; tok2 text; tok3 text; tok5 text; tok6 text;
  b2 uuid; b3 uuid; b5 uuid; b6 uuid; casado uuid; nachos uuid;
  A text := 'sess-aaaaaaaaaaaaaaaa'; B text := 'sess-bbbbbbbbbbbbbbbb'; C text := 'sess-cccccccccccccccc';
  D text := 'sess-dddddddddddddddd'; E text := 'sess-eeeeeeeeeeeeeeee'; F text := 'sess-ffffffffffffffff';
  r jsonb; s jsonb; msg text := ''; l1 uuid; l2 uuid; l3 uuid; pA uuid; pB uuid; grp uuid; part1 uuid; part2 uuid;
  pays uuid[] := '{}'; k int; sess text[]; p uuid;
begin
  select id into v_rest from public.restaurants order by created_at limit 1;
  select id, qr_token into t2, tok2 from public.tables where restaurant_id = v_rest and number = 2;
  select id, qr_token into t3, tok3 from public.tables where restaurant_id = v_rest and number = 3;
  select id, qr_token into t5, tok5 from public.tables where restaurant_id = v_rest and number = 5;
  select id, qr_token into t6, tok6 from public.tables where restaurant_id = v_rest and number = 6;
  select id into casado from public.menu_items where restaurant_id = v_rest and name = 'Casado de pollo';
  select id into nachos from public.menu_items where restaurant_id = v_rest and name = 'Nachos para compartir';

  -- 1. Mesa sin cuenta
  s := public.client_state(tok2, A);
  msg := msg || 'S1.view=' || coalesce(((s->>'view'))::text, '∅') || '; ';
  begin perform public.client_state('token-que-no-existe', A); msg := msg || 'S1b.PERMITIDO; ';
  exception when others then msg := msg || 'S1b.' || coalesce(sqlerrm, '∅') || '; '; end;

  -- 2. Cuenta con 2 casados y unos nachos (17200 -> total 21156)
  b2 := public.panel_open_bill(t2);
  perform public.panel_add_items(b2, casado, 2);
  perform public.panel_add_items(b2, nachos, 1);
  select id into l1 from public.bill_items where bill_id = b2 and name = 'Casado de pollo' order by created_at limit 1;
  select id into l2 from public.bill_items where bill_id = b2 and name = 'Casado de pollo' order by created_at offset 1 limit 1;
  select id into l3 from public.bill_items where bill_id = b2 and name = 'Nachos para compartir';
  s := public.client_state(tok2, A);
  msg := msg || 'S2.view=' || coalesce(((s->>'view'))::text, '∅') || ' lineas=' || coalesce((jsonb_array_length(s->'bill'->'lines'))::text, '∅') || ' total=' || coalesce(((s->'bill'->'totals'->>'total'))::text, '∅') || '; ';

  -- 3. Reservas
  r := public.client_reserve_items(tok2, A, array[l1, l2]);
  msg := msg || 'R1.reservados=' || coalesce((jsonb_array_length(r->'reserved'))::text, '∅') || ' conflictos=' || coalesce((jsonb_array_length(r->'conflicts'))::text, '∅') || '; ';
  r := public.client_reserve_items(tok2, B, array[l1, l3]);
  msg := msg || 'R2.reservados=' || coalesce((jsonb_array_length(r->'reserved'))::text, '∅') || ' motivo=' || coalesce(((r->'conflicts'->0->>'reason'))::text, '∅') || '; ';
  s := public.client_state(tok2, B);
  msg := msg || 'R3.l1_para_B=' || coalesce(((select x->>'reserved' from jsonb_array_elements(s->'bill'->'lines') x where x->>'id' = l1::text))::text, '∅') || ' l3_para_B=' || coalesce(((select x->>'reserved' from jsonb_array_elements(s->'bill'->'lines') x where x->>'id' = l3::text))::text, '∅') || '; ';
  begin perform public.client_reserve_items(tok2, 'corto', array[l1]); msg := msg || 'R4.PERMITIDO; ';
  exception when others then msg := msg || 'R4.' || coalesce(sqlerrm, '∅') || '; '; end;

  -- 4. A paga el casado 1 con propina de 10% y datos de factura
  r := public.client_create_payment(tok2, A, 'items', array[l1], 'card', 'percent', 10, 'mock',
        '{"name":"Ana","id_type":"fisica","id_number":"123456789","email":"ana@correo.cr"}'::jsonb);
  pA := (r->>'payment_id')::uuid;
  msg := msg || 'P1.ok=' || coalesce(((r->>'ok'))::text, '∅') || ' monto=' || coalesce(((r->>'amount'))::text, '∅') || ' propina=' || coalesce(((r->>'tip'))::text, '∅') || ' facturas=' || coalesce(((select count(*) from public.invoice_requests where payment_id = pA))::text, '∅') || ' l2_libre=' || coalesce((coalesce((select (reserved_until is null)::text from public.bill_items where id = l2), '?'))::text, '∅') || '; ';

  -- 5. B intenta pagar el mismo plato: aviso, sin excepción y sin crear pago
  r := public.client_create_payment(tok2, B, 'items', array[l1], 'card', 'percent', 0, 'mock', null);
  msg := msg || 'P2.ok=' || coalesce(((r->>'ok'))::text, '∅') || ' codigo=' || coalesce(((r->>'code'))::text, '∅') || ' motivo=' || coalesce(((r->'unavailable'->0->>'reason'))::text, '∅') || ' pagos_de_B=' || coalesce(((select count(*) from public.payments where session_id = B))::text, '∅') || '; ';

  -- 6. A vuelve a iniciar un pago (casado 1 y 2): el anterior se cancela solo
  r := public.client_create_payment(tok2, A, 'items', array[l1, l2], 'google_pay', 'amount', 500, 'mock', null);
  msg := msg || 'P3.monto=' || coalesce(((r->>'amount'))::text, '∅') || ' propina=' || coalesce(((r->>'tip'))::text, '∅') || ' anterior=' || coalesce(((select status from public.payments where id = pA))::text, '∅') || ' pendientes_de_A=' || coalesce(((select count(*) from public.payments where session_id = A and status = 'pending'))::text, '∅') || '; ';
  pA := (r->>'payment_id')::uuid;

  -- 7. B paga todo: solo lo que no está apartado por el pago de A
  r := public.client_create_payment(tok2, B, 'all', null, 'sinpe', 'percent', 5, 'mock', null);
  pB := (r->>'payment_id')::uuid;
  msg := msg || 'P4.monto=' || coalesce(((r->>'amount'))::text, '∅') || ' tipo=' || coalesce(((r->>'kind'))::text, '∅') || ' propina=' || coalesce(((r->>'tip'))::text, '∅') || '; ';
  begin perform public.client_create_payment(tok2, C, 'all', null, 'card', 'percent', 0, 'mock', null); msg := msg || 'P5.PERMITIDO; ';
  exception when others then msg := msg || 'P5.' || coalesce(sqlerrm, '∅') || '; '; end;
  s := public.client_state(tok2, C);
  msg := msg || 'P6.otros_pagando=' || coalesce(((s->'bill'->>'others_paying'))::text, '∅') || ' puede_pagar_todo=' || coalesce(((s->'bill'->'amounts'->>'all'))::text, '∅') || '; ';
  s := public.client_state(tok2, A);
  msg := msg || 'P7.A_ve_pagar_todo=' || coalesce(((s->'bill'->'amounts'->>'all'))::text, '∅') || '; ';

  -- 8. Se confirman los dos pagos: la cuenta queda pagada
  update public.payments set provider_ref = 'ref-A' where id = pA;
  update public.payments set provider_ref = 'ref-B' where id = pB;
  r := public.confirm_payment('ref-A');
  msg := msg || 'C1.A_aplicado=' || coalesce(((r->>'applied'))::text, '∅');
  r := public.confirm_payment('ref-B');
  msg := msg || ' B_aplicado=' || coalesce(((r->>'applied'))::text, '∅') || ' estado=' || coalesce(((select status from public.bills where id = b2))::text, '∅') || ' pendientes=' || coalesce(((select count(*) from public.bill_items where bill_id = b2 and status = 'pending'))::text, '∅') || '; ';
  s := public.client_state(tok2, C);
  msg := msg || 'C2.vista_pagada=' || coalesce(((s->>'view'))::text, '∅') || ' estado=' || coalesce(((s->'bill'->>'status'))::text, '∅') || '; ';
  begin perform public.client_reserve_items(tok2, C, array[l1]); msg := msg || 'C3.PERMITIDO; ';
  exception when others then msg := msg || 'C3.' || coalesce(sqlerrm, '∅') || '; '; end;

  -- 9. Liberar la mesa muestra cerrada; una cuenta nueva aparece sola
  perform public.panel_release_table(b2);
  s := public.client_state(tok2, C);
  msg := msg || 'C4.vista=' || coalesce(((s->>'view'))::text, '∅') || ' estado=' || coalesce(((s->'bill'->>'status'))::text, '∅');
  b2 := public.panel_open_bill(t2);
  s := public.client_state(tok2, C);
  msg := msg || ' C5.vista_nueva=' || coalesce(((s->>'view'))::text, '∅') || ' lineas=' || coalesce((jsonb_array_length(s->'bill'->'lines'))::text, '∅') || '; ';

  -- 10. Dividir un plato entre 3 (Mesa 3)
  b3 := public.panel_open_bill(t3);
  perform public.panel_add_items(b3, nachos, 1);
  perform public.panel_add_items(b3, casado, 1);
  select id into l1 from public.bill_items where bill_id = b3 and name = 'Nachos para compartir';
  r := public.client_split_item(tok3, A, l1, 3);
  grp := (r->>'group_id')::uuid;
  msg := msg || 'D1.partes=' || coalesce(((select array_agg(unit_price order by split_index)::text from public.bill_items where split_group_id = grp and split_index > 0))::text, '∅') || ' total=' || coalesce(((select total from public.bill_totals(b3)))::text, '∅') || ' nombre1=' || coalesce(((select name from public.bill_items where split_group_id = grp and split_index = 1))::text, '∅') || '; ';
  select id into part1 from public.bill_items where split_group_id = grp and split_index = 1;
  select id into part2 from public.bill_items where split_group_id = grp and split_index = 2;
  begin perform public.client_split_item(tok3, A, part1, 2); msg := msg || 'D2.PERMITIDO; ';
  exception when others then msg := msg || 'D2.' || coalesce(sqlerrm, '∅') || '; '; end;
  begin perform public.client_split_item(tok3, A, l1, 2); msg := msg || 'D3.PERMITIDO; ';
  exception when others then msg := msg || 'D3.' || coalesce(sqlerrm, '∅') || '; '; end;

  -- 11. El salonero deshace la división (nada pagado)
  perform public.panel_unsplit_item(part2);
  msg := msg || 'D4.lineas=' || coalesce(((select count(*) from public.bill_items where bill_id = b3 and status <> 'void'))::text, '∅') || ' nachos=' || coalesce(((select status || '/' || unit_price from public.bill_items where id = l1))::text, '∅') || ' total=' || coalesce(((select total from public.bill_totals(b3)))::text, '∅') || '; ';

  -- 12. Se divide otra vez, A paga la parte 1; mientras está apartada o ya pagada no se puede deshacer
  r := public.client_split_item(tok3, A, l1, 3);
  grp := (r->>'group_id')::uuid;
  select id into part1 from public.bill_items where split_group_id = grp and split_index = 1;
  r := public.client_create_payment(tok3, A, 'items', array[part1], 'card', 'percent', 0, 'mock', null);
  pA := (r->>'payment_id')::uuid;
  msg := msg || 'D5.monto_parte=' || coalesce(((r->>'amount'))::text, '∅') || '; ';
  begin perform public.panel_unsplit_item(part1); msg := msg || 'D6.PERMITIDO; ';
  exception when others then msg := msg || 'D6.' || coalesce(sqlerrm, '∅') || '; '; end;
  update public.payments set provider_ref = 'ref-D' where id = pA;
  perform public.confirm_payment('ref-D');
  begin perform public.panel_unsplit_item(part1); msg := msg || 'D7.PERMITIDO; ';
  exception when others then msg := msg || 'D7.' || coalesce(sqlerrm, '∅') || '; '; end;

  -- 13. Partes iguales entre 5 en la Mesa 5 (21156 / 5 = 4231, la última paga 4232)
  b5 := public.panel_open_bill(t5);
  perform public.panel_add_items(b5, casado, 2);
  perform public.panel_add_items(b5, nachos, 1);
  begin perform public.client_create_payment(tok5, A, 'equal', null, 'card', 'percent', 0, 'mock', null); msg := msg || 'E0.PERMITIDO; ';
  exception when others then msg := msg || 'E0.' || coalesce(sqlerrm, '∅') || '; '; end;
  r := public.client_start_split(tok5, A, 5);
  msg := msg || 'E1.cuota=' || coalesce(((r->>'share'))::text, '∅');
  s := public.client_state(tok5, B);
  msg := msg || ' faltan=' || coalesce(((s->'bill'->'split'->>'remaining'))::text, '∅') || ' debe=' || coalesce(((s->'bill'->'split'->>'due'))::text, '∅') || '; ';
  begin perform public.client_start_split(tok5, B, 3); msg := msg || 'E2.PERMITIDO; ';
  exception when others then msg := msg || 'E2.' || coalesce(sqlerrm, '∅') || '; '; end;
  sess := array[A, B, C, D, E];
  msg := msg || 'E3.montos=';
  for k in 1..5 loop
    r := public.client_create_payment(tok5, sess[k], 'equal', null, 'card', 'percent', 0, 'mock', null);
    pays := pays || (r->>'payment_id')::uuid;
    msg := msg || coalesce(((r->>'amount'))::text, '∅') || '/' || coalesce(((select split_part_index from public.payments where id = (r->>'payment_id')::uuid))::text, '∅') || ' ';
  end loop;
  begin perform public.client_create_payment(tok5, F, 'equal', null, 'card', 'percent', 0, 'mock', null); msg := msg || 'E4.PERMITIDO; ';
  exception when others then msg := msg || 'E4.' || coalesce(sqlerrm, '∅') || '; '; end;
  begin perform public.client_create_payment(tok5, F, 'items', array[l1], 'card', 'percent', 0, 'mock', null); msg := msg || 'E5.PERMITIDO; ';
  exception when others then msg := msg || 'E5.' || coalesce(sqlerrm, '∅') || '; '; end;
  k := 0;
  foreach p in array pays loop
    k := k + 1;
    update public.payments set provider_ref = 'ref-E' || k where id = p;
    perform public.confirm_payment('ref-E' || k);
  end loop;
  msg := msg || 'E6.estado=' || coalesce(((select status from public.bills where id = b5))::text, '∅') || ' partes=' || coalesce(((select split_paid_parts from public.bills where id = b5))::text, '∅') || ' pagado=' || coalesce(((select paid_amount from public.bills where id = b5))::text, '∅') || '; ';

  -- 14. Cancelar el pago pendiente suelta lo apartado; vencimientos
  b6 := public.panel_open_bill(t6);
  perform public.panel_add_items(b6, casado, 2);
  select id into l1 from public.bill_items where bill_id = b6 order by created_at limit 1;
  r := public.client_create_payment(tok6, A, 'items', array[l1], 'card', 'percent', 0, 'mock', null);
  pA := (r->>'payment_id')::uuid;
  begin perform public.client_cancel_payment(pA, B); msg := msg || 'X1.PERMITIDO; ';
  exception when others then msg := msg || 'X1.' || coalesce(sqlerrm, '∅') || '; '; end;
  r := public.client_cancel_payment(pA, A);
  msg := msg || 'X2.estado=' || coalesce(((r->>'status'))::text, '∅') || ' libre=' || coalesce(((select (reserved_until is null)::text from public.bill_items where id = l1))::text, '∅') || ' token_ok=' || coalesce((((r->>'token') = tok6)::text)::text, '∅');
  r := public.client_reserve_items(tok6, B, array[l1]);
  msg := msg || ' B_reserva=' || coalesce((jsonb_array_length(r->'reserved'))::text, '∅') || '; ';
  perform public.client_drop_mine(b6, B);
  r := public.client_create_payment(tok6, A, 'all', null, 'card', 'percent', 0, 'mock', null);
  begin perform public.client_start_split(tok6, B, 2); msg := msg || 'X3.PERMITIDO; ';
  exception when others then msg := msg || 'X3.' || coalesce(sqlerrm, '∅') || '; '; end;
  update public.payments set expires_at = now() - interval '1 minute' where id = (r->>'payment_id')::uuid;
  r := public.client_create_payment(tok6, C, 'all', null, 'card', 'percent', 0, 'mock', null);
  msg := msg || 'X4.pagar_todo_tras_vencer=' || coalesce(((r->>'amount'))::text, '∅') || '; ';
  update public.bill_items set reserved_by_session = D, reserved_until = now() - interval '1 minute' where id = l1;
  r := public.client_reserve_items(tok6, E, array[l1]);
  msg := msg || 'X5.reserva_vencida_reservada=' || coalesce((jsonb_array_length(r->'reserved'))::text, '∅') || '; ';

  raise exception 'RESULTADO %', msg;
exception when others then
  if sqlerrm like 'RESULTADO %' then raise; end if;
  raise exception 'RESULTADO % | ERROR_NO_CAPTURADO=% (%)', msg, sqlerrm, sqlstate;
end $$;
-- Esperado (corrido contra Supabase el 2026-10-09; ∅ marcaría un valor nulo):
-- S1.view=no_bill; S1b.table_not_found; S2.view=open lineas=3 total=21156; R1.reservados=2 conflictos=0;
-- R2.reservados=1 motivo=reserved; R3.l1_para_B=other l3_para_B=me; R4.invalid_session;
-- P1.ok=true monto=6765 propina=677 facturas=1 l2_libre=true; P2.ok=false codigo=items_unavailable motivo=reserved pagos_de_B=0;
-- P3.monto=13530 propina=500 anterior=failed pendientes_de_A=1; P4.monto=7626 tipo=amount propina=381 (7626*5% = 381.3);
-- P5.others_paying; P6.otros_pagando=true puede_pagar_todo=0; P7.A_ve_pagar_todo=13530;
-- C1.A_aplicado=13530 B_aplicado=7626 estado=paid pendientes=0; C2.vista_pagada=finished estado=paid; C3.bill_not_open;
-- C4.vista=finished estado=closed C5.vista_nueva=open lineas=0;
-- D1.partes={2066,2066,2068} total=14391 nombre1=Nachos para compartir (1 de 3); D2.already_split; D3.item_not_found;
-- D4.lineas=2 nachos=pending/6200 total=14391; D5.monto_parte=2541; D6.item_reserved; D7.split_group_paid;
-- E0.no_split; E1.cuota=4231 faltan=5 debe=4231; E2.split_active; E3.montos=4231/1 4231/2 4231/3 4231/4 4232/5 ;
-- E4.no_parts_left; E5.split_active; E6.estado=paid partes=5 pagado=21156;
-- X1.payment_not_found; X2.estado=failed libre=true token_ok=true B_reserva=1; X3.payments_in_progress;
-- X4.pagar_todo_tras_vencer=13530; X5.reserva_vencida_reservada=1
