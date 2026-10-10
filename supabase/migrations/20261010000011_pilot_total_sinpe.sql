-- Parte C / 0011: modo piloto. Cuentas de "solo el total" y pagos por SINPE Móvil que el salonero confirma.
-- Divimesa nunca recibe dinero: el cliente hace el SINPE directo al restaurante y el salonero marca "Recibido".
--
-- Toca estas tablas (solo agrega columnas, índices y un trigger; no borra ni renombra nada):
--   restaurants: bill_mode, sinpe_number, sinpe_holder (+ una restricción)
--   bills:       fixed_total
--   payments:    reference_code, payer_name, reported_at (+ índice único parcial y un trigger)
-- Funciones nuevas: panel_open_bill_total, panel_set_total, panel_confirm_sinpe, panel_reject_sinpe, client_report_sinpe,
--   demo_confirm_sinpe (solo actúa sobre mesas del restaurante de demostración).
-- Funciones que cambian (misma firma, salvo client_create_payment que gana un parámetro opcional al final):
--   bill_totals, client_state, client_drop_mine, client_start_split, client_create_payment, client_cancel_payment,
--   panel_open_bill, panel_add_items, panel_cancel_split, panel_close_bill, panel_release_table.
-- Con el código que hoy está en producción todo sigue igual: bill_mode nace en 'items', fixed_total nace nulo
-- y client_state solo agrega campos. Primero se aplica esta migración y después se sube el código.

-- ---------------------------------------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists bill_mode text not null default 'items' check (bill_mode in ('items', 'total')),
  add column if not exists sinpe_number text check (sinpe_number is null or sinpe_number ~ '^[0-9]{8}$'),
  add column if not exists sinpe_holder text check (sinpe_holder is null or length(trim(sinpe_holder)) between 2 and 80);

-- Un restaurante real en "solo el total" tiene que tener su SINPE. La demo usa un número de prueba fijo.
alter table public.restaurants drop constraint if exists restaurants_total_needs_sinpe;
alter table public.restaurants add constraint restaurants_total_needs_sinpe
  check (bill_mode = 'items' or is_demo or (sinpe_number is not null and sinpe_holder is not null));

-- Total digitado por el salonero (colones enteros, ya con servicio e impuestos). Nulo en las cuentas por platos.
alter table public.bills
  add column if not exists fixed_total int check (fixed_total is null or fixed_total between 1 and 100000000);

alter table public.payments
  add column if not exists reference_code text,
  add column if not exists payer_name text check (payer_name is null or length(payer_name) <= 80),
  -- El cliente tocó "Ya hice el SINPE": desde ese momento el salonero lo ve por confirmar.
  add column if not exists reported_at timestamptz;
create unique index if not exists payments_bill_code_idx on public.payments (bill_id, reference_code) where reference_code is not null;

-- ---------------------------------------------------------------------------------------------------------
-- Regla fija: un pago simulado solo puede existir en el restaurante de demostración.
-- Simulado = proveedor 'mock', o pago por QR con tarjeta / Apple Pay / Google Pay (mientras no haya una pasarela real).
-- Si algún día se conecta una pasarela real, esta regla se revisa en esa migración.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.payments_demo_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare v_demo boolean;
begin
  if new.provider = 'mock' or new.provider_ref like 'mock\_%' or (new.source = 'qr' and new.method in ('card', 'apple_pay', 'google_pay')) then
    select r.is_demo into v_demo
      from public.bills b join public.tables t on t.id = b.table_id join public.restaurants r on r.id = t.restaurant_id
     where b.id = new.bill_id;
    if v_demo is distinct from true then raise exception 'simulated_only_demo'; end if;
  end if;
  return new;
end $$;
drop trigger if exists payments_demo_guard on public.payments;
create trigger payments_demo_guard before insert or update on public.payments
  for each row execute function public.payments_demo_guard();

-- ---------------------------------------------------------------------------------------------------------
-- Totales: en una cuenta de solo el total, el total es el digitado (nada se suma).
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.bill_totals(p_bill_id uuid)
returns table (items_sum int, subtotal int, service int, vat int, total int, paid int, balance int)
language sql stable set search_path = ''
as $$
  with b as (
    select bl.paid_amount, bl.fixed_total, r.service_rate, r.vat_rate, r.prices_include_taxes,
           coalesce(bl.fixed_total, (select sum(i.unit_price * i.quantity) from public.bill_items i
                                     where i.bill_id = bl.id and i.status <> 'void'), 0)::int as items_sum
    from public.bills bl
    join public.tables t on t.id = bl.table_id
    join public.restaurants r on r.id = t.restaurant_id
    where bl.id = p_bill_id
  )
  select b.items_sum,
         case when b.fixed_total is not null then b.fixed_total else c.subtotal end,
         case when b.fixed_total is not null then 0 else c.service end,
         case when b.fixed_total is not null then 0 else c.vat end,
         case when b.fixed_total is not null then b.fixed_total else c.total end,
         b.paid_amount,
         greatest(case when b.fixed_total is not null then b.fixed_total else c.total end - b.paid_amount, 0)
  from b cross join lateral public.calc_totals(b.items_sum, b.service_rate, b.vat_rate, b.prices_include_taxes) c;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Panel: abrir con total, corregir el total, confirmar o rechazar un SINPE
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.panel_open_bill(p_table_id uuid)
returns uuid language plpgsql set search_path = ''
as $$
declare v_id uuid; v_mode text;
begin
  select r.bill_mode into v_mode from public.tables t join public.restaurants r on r.id = t.restaurant_id where t.id = p_table_id;
  if not found then raise exception 'table_not_found'; end if;
  if v_mode = 'total' then raise exception 'total_required'; end if;
  begin
    insert into public.bills (table_id) values (p_table_id) returning id into v_id;
  exception when unique_violation then
    raise exception 'table_has_bill';
  end;
  return v_id;
end $$;

create or replace function public.panel_open_bill_total(p_table_id uuid, p_total int)
returns uuid language plpgsql set search_path = ''
as $$
declare v_id uuid; v_mode text;
begin
  if p_total is null or p_total < 1 or p_total > 100000000 then raise exception 'invalid_total'; end if;
  select r.bill_mode into v_mode from public.tables t join public.restaurants r on r.id = t.restaurant_id where t.id = p_table_id;
  if not found then raise exception 'table_not_found'; end if;
  if v_mode <> 'total' then raise exception 'wrong_mode'; end if;
  begin
    insert into public.bills (table_id, fixed_total) values (p_table_id, p_total) returning id into v_id;
  exception when unique_violation then
    raise exception 'table_has_bill';
  end;
  return v_id;
end $$;

-- Las cuentas de solo el total no tienen platos.
create or replace function public.panel_add_items(p_bill_id uuid, p_menu_item_id uuid, p_quantity int)
returns int language plpgsql set search_path = ''
as $$
declare b record; m record; i int;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception 'invalid_quantity'; end if;
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if b.fixed_total is not null then raise exception 'total_bill'; end if;
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

-- Corrige el total mientras no haya un SINPE por confirmar. Los pagos que apenas estaban en la pantalla de
-- instrucciones (sin "Ya hice el SINPE") se cancelan: el cliente vuelve a ver la cuenta con el total nuevo.
create or replace function public.panel_set_total(p_bill_id uuid, p_total int)
returns jsonb language plpgsql set search_path = ''
as $$
declare b record; v_done boolean;
begin
  if p_total is null or p_total < 1 or p_total > 100000000 then raise exception 'invalid_total'; end if;
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if b.fixed_total is null then raise exception 'not_total_bill'; end if;
  if b.split_mode is not null then raise exception 'split_active'; end if;
  if exists (select 1 from public.payments where bill_id = b.id and status = 'pending' and method = 'sinpe' and reported_at is not null) then
    raise exception 'sinpe_pending';
  end if;
  update public.payments set status = 'failed' where bill_id = b.id and status = 'pending';
  update public.bills set fixed_total = p_total where id = b.id;
  v_done := public.finish_if_paid(b.id);
  return jsonb_build_object('bill_id', b.id, 'total', p_total, 'paid_in_full', v_done);
end $$;

-- "Recibido": el salonero vio el SINPE en su banco. Aplica el pago con la misma función de siempre.
create or replace function public.panel_confirm_sinpe(p_payment_id uuid)
returns jsonb language plpgsql set search_path = ''
as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id and method = 'sinpe' and source = 'qr';
  if not found then raise exception 'payment_not_found'; end if;
  if p.status = 'failed' or (p.status = 'pending' and p.reported_at is null) then raise exception 'payment_not_pending'; end if;
  return public.confirm_payment(p.provider_ref);
end $$;

-- "No llegó": el SINPE no apareció. El pago falla y se sueltan el saldo y los platos que apartaba.
create or replace function public.panel_reject_sinpe(p_payment_id uuid)
returns jsonb language plpgsql set search_path = ''
as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id and method = 'sinpe' and source = 'qr';
  if not found then raise exception 'payment_not_found'; end if;
  if p.status = 'paid' then raise exception 'payment_already_paid'; end if;
  if p.status = 'pending' and p.reported_at is null then raise exception 'payment_not_pending'; end if;
  return public.fail_payment(p.provider_ref);
end $$;

-- Demo pública: quien prueba /demo/mesa toca "Recibido" en la columna del salonero. SOLO funciona con mesas del
-- restaurante de demostración; para cualquier otra mesa responde como si no existiera.
create or replace function public.demo_confirm_sinpe(p_token text)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_pay uuid;
begin
  select p.id into v_pay
    from public.tables t
    join public.restaurants r on r.id = t.restaurant_id and r.is_demo
    join public.bills b on b.table_id = t.id and b.status in ('open', 'paid')
    join public.payments p on p.bill_id = b.id and p.status = 'pending' and p.method = 'sinpe' and p.reported_at is not null
   where t.qr_token = p_token
   order by p.reported_at limit 1;
  if v_pay is null then raise exception 'payment_not_found'; end if;
  return public.panel_confirm_sinpe(v_pay);
end $$;

-- Con un SINPE por confirmar no se cancelan las partes iguales, no se cierra la cuenta ni se libera la mesa.
create or replace function public.panel_cancel_split(p_bill_id uuid)
returns void language plpgsql set search_path = ''
as $$
declare b record;
begin
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if b.split_mode is null then raise exception 'no_split'; end if;
  if exists (select 1 from public.payments where bill_id = b.id and status = 'pending' and method = 'sinpe' and reported_at is not null) then
    raise exception 'sinpe_pending';
  end if;
  update public.bills set split_mode = null, split_parts = null, split_base_amount = null,
         split_share_amount = null, split_paid_parts = 0, split_started_at = null where id = b.id;
  update public.payments set status = 'failed' where bill_id = b.id and status = 'pending' and kind = 'equal_share';
end $$;

create or replace function public.panel_close_bill(p_bill_id uuid)
returns void language plpgsql set search_path = ''
as $$
declare b record;
begin
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if exists (select 1 from public.payments where bill_id = b.id and status = 'pending' and method = 'sinpe' and reported_at is not null) then
    raise exception 'sinpe_pending';
  end if;
  update public.payments set status = 'failed' where bill_id = b.id and status = 'pending';
  update public.bill_items set reserved_by_session = null, reserved_until = null
    where bill_id = b.id and reserved_until is not null;
  update public.bills set status = 'closed', closed_at = now() where id = b.id;
end $$;

create or replace function public.panel_release_table(p_bill_id uuid)
returns void language plpgsql set search_path = ''
as $$
declare b record;
begin
  select * into b from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill_not_found'; end if;
  if b.status <> 'paid' then raise exception 'bill_not_paid'; end if;
  if exists (select 1 from public.payments where bill_id = b.id and status = 'pending' and method = 'sinpe' and reported_at is not null) then
    raise exception 'sinpe_pending';
  end if;
  update public.bills set status = 'closed', closed_at = now() where id = b.id;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Cliente
-- ---------------------------------------------------------------------------------------------------------

-- Cancelar los pagos propios pendientes NO toca un SINPE ya reportado (el cliente ya hizo la transferencia).
create or replace function public.client_drop_mine(p_bill_id uuid, p_session text) returns void
language plpgsql set search_path = ''
as $$
begin
  update public.payments set status = 'failed'
    where bill_id = p_bill_id and session_id = p_session and status = 'pending'
      and not (method = 'sinpe' and reported_at is not null);
  update public.bill_items i set reserved_by_session = null, reserved_until = null
    where i.bill_id = p_bill_id and i.reserved_by_session = p_session
      and not exists (select 1 from public.payment_items pi join public.payments p on p.id = pi.payment_id
                       where pi.bill_item_id = i.id and p.status = 'pending' and p.method = 'sinpe' and p.reported_at is not null);
end $$;

create or replace function public.client_start_split(p_token text, p_session text, p_parts int)
returns jsonb language plpgsql set search_path = ''
as $$
declare b public.bills; o record; tot record;
begin
  perform public.client_check_session(p_session);
  b := public.client_lock_open_bill(p_token);
  if b.split_mode is not null then raise exception 'split_active'; end if;
  if exists (select 1 from public.payments where bill_id = b.id and session_id = p_session and status = 'pending'
              and method = 'sinpe' and reported_at is not null) then
    raise exception 'sinpe_pending';
  end if;
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

-- Crea un pago pendiente. Cambios: modo 'amount' (monto libre, solo en cuentas de solo el total), método SINPE
-- (sin pasarela: nace "en instrucciones" por 20 minutos, con código de referencia) y regla de métodos por restaurante.
drop function if exists public.client_create_payment(text, text, text, uuid[], text, text, int, text, jsonb);
create or replace function public.client_create_payment(
  p_token text, p_session text, p_mode text, p_item_ids uuid[], p_method text,
  p_tip_type text, p_tip_value int, p_provider text, p_invoice jsonb, p_amount int default null)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  b public.bills; o record; tot record; v_ids uuid[]; v_problems jsonb; r record; t record;
  v_amount int; v_kind text; v_idx int; v_tip int := 0; v_payment uuid := gen_random_uuid();
  v_sinpe boolean := (p_method = 'sinpe');
  v_expires timestamptz := now() + case when p_method = 'sinpe' then interval '20 minutes' else interval '3 minutes' end;
  v_remaining int; v_avail int; v_sel int; v_pend int; v_sel_n int; v_pend_n int;
  v_code text; v_chars constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; v_tries int := 0;
begin
  perform public.client_check_session(p_session);
  if p_method not in ('card', 'apple_pay', 'google_pay', 'sinpe') then raise exception 'invalid_method'; end if;
  if p_mode not in ('all', 'items', 'equal', 'amount') then raise exception 'invalid_kind'; end if;
  if p_tip_type = 'percent' then
    if p_tip_value is null or p_tip_value < 0 or p_tip_value > 100 then raise exception 'invalid_tip'; end if;
  elsif p_tip_type = 'amount' then
    if p_tip_value is null or p_tip_value < 0 or p_tip_value > 1000000 then raise exception 'invalid_tip'; end if;
  else
    raise exception 'invalid_tip';
  end if;

  b := public.client_lock_open_bill(p_token);
  select rs.is_demo, rs.sinpe_number, t2.number, t2.is_hidden into r
    from public.tables t2 join public.restaurants rs on rs.id = t2.restaurant_id where t2.id = b.table_id;
  -- Los métodos simulados (tarjeta, Apple Pay, Google Pay) solo existen en la demo. Un restaurante real cobra por SINPE.
  if not v_sinpe and not r.is_demo then raise exception 'method_not_available'; end if;
  if v_sinpe and not r.is_demo and r.sinpe_number is null then raise exception 'sinpe_not_configured'; end if;
  if b.fixed_total is not null and p_mode = 'items' then raise exception 'invalid_kind'; end if;
  if p_mode = 'amount' and b.fixed_total is null then raise exception 'invalid_kind'; end if;

  if v_sinpe then
    if exists (select 1 from public.payments where bill_id = b.id and session_id = p_session and status = 'pending'
                and method = 'sinpe' and reported_at is not null) then
      raise exception 'sinpe_pending';
    end if;
    if (select count(*) from public.payments where bill_id = b.id and status = 'pending' and method = 'sinpe' and reported_at is not null) >= 8 then
      raise exception 'too_many_pending';
    end if;
  end if;

  select * into tot from public.bill_totals(b.id);
  select * into o from public.client_others(b.id, p_session);
  if tot.balance <= 0 then raise exception 'nothing_to_pay'; end if;

  if p_mode = 'all' then
    v_amount := greatest(tot.balance - o.items_amt - o.other_amt, 0);
    if v_amount = 0 then raise exception 'others_paying'; end if;
    v_kind := case when v_amount = tot.balance then 'full' else 'amount' end;

  elsif p_mode = 'amount' then
    if b.split_mode is not null then raise exception 'split_active'; end if;
    v_avail := greatest(tot.balance - o.items_amt - o.other_amt, 0);
    if v_avail = 0 then raise exception 'others_paying'; end if;
    if p_amount is null or p_amount < 1 then raise exception 'invalid_amount'; end if;
    if p_amount > v_avail then raise exception 'amount_exceeds_balance'; end if;
    v_amount := p_amount;
    v_kind := 'amount';

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

  -- Si esta misma sesión ya tenía un pago pendiente (sin reportar), se cancela y se sueltan sus reservas.
  perform public.client_drop_mine(b.id, p_session);

  if p_tip_type = 'percent' then
    v_tip := ((2::bigint * v_amount * p_tip_value + 100) / 200)::int;
  else
    v_tip := p_tip_value;
  end if;

  if v_sinpe then
    -- Código corto para la descripción del SINPE: M + número de mesa + 3 caracteres sin confusiones (sin 0, O, 1, I, L).
    loop
      v_code := 'M' || (case when r.is_hidden then 4 else r.number end) || '-'
                || substr(v_chars, 1 + floor(random() * 31)::int, 1) || substr(v_chars, 1 + floor(random() * 31)::int, 1)
                || substr(v_chars, 1 + floor(random() * 31)::int, 1);
      exit when not exists (select 1 from public.payments where bill_id = b.id and reference_code = v_code);
      v_tries := v_tries + 1;
      if v_tries > 40 then raise exception 'code_unavailable'; end if;
    end loop;
  end if;

  insert into public.payments (id, bill_id, amount, tip_amount, method, source, kind, split_part_index, provider, provider_ref,
                               status, session_id, expires_at, reference_code)
  values (v_payment, b.id, v_amount, v_tip, p_method, 'qr', v_kind, v_idx,
          case when v_sinpe then 'sinpe' else p_provider end,
          case when v_sinpe then 'sinpe_' || v_payment else null end,
          'pending', p_session, v_expires, v_code);

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
                            'kind', v_kind, 'expires_at', v_expires, 'bill_id', b.id, 'method', p_method, 'reference_code', v_code);
end $$;

-- "Ya hice el SINPE": el pago pasa a "por confirmar". Aparta el saldo (y los platos) hasta que el salonero responda.
create or replace function public.client_report_sinpe(p_payment_id uuid, p_session text, p_payer_name text)
returns jsonb language plpgsql set search_path = ''
as $$
declare p public.payments; v_bill uuid; v_token text; b public.bills;
begin
  perform public.client_check_session(p_session);
  select bill_id into v_bill from public.payments where id = p_payment_id;
  if not found then raise exception 'payment_not_found'; end if;
  select * into b from public.bills where id = v_bill for update;
  select * into p from public.payments where id = p_payment_id for update;
  if p.session_id is distinct from p_session or p.method <> 'sinpe' then raise exception 'payment_not_found'; end if;
  select t.qr_token into v_token from public.tables t where t.id = b.table_id;
  if p.status <> 'pending' then
    return jsonb_build_object('ok', true, 'status', p.status, 'token', v_token);
  end if;
  if p.reported_at is not null then
    return jsonb_build_object('ok', true, 'status', 'pending', 'token', v_token);
  end if;
  if p.expires_at <= now() then raise exception 'payment_expired'; end if;
  if b.status <> 'open' then raise exception 'bill_not_open'; end if;
  if (select count(*) from public.payments where bill_id = b.id and status = 'pending' and method = 'sinpe' and reported_at is not null) >= 8 then
    raise exception 'too_many_pending';
  end if;
  update public.payments set reported_at = now(), expires_at = 'infinity', payer_name = nullif(left(trim(coalesce(p_payer_name, '')), 80), '')
    where id = p.id;
  update public.bill_items set reserved_until = 'infinity'
    where reserved_by_session = p_session and id in (select bill_item_id from public.payment_items where payment_id = p.id);
  return jsonb_build_object('ok', true, 'status', 'pending', 'token', v_token);
end $$;

-- "Volver": cancela un pago propio pendiente, salvo un SINPE ya reportado (ese solo lo resuelve el salonero).
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
  if p.status = 'pending' and not (p.method = 'sinpe' and p.reported_at is not null) then
    update public.payments set status = 'failed' where id = p.id;
    update public.bill_items set reserved_by_session = null, reserved_until = null
      where reserved_by_session = p_session and id in (select bill_item_id from public.payment_items where payment_id = p.id);
    return jsonb_build_object('ok', true, 'status', 'failed', 'token', v_token);
  end if;
  return jsonb_build_object('ok', true, 'status', p.status, 'token', v_token);
end $$;

-- Estado público de la mesa. Cambios respecto a 0008: modo de la cuenta, SINPE del restaurante, métodos disponibles,
-- el SINPE reciente de esta sesión y "pagado fuera del QR" cuenta solo lo que registró el salonero.
create or replace function public.client_state(p_token text, p_session text)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  t record; r record; b record; tot record; o record;
  v_lines jsonb; v_split jsonb := null; v_outside int; v_all int; v_items_base int; v_remaining int; v_due int;
  v_sinpe jsonb := null; v_mine jsonb := null; v_methods jsonb;
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
      'restaurant', jsonb_build_object('name', r.name, 'primary_color', r.primary_color, 'logo_url', r.logo_url), 'bill', null);
  end if;
  if b.status <> 'open' then
    return jsonb_build_object('view', 'finished', 'table_number', t.number, 'server_time', now(),
      'restaurant', jsonb_build_object('name', r.name, 'primary_color', r.primary_color, 'logo_url', r.logo_url),
      'bill', jsonb_build_object('id', b.id, 'status', b.status,
        'outcome', case when b.paid_at is not null then 'paid' else 'closed' end));
  end if;

  select * into tot from public.bill_totals(b.id);
  select * into o from public.client_others(b.id, p_session);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', i.name, 'amount', i.unit_price * i.quantity, 'status', i.status,
      'reserved', case when i.status = 'pending' and i.reserved_until > now()
                       then case when i.reserved_by_session = p_session then 'me' else 'other' end else 'none' end,
      'reserved_until', case when i.status = 'pending' and i.reserved_until > now() and i.reserved_until < 'infinity'
                                  and i.reserved_by_session = p_session then i.reserved_until end,
      'split_group_id', i.split_group_id) order by i.created_at, i.id), '[]'::jsonb)
    into v_lines
    from public.bill_items i where i.bill_id = b.id and i.status <> 'void';

  select coalesce(sum(amount - overpaid_amount), 0)::int into v_outside
    from public.payments where bill_id = b.id and status = 'paid' and kind = 'amount' and source = 'panel';

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

  -- La demo siempre muestra el número de prueba, nunca uno real.
  if r.is_demo then
    v_sinpe := jsonb_build_object('number', '00000000', 'holder', r.name, 'test', true);
    v_methods := '["card", "apple_pay", "google_pay", "sinpe"]'::jsonb;
  else
    if r.sinpe_number is not null and r.sinpe_holder is not null then
      v_sinpe := jsonb_build_object('number', r.sinpe_number, 'holder', r.sinpe_holder, 'test', false);
    end if;
    v_methods := '["sinpe"]'::jsonb;
  end if;

  -- El SINPE más reciente de esta sesión: en instrucciones, por confirmar, confirmado o rechazado.
  select jsonb_build_object('id', p.id, 'status', p.status, 'amount', p.amount, 'tip', p.tip_amount, 'code', p.reference_code,
                            'reported', p.reported_at is not null, 'kind', p.kind)
    into v_mine
    from public.payments p
   where p.bill_id = b.id and p.session_id = p_session and p.method = 'sinpe' and p.source = 'qr'
     and ((p.status = 'pending' and (p.reported_at is not null or p.expires_at > now()))
          or (p.status in ('paid', 'failed') and p.reported_at is not null and p.created_at > now() - interval '3 hours'))
   order by p.created_at desc limit 1;

  return jsonb_build_object(
    'view', 'open', 'table_number', t.number, 'server_time', now(),
    'restaurant', jsonb_build_object('name', r.name, 'primary_color', r.primary_color, 'logo_url', r.logo_url,
      'service_rate', r.service_rate, 'vat_rate', r.vat_rate, 'prices_include_taxes', r.prices_include_taxes,
      'sinpe', v_sinpe, 'methods', v_methods),
    'bill', jsonb_build_object(
      'id', b.id, 'status', 'open', 'mode', case when b.fixed_total is not null then 'total' else 'items' end,
      'lines', v_lines,
      'totals', jsonb_build_object('items_sum', tot.items_sum, 'subtotal', tot.subtotal, 'service', tot.service,
                                   'vat', tot.vat, 'total', tot.total, 'paid', tot.paid, 'balance', tot.balance),
      'split', v_split,
      'amounts', jsonb_build_object('all', v_all, 'items_base', v_items_base),
      'others_paying', (o.items_amt + o.other_amt) > 0,
      'paid_outside', v_outside,
      'my_sinpe', v_mine));
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Permisos: ninguna función es ejecutable desde el navegador.
-- ---------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  for f in select unnest(array[
    'payments_demo_guard()', 'bill_totals(uuid)', 'panel_open_bill(uuid)', 'panel_open_bill_total(uuid,int)',
    'panel_add_items(uuid,uuid,int)', 'panel_set_total(uuid,int)', 'panel_confirm_sinpe(uuid)', 'panel_reject_sinpe(uuid)', 'demo_confirm_sinpe(text)',
    'panel_cancel_split(uuid)', 'panel_close_bill(uuid)', 'panel_release_table(uuid)',
    'client_drop_mine(uuid,text)', 'client_start_split(text,text,int)',
    'client_create_payment(text,text,text,uuid[],text,text,int,text,jsonb,int)',
    'client_report_sinpe(uuid,text,text)', 'client_cancel_payment(uuid,text)', 'client_state(text,text)'])
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Auditoría: si alguna función de public fuera ejecutable desde el navegador, esta migración falla.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute'));
  if bad is not null then
    raise exception 'Funciones de public ejecutables desde el navegador: %', bad;
  end if;
end $$;
