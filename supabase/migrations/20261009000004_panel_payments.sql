-- Fase 2: operaciones del panel del salonero y confirmación de pagos (adelanto de confirm_payment).
-- Todas las funciones se llaman solo desde las API routes con la llave de servicio. No borran datos.
-- Los errores se devuelven como código en el mensaje de la excepción (p. ej. 'amount_exceeds_balance').

-- Monto a cobrar por un conjunto de platos: parte proporcional del saldo (mitad hacia arriba).
-- Misma fórmula que amountForItems en lib/money.ts; ambos se prueban con tests/fixtures/items-amount.json.
create or replace function public.calc_items_amount(p_selected_sum int, p_pending_sum int, p_selects_all boolean, p_balance int)
returns int language sql immutable set search_path = ''
as $$
  select case
    when p_balance <= 0 or p_selected_sum <= 0 or p_pending_sum <= 0 then 0
    when p_selects_all then p_balance
    else least(p_balance, ((2::bigint * p_balance * p_selected_sum + p_pending_sum) / (2::bigint * p_pending_sum))::int)
  end;
$$;

-- Si el saldo llegó a 0 con algo pagado: marca los platos pendientes como pagados y la cuenta como pagada.
-- Si lo pagado supera el total (por anular o bajar un precio) lanza total_below_paid y la operación se deshace.
create or replace function public.finish_if_paid(p_bill_id uuid)
returns boolean language plpgsql set search_path = ''
as $$
declare t record;
begin
  select * into t from public.bill_totals(p_bill_id);
  if t.paid > t.total then raise exception 'total_below_paid'; end if;
  if t.paid > 0 and t.balance = 0 then
    update public.bill_items set status = 'paid', reserved_by_session = null, reserved_until = null
      where bill_id = p_bill_id and status = 'pending';
    update public.bills set status = 'paid', paid_at = now() where id = p_bill_id and status = 'open';
    return true;
  end if;
  return false;
end $$;

-- Aplica un pago pendiente. Idempotente: si ya estaba pagado devuelve already=true sin tocar nada.
-- Orden de bloqueo: primero la cuenta, después el pago.
create or replace function public.settle_payment(p_payment_id uuid)
returns jsonb language plpgsql set search_path = ''
as $$
declare p record; b record; v_balance int; v_applied int; v_over int; v_done boolean := false;
begin
  select bill_id into p from public.payments where id = p_payment_id;
  if not found then raise exception 'payment_not_found'; end if;
  select * into b from public.bills where id = p.bill_id for update;
  select * into p from public.payments where id = p_payment_id for update;
  if p.status = 'paid' then
    return jsonb_build_object('already', true, 'payment_id', p.id, 'bill_id', p.bill_id,
                              'applied', p.amount - p.overpaid_amount, 'overpaid', p.overpaid_amount);
  end if;
  if b.status = 'open' then
    select balance into v_balance from public.bill_totals(b.id);
  else
    v_balance := 0;
  end if;
  v_applied := least(p.amount, v_balance);
  v_over := p.amount - v_applied;

  update public.payments set status = 'paid', paid_at = now(), overpaid_amount = v_over where id = p.id;
  if v_applied > 0 then
    update public.bills set paid_amount = paid_amount + v_applied where id = b.id;
    if p.kind = 'items' then
      update public.bill_items i set status = 'paid', paid_by_payment_id = p.id,
             reserved_by_session = null, reserved_until = null
        where i.status = 'pending' and i.id in (select bill_item_id from public.payment_items where payment_id = p.id);
    elsif p.kind = 'equal_share' then
      update public.bills set split_paid_parts = split_paid_parts + 1 where id = b.id;
    end if;
    v_done := public.finish_if_paid(b.id);
  end if;
  return jsonb_build_object('already', false, 'payment_id', p.id, 'bill_id', b.id, 'amount', p.amount,
                            'applied', v_applied, 'overpaid', v_over, 'paid_in_full', v_done);
end $$;

-- Lo llama el webhook del proveedor con su referencia.
create or replace function public.confirm_payment(p_provider_ref text)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.payments where provider_ref = p_provider_ref;
  if v_id is null then raise exception 'payment_not_found'; end if;
  return public.settle_payment(v_id);
end $$;

-- Pago registrado por el salonero (datáfono o efectivo), por monto o por platos.
create or replace function public.record_panel_payment(
  p_bill_id uuid, p_method text, p_kind text, p_amount int, p_item_ids uuid[])
returns jsonb language plpgsql set search_path = ''
as $$
declare
  b record; v_balance int; v_amount int; v_payment uuid; v_found int; v_sel int; v_pend int; v_pend_n int; r jsonb;
begin
  if p_method not in ('terminal', 'cash') then raise exception 'invalid_method'; end if;
  if p_kind not in ('amount', 'items') then raise exception 'invalid_kind'; end if;
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  select balance into v_balance from public.bill_totals(b.id);
  if v_balance <= 0 then raise exception 'nothing_to_pay'; end if;

  if p_kind = 'amount' then
    if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
    if p_amount > v_balance then raise exception 'amount_exceeds_balance'; end if;
    v_amount := p_amount;
  else
    if b.split_mode is not null then raise exception 'split_active'; end if;
    if p_item_ids is null or coalesce(array_length(p_item_ids, 1), 0) = 0 then raise exception 'no_items_selected'; end if;
    if (select count(distinct x) from unnest(p_item_ids) x) <> array_length(p_item_ids, 1) then
      raise exception 'duplicate_items';
    end if;
    perform 1 from public.bill_items where bill_id = b.id and id = any(p_item_ids) for update;
    select count(*) into v_found from public.bill_items where bill_id = b.id and id = any(p_item_ids);
    if v_found <> array_length(p_item_ids, 1) then raise exception 'item_not_found'; end if;
    if exists (select 1 from public.bill_items where id = any(p_item_ids) and status <> 'pending') then
      raise exception 'item_not_pending';
    end if;
    if exists (select 1 from public.bill_items where id = any(p_item_ids) and reserved_until > now()) then
      raise exception 'item_reserved';
    end if;
    select coalesce(sum(unit_price * quantity), 0), count(*) into v_pend, v_pend_n
      from public.bill_items where bill_id = b.id and status = 'pending';
    select coalesce(sum(unit_price * quantity), 0) into v_sel from public.bill_items where id = any(p_item_ids);
    v_amount := public.calc_items_amount(v_sel, v_pend, v_found = v_pend_n, v_balance);
    if v_amount <= 0 then raise exception 'nothing_to_pay'; end if;
  end if;

  insert into public.payments (bill_id, amount, method, source, kind, status)
  values (b.id, v_amount, p_method, 'panel', p_kind, 'pending') returning id into v_payment;
  if p_kind = 'items' then
    insert into public.payment_items (payment_id, bill_item_id) select v_payment, unnest(p_item_ids);
  end if;
  r := public.settle_payment(v_payment);
  return r;
end $$;

create or replace function public.panel_open_bill(p_table_id uuid)
returns uuid language plpgsql set search_path = ''
as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.tables where id = p_table_id) then raise exception 'table_not_found'; end if;
  begin
    insert into public.bills (table_id) values (p_table_id) returning id into v_id;
  exception when unique_violation then
    raise exception 'table_has_bill';
  end;
  return v_id;
end $$;

-- Agrega N líneas separadas (una por unidad) con el precio actual del menú.
create or replace function public.panel_add_items(p_bill_id uuid, p_menu_item_id uuid, p_quantity int)
returns int language plpgsql set search_path = ''
as $$
declare b record; m record; i int;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception 'invalid_quantity'; end if;
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if b.split_mode is not null then raise exception 'split_active'; end if;
  select m2.* into m from public.menu_items m2
    join public.tables t on t.restaurant_id = m2.restaurant_id
    where m2.id = p_menu_item_id and m2.active and t.id = b.table_id;
  if not found then raise exception 'menu_item_not_found'; end if;
  for i in 1..p_quantity loop
    insert into public.bill_items (bill_id, menu_item_id, name, unit_price, quantity)
    values (b.id, m.id, m.name, m.price, 1);
  end loop;
  return p_quantity;
end $$;

-- Bloquea la cuenta de una línea y valida que se pueda tocar (pendiente, sin reserva, cuenta abierta sin partes iguales).
create or replace function public.lock_editable_item(p_item_id uuid)
returns uuid language plpgsql set search_path = ''
as $$
declare v_bill uuid; i record; b record;
begin
  select bill_id into v_bill from public.bill_items where id = p_item_id;
  if not found then raise exception 'item_not_found'; end if;
  select * into b from public.bills where id = v_bill for update;
  select * into i from public.bill_items where id = p_item_id for update;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if b.split_mode is not null then raise exception 'split_active'; end if;
  if i.status <> 'pending' then raise exception 'item_not_pending'; end if;
  if i.reserved_until > now() then raise exception 'item_reserved'; end if;
  return v_bill;
end $$;

create or replace function public.panel_void_item(p_item_id uuid)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_bill uuid; v_done boolean;
begin
  v_bill := public.lock_editable_item(p_item_id);
  update public.bill_items set status = 'void' where id = p_item_id;
  v_done := public.finish_if_paid(v_bill);
  return jsonb_build_object('bill_id', v_bill, 'paid_in_full', v_done);
end $$;

create or replace function public.panel_set_price(p_item_id uuid, p_price int)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_bill uuid; v_done boolean;
begin
  if p_price is null or p_price <= 0 or p_price > 10000000 then raise exception 'invalid_amount'; end if;
  v_bill := public.lock_editable_item(p_item_id);
  update public.bill_items set unit_price = p_price where id = p_item_id;
  v_done := public.finish_if_paid(v_bill);
  return jsonb_build_object('bill_id', v_bill, 'paid_in_full', v_done);
end $$;

-- Cancela el modo de partes iguales. Lo ya pagado se queda pagado.
create or replace function public.panel_cancel_split(p_bill_id uuid)
returns void language plpgsql set search_path = ''
as $$
declare b record;
begin
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if b.split_mode is null then raise exception 'no_split'; end if;
  update public.bills set split_mode = null, split_parts = null, split_base_amount = null,
         split_share_amount = null, split_paid_parts = 0, split_started_at = null where id = b.id;
  update public.payments set status = 'failed' where bill_id = b.id and status = 'pending' and kind = 'equal_share';
end $$;

-- Cierra una cuenta abierta con saldo pendiente (el cliente se fue, se anuló, etc.).
create or replace function public.panel_close_bill(p_bill_id uuid)
returns void language plpgsql set search_path = ''
as $$
declare b record;
begin
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  update public.payments set status = 'failed' where bill_id = b.id and status = 'pending';
  update public.bill_items set reserved_by_session = null, reserved_until = null
    where bill_id = b.id and reserved_until is not null;
  update public.bills set status = 'closed', closed_at = now() where id = b.id;
end $$;

-- Libera la mesa: solo cuando la cuenta ya está pagada.
create or replace function public.panel_release_table(p_bill_id uuid)
returns void language plpgsql set search_path = ''
as $$
declare b record;
begin
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'paid' then raise exception 'bill_not_paid'; end if;
  update public.bills set status = 'closed', closed_at = now() where id = b.id;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'calc_items_amount(int,int,boolean,int)', 'finish_if_paid(uuid)', 'settle_payment(uuid)', 'confirm_payment(text)',
    'record_panel_payment(uuid,text,text,int,uuid[])', 'panel_open_bill(uuid)', 'panel_add_items(uuid,uuid,int)',
    'lock_editable_item(uuid)', 'panel_void_item(uuid)', 'panel_set_price(uuid,int)', 'panel_cancel_split(uuid)',
    'panel_close_bill(uuid)', 'panel_release_table(uuid)'])
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
