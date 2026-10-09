-- Fase 1 / 0002: cálculo de totales en SQL y avisos de Realtime.

-- Misma lógica que computeTotals() en lib/money.ts (se comparan con tests/fixtures/totals.json).
-- Tasas a milésimas enteras; redondeo al más cercano con el empate hacia arriba.
create or replace function public.calc_totals(
  p_items_sum int, p_service_rate numeric, p_vat_rate numeric, p_includes boolean
) returns table (subtotal int, service int, vat int, total int)
language plpgsql immutable set search_path = ''
as $$
declare
  s bigint := round(p_service_rate * 1000);
  v bigint := round(p_vat_rate * 1000);
  i bigint := p_items_sum;
  sub bigint; svc bigint; tax bigint;
begin
  if p_items_sum < 0 then raise exception 'La suma de los platos no puede ser negativa'; end if;
  if p_includes then
    sub := (2 * i * 1000 + (1000 + s + v)) / (2 * (1000 + s + v));
    svc := (2 * sub * s + 1000) / 2000;
    tax := i - sub - svc;
    return query select sub::int, svc::int, tax::int, i::int;
  else
    svc := (2 * i * s + 1000) / 2000;
    tax := (2 * i * v + 1000) / 2000;
    return query select i::int, svc::int, tax::int, (i + svc + tax)::int;
  end if;
end $$;

-- Desglose y saldo de una cuenta. Las líneas anuladas no cuentan.
create or replace function public.bill_totals(p_bill_id uuid)
returns table (items_sum int, subtotal int, service int, vat int, total int, paid int, balance int)
language sql stable set search_path = ''
as $$
  with b as (
    select bl.paid_amount, r.service_rate, r.vat_rate, r.prices_include_taxes,
           coalesce((select sum(i.unit_price * i.quantity) from public.bill_items i
                     where i.bill_id = bl.id and i.status <> 'void'), 0)::int as items_sum
    from public.bills bl
    join public.tables t on t.id = bl.table_id
    join public.restaurants r on r.id = t.restaurant_id
    where bl.id = p_bill_id
  )
  select b.items_sum, c.subtotal, c.service, c.vat, c.total, b.paid_amount,
         greatest(c.total - b.paid_amount, 0)
  from b cross join lateral public.calc_totals(b.items_sum, b.service_rate, b.vat_rate, b.prices_include_taxes) c;
$$;

-- Realtime: canales públicos pero con uuid (bill:<uuid>, table:<uuid>, restaurant:<uuid>),
-- nunca con el número de mesa. El mensaje solo dice que algo cambió; no lleva montos ni datos.
-- El navegador vuelve a pedir el estado a una API route.
create or replace function public.notify_restaurant(p_restaurant uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare t record;
begin
  begin
    perform realtime.send('{"changed":true}'::jsonb, 'changed', 'restaurant:' || p_restaurant, false);
    for t in select id from public.tables where restaurant_id = p_restaurant loop
      perform realtime.send('{"changed":true}'::jsonb, 'changed', 'table:' || t.id, false);
    end loop;
  exception when others then null;
  end;
end $$;

create or replace function public.notify_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_bill uuid; v_table uuid; v_rest uuid;
begin
  if coalesce(current_setting('app.mute_notify', true), '') = '1' then return null; end if;
  if tg_table_name = 'bills' then
    v_bill := (v ->> 'id')::uuid;
    v_table := (v ->> 'table_id')::uuid;
  else
    v_bill := (v ->> 'bill_id')::uuid;
    select table_id into v_table from public.bills where id = v_bill;
  end if;
  if v_table is null then return null; end if;
  select restaurant_id into v_rest from public.tables where id = v_table;
  begin
    perform realtime.send('{"changed":true}'::jsonb, 'changed', 'bill:' || v_bill, false);
    perform realtime.send('{"changed":true}'::jsonb, 'changed', 'table:' || v_table, false);
    if v_rest is not null then
      perform realtime.send('{"changed":true}'::jsonb, 'changed', 'restaurant:' || v_rest, false);
    end if;
  exception when others then null;
  end;
  return null;
end $$;

create or replace function public.notify_restaurant_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('app.mute_notify', true), '') = '1' then return null; end if;
  perform public.notify_restaurant(new.id);
  return null;
end $$;

create trigger bills_notify after insert or update or delete on public.bills
  for each row execute function public.notify_change();
create trigger bill_items_notify after insert or update or delete on public.bill_items
  for each row execute function public.notify_change();
create trigger payments_notify after insert or update or delete on public.payments
  for each row execute function public.notify_change();
create trigger restaurants_notify after update on public.restaurants
  for each row execute function public.notify_restaurant_change();

revoke execute on function public.calc_totals(int, numeric, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.bill_totals(uuid) from public, anon, authenticated;
revoke execute on function public.notify_restaurant(uuid) from public, anon, authenticated;
revoke execute on function public.notify_change() from public, anon, authenticated;
revoke execute on function public.notify_restaurant_change() from public, anon, authenticated;
grant execute on function public.calc_totals(int, numeric, numeric, boolean) to service_role;
grant execute on function public.bill_totals(uuid) to service_role;
grant execute on function public.notify_restaurant(uuid) to service_role;
