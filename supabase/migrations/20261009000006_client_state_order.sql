-- Fase 3 / 0006: client_state prefiere la cuenta viva sobre las cerradas (desempate cuando opened_at coincide).
create or replace function public.client_state(p_token text, p_session text)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  t record; r record; b record; tot record; o record;
  v_lines jsonb; v_split jsonb := null; v_outside int; v_all int; v_items_base int; v_remaining int; v_due int;
begin
  select tb.id, tb.number, tb.restaurant_id into t from public.tables tb where tb.qr_token = p_token;
  if not found then raise exception 'table_not_found'; end if;
  select * into r from public.restaurants where id = t.restaurant_id;

  -- La cuenta viva (abierta o pagada) manda sobre las cerradas; así una cuenta nueva abierta en la misma
  -- transacción que una cerrada (mismo opened_at) tampoco se confunde.
  select * into b from public.bills where table_id = t.id
    order by (status in ('open', 'paid')) desc, opened_at desc limit 1;
  if not found then
    return jsonb_build_object('view', 'no_bill', 'table_number', t.number, 'server_time', now(),
      'restaurant', jsonb_build_object('name', r.name, 'primary_color', r.primary_color), 'bill', null);
  end if;
  if b.status <> 'open' then
    return jsonb_build_object('view', 'finished', 'table_number', t.number, 'server_time', now(),
      'restaurant', jsonb_build_object('name', r.name, 'primary_color', r.primary_color),
      'bill', jsonb_build_object('id', b.id, 'status', b.status));
  end if;

  select * into tot from public.bill_totals(b.id);
  select * into o from public.client_others(b.id, p_session);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', i.name, 'amount', i.unit_price * i.quantity, 'status', i.status,
      'reserved', case when i.status = 'pending' and i.reserved_until > now()
                       then case when i.reserved_by_session = p_session then 'me' else 'other' end else 'none' end,
      'reserved_until', case when i.status = 'pending' and i.reserved_until > now() and i.reserved_by_session = p_session
                             then i.reserved_until end,
      'split_group_id', i.split_group_id) order by i.created_at, i.id), '[]'::jsonb)
    into v_lines
    from public.bill_items i where i.bill_id = b.id and i.status <> 'void';

  select coalesce(sum(amount - overpaid_amount), 0)::int into v_outside
    from public.payments where bill_id = b.id and status = 'paid' and kind = 'amount';

  v_all := greatest(tot.balance - o.items_amt - o.other_amt, 0);
  v_items_base := greatest(tot.balance - o.other_amt, 0);

  if b.split_mode = 'equal' then
    v_remaining := greatest(b.split_parts - b.split_paid_parts - o.eq_count, 0);
    v_due := case when v_remaining = 0 then 0
                  when v_remaining = 1 then v_all
                  else least(v_all, b.split_share_amount) end;
    v_split := jsonb_build_object('parts', b.split_parts, 'share', b.split_share_amount,
      'paid_parts', b.split_paid_parts, 'remaining', v_remaining, 'due', v_due);
  end if;

  return jsonb_build_object(
    'view', 'open', 'table_number', t.number, 'server_time', now(),
    'restaurant', jsonb_build_object('name', r.name, 'primary_color', r.primary_color,
      'service_rate', r.service_rate, 'vat_rate', r.vat_rate, 'prices_include_taxes', r.prices_include_taxes),
    'bill', jsonb_build_object(
      'id', b.id, 'status', 'open', 'lines', v_lines,
      'totals', jsonb_build_object('items_sum', tot.items_sum, 'subtotal', tot.subtotal, 'service', tot.service,
                                   'vat', tot.vat, 'total', tot.total, 'paid', tot.paid, 'balance', tot.balance),
      'split', v_split,
      'amounts', jsonb_build_object('all', v_all, 'items_base', v_items_base),
      'others_paying', (o.items_amt + o.other_amt) > 0,
      'paid_outside', v_outside));
end $$;

revoke execute on function public.client_state(text, text) from public, anon, authenticated;
grant execute on function public.client_state(text, text) to service_role;
