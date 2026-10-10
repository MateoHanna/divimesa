-- Prueba de aceptación del SPEC (pasos 1 a 10) hecha contra las funciones SQL, como las llaman las API routes.
-- Una sola transacción que termina con un error a propósito (RESULTADO ...) para no dejar nada guardado.
do $$
declare
  v_rest uuid; t2 uuid; t3 uuid; t5 uuid; t6 uuid; tok2 text; tok3 text; tok5 text; tok6 text;
  b2 uuid; b3 uuid; b5 uuid; b6 uuid; casado uuid; nachos uuid; imperial uuid;
  A text := 'sess-aaaaaaaaaaaaaaaa'; B text := 'sess-bbbbbbbbbbbbbbbb'; C text := 'sess-cccccccccccccccc'; D text := 'sess-dddddddddddddddd';
  r jsonb; s jsonb; msg text := ''; l1 uuid; l2 uuid; n1 uuid; i1 uuid; grp uuid; part1 uuid; pA uuid; pB uuid; pC uuid; pD uuid; pX uuid;
  paid_before int; bal int;
begin
  select id into v_rest from public.restaurants order by created_at limit 1;
  select id, qr_token into t2, tok2 from public.tables where restaurant_id = v_rest and number = 2;
  select id, qr_token into t3, tok3 from public.tables where restaurant_id = v_rest and number = 3;
  select id, qr_token into t5, tok5 from public.tables where restaurant_id = v_rest and number = 5;
  select id, qr_token into t6, tok6 from public.tables where restaurant_id = v_rest and number = 6;
  select id into casado from public.menu_items where restaurant_id = v_rest and name = 'Casado de pollo';
  select id into nachos from public.menu_items where restaurant_id = v_rest and name = 'Nachos para compartir';
  select id into imperial from public.menu_items where restaurant_id = v_rest and name = 'Imperial';

  -- Paso 1: abrir la Mesa 2 con 4 platos (el QR es el token de la mesa)
  b2 := public.panel_open_bill(t2);
  perform public.panel_add_items(b2, casado, 2);
  perform public.panel_add_items(b2, nachos, 1);
  perform public.panel_add_items(b2, imperial, 1);
  select id into l1 from public.bill_items where bill_id = b2 and name = 'Casado de pollo' order by created_at, id limit 1;
  select id into l2 from public.bill_items where bill_id = b2 and name = 'Casado de pollo' order by created_at, id offset 1 limit 1;
  select id into n1 from public.bill_items where bill_id = b2 and name = 'Nachos para compartir';
  select id into i1 from public.bill_items where bill_id = b2 and name = 'Imperial';
  s := public.client_state(tok2, A);
  msg := msg || 'P1.lineas=' || coalesce((jsonb_array_length(s->'bill'->'lines'))::text, '∅') || ' total=' || coalesce(((s->'bill'->'totals'->>'total'))::text, '∅') || '; ';

  -- Paso 2: A elige 2 platos (casado 1 e imperial) y paga con tarjeta; el panel ve el pago
  perform public.client_reserve_items(tok2, A, array[l1, i1]);
  r := public.client_create_payment(tok2, A, 'items', array[l1, i1], 'card', 'percent', 0, 'mock', null);
  pA := (r->>'payment_id')::uuid;
  update public.payments set provider_ref = 'mock_' || pA where id = pA;
  r := public.confirm_payment('mock_' || pA);
  select balance into bal from public.bill_totals(b2);
  msg := msg || 'P2.aplicado=' || coalesce(((r->>'applied'))::text, '∅') || ' saldo=' || coalesce(bal::text, '∅')
    || ' pagos_en_panel=' || coalesce(((select count(*) from public.payments where bill_id = b2 and status = 'paid'))::text, '∅') || '; ';

  -- Paso 3: B ve esos 2 platos como pagados y no los puede elegir
  s := public.client_state(tok2, B);
  r := public.client_reserve_items(tok2, B, array[l1]);
  msg := msg || 'P3.l1=' || coalesce(((select x->>'status' from jsonb_array_elements(s->'bill'->'lines') x where x->>'id' = l1::text))::text, '∅')
    || ' i1=' || coalesce(((select x->>'status' from jsonb_array_elements(s->'bill'->'lines') x where x->>'id' = i1::text))::text, '∅')
    || ' motivo=' || coalesce(((r->'conflicts'->0->>'reason'))::text, '∅') || '; ';

  -- Paso 4: B divide los nachos entre 3 y paga una parte
  r := public.client_split_item(tok2, B, n1, 3);
  grp := (r->>'group_id')::uuid;
  select id into part1 from public.bill_items where split_group_id = grp and split_index = 1;
  perform public.client_reserve_items(tok2, B, array[part1]);
  r := public.client_create_payment(tok2, B, 'items', array[part1], 'card', 'percent', 0, 'mock', null);
  pB := (r->>'payment_id')::uuid;
  update public.payments set provider_ref = 'mock_' || pB where id = pB;
  r := public.confirm_payment('mock_' || pB);
  select balance into bal from public.bill_totals(b2);
  msg := msg || 'P4.parte=' || coalesce(((r->>'applied'))::text, '∅') || ' saldo=' || coalesce(bal::text, '∅') || '; ';

  -- Paso 5: el salonero registra ₡5 000 con datáfono
  r := public.record_panel_payment(b2, 'terminal', 'amount', 5000, null);
  select balance into bal from public.bill_totals(b2);
  msg := msg || 'P5.aplicado=' || coalesce(((r->>'applied'))::text, '∅') || ' saldo=' || coalesce(bal::text, '∅') || '; ';

  -- Paso 6: C elige partes iguales entre 2 para el resto y paga; D paga la segunda parte
  r := public.client_start_split(tok2, C, 2);
  msg := msg || 'P6.cuota=' || coalesce(((r->>'share'))::text, '∅');
  r := public.client_create_payment(tok2, C, 'equal', null, 'card', 'percent', 0, 'mock', null);
  pC := (r->>'payment_id')::uuid;
  msg := msg || ' montoC=' || coalesce(((r->>'amount'))::text, '∅');
  r := public.client_create_payment(tok2, D, 'equal', null, 'google_pay', 'percent', 0, 'mock', null);
  pD := (r->>'payment_id')::uuid;
  msg := msg || ' montoD=' || coalesce(((r->>'amount'))::text, '∅');
  update public.payments set provider_ref = 'mock_' || pC where id = pC;
  update public.payments set provider_ref = 'mock_' || pD where id = pD;
  perform public.confirm_payment('mock_' || pC);
  r := public.confirm_payment('mock_' || pD);

  -- Paso 7: saldo 0, mesa pagada, el panel la ve y el salonero la libera
  select balance into bal from public.bill_totals(b2);
  msg := msg || ' P7.saldo=' || coalesce(bal::text, '∅') || ' estado=' || coalesce(((select status from public.bills where id = b2))::text, '∅')
    || ' pagada_completa=' || coalesce(((r->>'paid_in_full'))::text, '∅')
    || ' lineas_pendientes=' || coalesce(((select count(*) from public.bill_items where bill_id = b2 and status = 'pending'))::text, '∅');
  s := public.client_state(tok2, C);
  msg := msg || ' vista=' || coalesce(((s->>'view'))::text, '∅') || '/' || coalesce(((s->'bill'->>'outcome'))::text, '∅');
  perform public.panel_release_table(b2);
  s := public.client_state(tok2, C);
  msg := msg || ' liberada=' || coalesce(((s->>'view'))::text, '∅') || '/' || coalesce(((s->'bill'->>'outcome'))::text, '∅') || '; ';

  -- Paso 8: dos personas intentan pagar el mismo plato: una lo logra, la otra ve un aviso
  b3 := public.panel_open_bill(t3);
  perform public.panel_add_items(b3, casado, 1);
  perform public.panel_add_items(b3, imperial, 1);
  select id into l1 from public.bill_items where bill_id = b3 and name = 'Casado de pollo';
  r := public.client_create_payment(tok3, A, 'items', array[l1], 'card', 'percent', 0, 'mock', null);
  msg := msg || 'P8.primero=' || coalesce(((r->>'ok'))::text, '∅');
  r := public.client_create_payment(tok3, B, 'items', array[l1], 'card', 'percent', 0, 'mock', null);
  msg := msg || ' segundo=' || coalesce(((r->>'ok'))::text, '∅') || '/' || coalesce(((r->'unavailable'->0->>'reason'))::text, '∅')
    || ' pagos_de_B=' || coalesce(((select count(*) from public.payments where session_id = B and bill_id = b3))::text, '∅') || '; ';

  -- Paso 9: el mismo webhook dos veces no descuenta dos veces (pagado, rechazado, desconocido)
  select paid_amount into paid_before from public.bills where id = b2;
  r := public.confirm_payment('mock_' || pC);
  msg := msg || 'P9.repetido_already=' || coalesce(((r->>'already'))::text, '∅')
    || ' pagado_igual=' || coalesce((((select paid_amount from public.bills where id = b2) = paid_before))::text, '∅');
  r := public.fail_payment('mock_' || pC);
  msg := msg || ' rechazo_sobre_pagado=' || coalesce(((r->>'already'))::text, '∅') || '/' || coalesce(((r->>'status'))::text, '∅')
    || ' estado_sigue=' || coalesce(((select status from public.payments where id = pC))::text, '∅');
  begin perform public.confirm_payment('no-existe'); msg := msg || ' desconocido=PERMITIDO';
  exception when others then msg := msg || ' desconocido=' || coalesce(sqlerrm, '∅'); end;

  -- Rechazo: el pago pasa a fallido, se libera lo apartado y repetirlo no cambia nada
  b5 := public.panel_open_bill(t5);
  perform public.panel_add_items(b5, casado, 2);
  select id into l2 from public.bill_items where bill_id = b5 order by created_at, id limit 1;
  r := public.client_create_payment(tok5, A, 'items', array[l2], 'card', 'percent', 0, 'mock', null);
  pX := (r->>'payment_id')::uuid;
  update public.payments set provider_ref = 'mock_' || pX where id = pX;
  r := public.fail_payment('mock_' || pX);
  msg := msg || ' R1.estado=' || coalesce(((select status from public.payments where id = pX))::text, '∅') || ' ya=' || coalesce(((r->>'already'))::text, '∅')
    || ' token_ok=' || coalesce((((r->>'token') = tok5))::text, '∅')
    || ' libre=' || coalesce(((select (reserved_until is null)::text from public.bill_items where id = l2))::text, '∅')
    || ' saldo=' || coalesce(((select balance from public.bill_totals(b5)))::text, '∅');
  r := public.fail_payment('mock_' || pX);
  msg := msg || ' repetido=' || coalesce(((r->>'already'))::text, '∅');
  r := public.client_create_payment(tok5, B, 'items', array[l2], 'card', 'percent', 0, 'mock', null);
  msg := msg || ' B_puede=' || coalesce(((r->>'ok'))::text, '∅') || '; ';

  -- Cuenta cerrada sin cobrar el saldo
  b6 := public.panel_open_bill(t6);
  perform public.panel_add_items(b6, casado, 1);
  perform public.panel_close_bill(b6);
  s := public.client_state(tok6, A);
  msg := msg || 'Q1.vista=' || coalesce(((s->>'view'))::text, '∅') || '/' || coalesce(((s->'bill'->>'outcome'))::text, '∅') || '; ';

  -- Paso 10: "Reiniciar demo" deja todo como al principio
  perform public.reset_demo();
  msg := msg || 'P10.pagos=' || coalesce(((select count(*) from public.payments))::text, '∅')
    || ' pendientes=' || coalesce(((select count(*) from public.payments where status = 'pending'))::text, '∅')
    || ' reservas=' || coalesce(((select count(*) from public.bill_items where reserved_until is not null))::text, '∅')
    || ' cuentas=' || coalesce(((select count(*) from public.bills))::text, '∅')
    || ' facturas=' || coalesce(((select count(*) from public.invoice_requests))::text, '∅') || '; ';

  raise exception 'RESULTADO %', msg;
exception when others then
  if sqlerrm like 'RESULTADO %' then raise; end if;
  raise exception 'RESULTADO % | ERROR_NO_CAPTURADO=% (%)', msg, sqlerrm, sqlstate;
end $$;
-- Esperado (corrido contra Supabase el 2026-10-09):
-- P1.lineas=4 total=24231; P2.aplicado=9840 saldo=14391 pagos_en_panel=1; P3.l1=paid i1=paid motivo=paid;
-- P4.parte=2541 saldo=11850; P5.aplicado=5000 saldo=6850; P6.cuota=3425 montoC=3425 montoD=3425
-- P7.saldo=0 estado=paid pagada_completa=true lineas_pendientes=0 vista=finished/paid liberada=finished/paid;
-- P8.primero=true segundo=false/reserved pagos_de_B=0;
-- P9.repetido_already=true pagado_igual=true rechazo_sobre_pagado=true/paid estado_sigue=paid desconocido=payment_not_found
-- R1.estado=failed ya=false token_ok=true libre=true saldo=13530 repetido=true B_puede=true;
-- Q1.vista=finished/closed; P10.pagos=0 pendientes=0 reservas=0 cuentas=1 facturas=0;
