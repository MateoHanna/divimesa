-- Fase 4: rechazo de pagos, comprobante, interruptor "Simular rechazo" y desenlace de la cuenta terminada.

alter table public.restaurants add column show_decline_demo boolean not null default false;

-- Lo llama el webhook cuando el proveedor rechaza el pago. Idempotente: si ya estaba pagado no lo toca
-- y si ya estaba fallido devuelve lo mismo. Suelta las reservas de ese pago.
create or replace function public.fail_payment(p_provider_ref text)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_id uuid; v_bill uuid; p public.payments; v_token text;
begin
  select id, bill_id into v_id, v_bill from public.payments where provider_ref = p_provider_ref;
  if v_id is null then raise exception 'payment_not_found'; end if;
  perform 1 from public.bills where id = v_bill for update;
  select * into p from public.payments where id = v_id for update;
  select t.qr_token into v_token from public.bills bl join public.tables t on t.id = bl.table_id where bl.id = v_bill;
  if p.status = 'pending' then
    update public.payments set status = 'failed' where id = p.id;
    update public.bill_items set reserved_by_session = null, reserved_until = null
      where reserved_by_session is not distinct from p.session_id and p.session_id is not null
        and id in (select bill_item_id from public.payment_items where payment_id = p.id);
    return jsonb_build_object('already', false, 'status', 'failed', 'payment_id', p.id, 'token', v_token);
  end if;
  return jsonb_build_object('already', true, 'status', p.status, 'payment_id', p.id, 'token', v_token);
end $$;

-- Datos del checkout y del comprobante. El id del pago (uuid) es la llave: no se listan pagos.
create or replace function public.payment_receipt(p_payment_id uuid)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare p public.payments; r record; v_inv record;
begin
  select * into p from public.payments where id = p_payment_id and source = 'qr';
  if not found then raise exception 'payment_not_found'; end if;
  select t.qr_token, t.number, rs.name, rs.primary_color, rs.show_decline_demo into r
    from public.bills bl join public.tables t on t.id = bl.table_id join public.restaurants rs on rs.id = t.restaurant_id
    where bl.id = p.bill_id;
  select email, name into v_inv from public.invoice_requests where payment_id = p.id;
  return jsonb_build_object(
    'id', p.id, 'status', p.status, 'amount', p.amount, 'tip', p.tip_amount, 'method', p.method,
    'kind', p.kind, 'paid_at', p.paid_at, 'expires_at', p.expires_at,
    'token', r.qr_token, 'table_number', r.number, 'restaurant', r.name, 'primary_color', r.primary_color,
    'show_decline_demo', r.show_decline_demo,
    'invoice_email', v_inv.email, 'invoice_name', v_inv.name);
end $$;

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
      'bill', jsonb_build_object('id', b.id, 'status', b.status,
        'outcome', case when b.paid_at is not null then 'paid' else 'closed' end));
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
revoke execute on function public.fail_payment(text) from public, anon, authenticated;
grant execute on function public.fail_payment(text) to service_role;
revoke execute on function public.payment_receipt(uuid) from public, anon, authenticated;
grant execute on function public.payment_receipt(uuid) to service_role;
