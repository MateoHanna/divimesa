-- Fase 3: página del cliente (/m/[token]). Toda la lógica de dinero vive aquí, no en el navegador.
-- Los errores salen como código en el mensaje de la excepción. Los casos esperados de carrera
-- (platos ya pagados o apartados por otra persona) se devuelven como ok=false, sin excepción.
-- Esta migración no borra datos.

-- Valida el id de sesión (aleatorio, viene del localStorage del cliente).
create or replace function public.client_check_session(p_session text) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'invalid_session'; end if;
end $$;

-- Pagos pendientes vigentes de OTRAS sesiones (apartan saldo hasta que vencen, 3 minutos).
create or replace function public.client_others(p_bill_id uuid, p_session text)
returns table (items_amt int, other_amt int, eq_count int)
language sql stable set search_path = ''
as $$
  select coalesce(sum(amount) filter (where kind = 'items'), 0)::int,
         coalesce(sum(amount) filter (where kind <> 'items'), 0)::int,
         (count(*) filter (where kind = 'equal_share'))::int
  from public.payments
  where bill_id = p_bill_id and status = 'pending' and expires_at > now()
    and session_id is distinct from p_session;
$$;

-- Cancela los pagos pendientes de esta sesión y suelta sus reservas. Sus propias reservas nunca la bloquean.
create or replace function public.client_drop_mine(p_bill_id uuid, p_session text) returns void
language plpgsql set search_path = ''
as $$
begin
  update public.payments set status = 'failed'
    where bill_id = p_bill_id and session_id = p_session and status = 'pending';
  update public.bill_items set reserved_by_session = null, reserved_until = null
    where bill_id = p_bill_id and reserved_by_session = p_session;
end $$;

-- Bloquea y devuelve la cuenta abierta de la mesa del token.
create or replace function public.client_lock_open_bill(p_token text) returns public.bills
language plpgsql set search_path = ''
as $$
declare b public.bills;
begin
  select bl.* into b from public.bills bl join public.tables t on t.id = bl.table_id
    where t.qr_token = p_token and bl.status = 'open' for update of bl;
  if not found then
    if not exists (select 1 from public.tables where qr_token = p_token) then raise exception 'table_not_found'; end if;
    raise exception 'bill_not_open';
  end if;
  return b;
end $$;

-- Por qué no se puede usar cada plato pedido: paid (ya pagado), reserved (apartado por otra persona), gone.
create or replace function public.client_item_problems(p_bill_id uuid, p_ids uuid[], p_session text) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'reason', x.reason)), '[]'::jsonb)
  from (
    select ids.id,
           case when i.id is null or i.status = 'void' then 'gone'
                when i.status = 'paid' then 'paid'
                when i.reserved_until > now() and i.reserved_by_session is distinct from p_session then 'reserved'
           end as reason
    from unnest(p_ids) as ids(id)
    left join public.bill_items i on i.id = ids.id and i.bill_id = p_bill_id
  ) x
  where x.reason is not null;
$$;

-- Estado público de la mesa para la página del cliente. No expone tokens, facturas ni sesiones ajenas.
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

  select * into b from public.bills where table_id = t.id order by opened_at desc limit 1;
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

-- Aparta (3 minutos) los platos elegidos para esta sesión. Reemplaza lo que tenía apartado antes
-- y cancela su pago pendiente anterior. Con lista vacía solo libera.
create or replace function public.client_reserve_items(p_token text, p_session text, p_item_ids uuid[])
returns jsonb language plpgsql set search_path = ''
as $$
declare b public.bills; v_ids uuid[]; v_until timestamptz := now() + interval '3 minutes'; v_reserved uuid[];
begin
  perform public.client_check_session(p_session);
  b := public.client_lock_open_bill(p_token);
  v_ids := coalesce(array(select distinct x from unnest(p_item_ids) x), '{}');
  if array_length(v_ids, 1) > 100 then raise exception 'invalid_quantity'; end if;
  if b.split_mode is not null and array_length(v_ids, 1) > 0 then raise exception 'split_active'; end if;

  perform public.client_drop_mine(b.id, p_session);
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('reserved', '[]'::jsonb, 'conflicts', '[]'::jsonb, 'reserved_until', null);
  end if;

  with up as (
    update public.bill_items set reserved_by_session = p_session, reserved_until = v_until
    where bill_id = b.id and id = any(v_ids) and status = 'pending'
      and (reserved_until is null or reserved_until <= now())
    returning id)
  select coalesce(array_agg(id), '{}') into v_reserved from up;

  return jsonb_build_object('reserved', to_jsonb(v_reserved),
    'conflicts', public.client_item_problems(b.id, v_ids, p_session), 'reserved_until', v_until);
end $$;

-- Divide un plato pendiente entre N personas. La última parte absorbe el redondeo.
-- El plato original queda anulado (con el mismo grupo, índice 0) para poder deshacerlo desde el panel.
create or replace function public.client_split_item(p_token text, p_session text, p_item_id uuid, p_parts int)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  b public.bills; i public.bill_items; v_amount int; v_share int; v_group uuid := gen_random_uuid();
  k int; v_ids uuid[] := '{}'; v_id uuid;
begin
  perform public.client_check_session(p_session);
  b := public.client_lock_open_bill(p_token);
  if b.split_mode is not null then raise exception 'split_active'; end if;
  select * into i from public.bill_items where id = p_item_id and bill_id = b.id for update;
  if not found or i.status = 'void' then raise exception 'item_not_found'; end if;
  if i.status <> 'pending' then raise exception 'item_not_pending'; end if;
  if i.reserved_until > now() and i.reserved_by_session is distinct from p_session then raise exception 'item_reserved'; end if;
  if i.split_group_id is not null then raise exception 'already_split'; end if;
  v_amount := i.unit_price * i.quantity;
  if p_parts is null or p_parts < 2 or p_parts > 12 or v_amount < p_parts then raise exception 'invalid_parts'; end if;

  perform public.client_drop_mine(b.id, p_session);
  update public.bill_items set status = 'void', split_group_id = v_group, split_index = 0, split_count = p_parts,
         reserved_by_session = null, reserved_until = null where id = i.id;
  v_share := v_amount / p_parts;
  for k in 1..p_parts loop
    insert into public.bill_items (bill_id, menu_item_id, name, unit_price, quantity, split_group_id, split_index, split_count, created_at)
    values (b.id, i.menu_item_id, left(i.name, 100) || ' (' || k || ' de ' || p_parts || ')',
            case when k = p_parts then v_amount - v_share * (p_parts - 1) else v_share end,
            1, v_group, k, p_parts, i.created_at + (k * interval '1 microsecond'))
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('group_id', v_group, 'part_ids', to_jsonb(v_ids));
end $$;

-- Fija la división en partes iguales: cuota = saldo de este momento / N (la última absorbe el redondeo).
create or replace function public.client_start_split(p_token text, p_session text, p_parts int)
returns jsonb language plpgsql set search_path = ''
as $$
declare b public.bills; o record; tot record;
begin
  perform public.client_check_session(p_session);
  b := public.client_lock_open_bill(p_token);
  if b.split_mode is not null then raise exception 'split_active'; end if;
  perform public.client_drop_mine(b.id, p_session);
  select * into o from public.client_others(b.id, p_session);
  if o.items_amt + o.other_amt > 0 then raise exception 'payments_in_progress'; end if;
  select * into tot from public.bill_totals(b.id);
  if tot.balance <= 0 then raise exception 'nothing_to_pay'; end if;
  if p_parts is null or p_parts < 2 or p_parts > 20 or p_parts > tot.balance then raise exception 'invalid_parts'; end if;

  update public.bill_items set reserved_by_session = null, reserved_until = null where bill_id = b.id and reserved_until is not null;
  update public.bills set split_mode = 'equal', split_parts = p_parts, split_base_amount = tot.balance,
         split_share_amount = tot.balance / p_parts, split_paid_parts = 0, split_started_at = now() where id = b.id;
  return jsonb_build_object('parts', p_parts, 'share', tot.balance / p_parts);
end $$;

-- Crea un pago pendiente del cliente. El monto lo calcula este código, nunca el navegador.
create or replace function public.client_create_payment(
  p_token text, p_session text, p_mode text, p_item_ids uuid[], p_method text,
  p_tip_type text, p_tip_value int, p_provider text, p_invoice jsonb)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  b public.bills; o record; tot record; v_ids uuid[]; v_problems jsonb;
  v_amount int; v_kind text; v_idx int; v_tip int := 0; v_payment uuid; v_expires timestamptz := now() + interval '3 minutes';
  v_remaining int; v_avail int; v_sel int; v_pend int; v_sel_n int; v_pend_n int;
begin
  perform public.client_check_session(p_session);
  if p_method not in ('card', 'apple_pay', 'google_pay', 'sinpe') then raise exception 'invalid_method'; end if;
  if p_mode not in ('all', 'items', 'equal') then raise exception 'invalid_kind'; end if;
  if p_tip_type = 'percent' then
    if p_tip_value is null or p_tip_value < 0 or p_tip_value > 100 then raise exception 'invalid_tip'; end if;
  elsif p_tip_type = 'amount' then
    if p_tip_value is null or p_tip_value < 0 or p_tip_value > 1000000 then raise exception 'invalid_tip'; end if;
  else
    raise exception 'invalid_tip';
  end if;

  b := public.client_lock_open_bill(p_token);
  select * into tot from public.bill_totals(b.id);
  select * into o from public.client_others(b.id, p_session);
  if tot.balance <= 0 then raise exception 'nothing_to_pay'; end if;

  if p_mode = 'all' then
    v_amount := greatest(tot.balance - o.items_amt - o.other_amt, 0);
    if v_amount = 0 then raise exception 'others_paying'; end if;
    v_kind := case when v_amount = tot.balance then 'full' else 'amount' end;

  elsif p_mode = 'equal' then
    if b.split_mode is null then raise exception 'no_split'; end if;
    v_remaining := b.split_parts - b.split_paid_parts - o.eq_count;
    if v_remaining <= 0 then raise exception 'no_parts_left'; end if;
    v_avail := greatest(tot.balance - o.items_amt - o.other_amt, 0);
    if v_avail = 0 then raise exception 'others_paying'; end if;
    v_amount := case when v_remaining = 1 then v_avail else least(v_avail, b.split_share_amount) end;
    v_kind := 'equal_share';
    v_idx := b.split_paid_parts + o.eq_count + 1;

  else
    if b.split_mode is not null then raise exception 'split_active'; end if;
    v_ids := coalesce(array(select distinct x from unnest(p_item_ids) x), '{}');
    if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'no_items_selected'; end if;
    if array_length(v_ids, 1) > 100 then raise exception 'invalid_quantity'; end if;
    perform 1 from public.bill_items where bill_id = b.id and id = any(v_ids) for update;
    v_problems := public.client_item_problems(b.id, v_ids, p_session);
    if jsonb_array_length(v_problems) > 0 then
      return jsonb_build_object('ok', false, 'code', 'items_unavailable', 'unavailable', v_problems);
    end if;
    select coalesce(sum(unit_price * quantity), 0), count(*) into v_sel, v_sel_n
      from public.bill_items where bill_id = b.id and id = any(v_ids);
    select coalesce(sum(unit_price * quantity), 0), count(*) into v_pend, v_pend_n
      from public.bill_items where bill_id = b.id and status = 'pending';
    v_avail := greatest(tot.balance - o.other_amt, 0);
    v_amount := public.calc_items_amount(v_sel, v_pend, v_sel_n = v_pend_n, v_avail);
    if v_amount <= 0 then raise exception 'others_paying'; end if;
    v_kind := 'items';
  end if;

  -- Si esta misma sesión ya tenía un pago pendiente, se cancela y se sueltan sus reservas.
  perform public.client_drop_mine(b.id, p_session);

  if p_tip_type = 'percent' then
    v_tip := ((2::bigint * v_amount * p_tip_value + 100) / 200)::int;
  else
    v_tip := p_tip_value;
  end if;

  insert into public.payments (bill_id, amount, tip_amount, method, source, kind, split_part_index, provider, status, session_id, expires_at)
  values (b.id, v_amount, v_tip, p_method, 'qr', v_kind, v_idx, p_provider, 'pending', p_session, v_expires)
  returning id into v_payment;

  if v_kind = 'items' then
    insert into public.payment_items (payment_id, bill_item_id) select v_payment, unnest(v_ids);
    update public.bill_items set reserved_by_session = p_session, reserved_until = v_expires
      where bill_id = b.id and id = any(v_ids);
  end if;

  if p_invoice is not null and (
       coalesce(p_invoice->>'name', '') <> '' or coalesce(p_invoice->>'id_number', '') <> '' or coalesce(p_invoice->>'email', '') <> '') then
    insert into public.invoice_requests (payment_id, name, id_type, id_number, email)
    values (v_payment, nullif(left(p_invoice->>'name', 120), ''), nullif(p_invoice->>'id_type', ''),
            nullif(left(p_invoice->>'id_number', 20), ''), nullif(left(p_invoice->>'email', 120), ''));
  end if;

  return jsonb_build_object('ok', true, 'payment_id', v_payment, 'amount', v_amount, 'tip', v_tip,
                            'kind', v_kind, 'expires_at', v_expires, 'bill_id', b.id);
end $$;

-- Cancela un pago pendiente propio ("Volver" del checkout) y suelta lo apartado.
create or replace function public.client_cancel_payment(p_payment_id uuid, p_session text)
returns jsonb language plpgsql set search_path = ''
as $$
declare p public.payments; v_bill uuid; v_token text;
begin
  perform public.client_check_session(p_session);
  select bill_id into v_bill from public.payments where id = p_payment_id;
  if not found then raise exception 'payment_not_found'; end if;
  perform 1 from public.bills where id = v_bill for update;
  select * into p from public.payments where id = p_payment_id for update;
  if p.session_id is distinct from p_session then raise exception 'payment_not_found'; end if;
  select t.qr_token into v_token from public.bills bl join public.tables t on t.id = bl.table_id where bl.id = v_bill;
  if p.status = 'pending' then
    update public.payments set status = 'failed' where id = p.id;
    update public.bill_items set reserved_by_session = null, reserved_until = null
      where reserved_by_session = p_session and id in (select bill_item_id from public.payment_items where payment_id = p.id);
    return jsonb_build_object('ok', true, 'status', 'failed', 'token', v_token);
  end if;
  return jsonb_build_object('ok', true, 'status', p.status, 'token', v_token);
end $$;

-- El salonero deshace la división de un plato mientras ninguna parte esté pagada ni apartada.
create or replace function public.panel_unsplit_item(p_item_id uuid)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_bill uuid; b public.bills; i public.bill_items; o public.bill_items; v_sum int;
begin
  select * into i from public.bill_items where id = p_item_id;
  if not found then raise exception 'item_not_found'; end if;
  if i.split_group_id is null then raise exception 'not_split'; end if;
  v_bill := i.bill_id;
  select * into b from public.bills where id = v_bill for update;
  perform 1 from public.bill_items where split_group_id = i.split_group_id for update;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if b.split_mode is not null then raise exception 'split_active'; end if;
  select * into o from public.bill_items where split_group_id = i.split_group_id and split_index = 0;
  if not found then raise exception 'not_split'; end if;
  if exists (select 1 from public.bill_items where split_group_id = i.split_group_id and split_index > 0 and status = 'paid') then
    raise exception 'split_group_paid';
  end if;
  if exists (select 1 from public.bill_items where split_group_id = i.split_group_id and split_index > 0 and reserved_until > now()) then
    raise exception 'item_reserved';
  end if;
  select coalesce(sum(unit_price * quantity), 0) into v_sum
    from public.bill_items where split_group_id = i.split_group_id and split_index > 0 and status = 'pending';
  if v_sum <> o.unit_price * o.quantity
     or (select count(*) from public.bill_items where split_group_id = i.split_group_id and split_index > 0 and status = 'pending') <> o.split_count then
    raise exception 'split_group_modified';
  end if;
  update public.bill_items set status = 'void', reserved_by_session = null, reserved_until = null
    where split_group_id = i.split_group_id and split_index > 0;
  update public.bill_items set status = 'pending', split_group_id = null, split_index = null, split_count = null
    where id = o.id;
  return jsonb_build_object('bill_id', v_bill, 'item_id', o.id);
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'client_check_session(text)', 'client_others(uuid,text)', 'client_drop_mine(uuid,text)', 'client_lock_open_bill(text)',
    'client_item_problems(uuid,uuid[],text)', 'client_state(text,text)', 'client_reserve_items(text,text,uuid[])',
    'client_split_item(text,text,uuid,int)', 'client_start_split(text,text,int)',
    'client_create_payment(text,text,text,uuid[],text,text,int,text,jsonb)', 'client_cancel_payment(uuid,text)',
    'panel_unsplit_item(uuid)'])
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
