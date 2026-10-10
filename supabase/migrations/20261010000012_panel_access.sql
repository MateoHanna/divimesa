-- Parte D / 0012: acceso al panel por restaurante (código + PIN con hash) y alta de restaurantes.
-- Solo agrega; no borra ni renombra nada.
--
-- Toca estas tablas:
--   restaurants: slug (código del restaurante, único), panel_pin_hash, pin_failures, pin_locked_until
--                (+ un índice único sobre slug). El restaurante de demostración recibe slug 'demo'.
-- Funciones nuevas (solo service_role): panel_pin_failed, panel_pin_ok, admin_create_restaurant, admin_set_pin.
-- Con el código que hoy está en producción todo sigue igual: nada lee estas columnas todavía.
-- El PIN nunca se guarda: solo su hash (scrypt, calculado fuera de la base). El PIN de la demo vive en la variable
-- PANEL_PIN y solo abre el restaurante de demostración.

alter table public.restaurants
  add column if not exists slug text,
  add column if not exists panel_pin_hash text,
  add column if not exists pin_failures int not null default 0 check (pin_failures >= 0),
  add column if not exists pin_locked_until timestamptz;

alter table public.restaurants drop constraint if exists restaurants_slug_format;
alter table public.restaurants add constraint restaurants_slug_format
  check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');
create unique index if not exists restaurants_slug_key on public.restaurants (slug) where slug is not null;

-- Un hash de PIN tiene un formato fijo: scrypt$N$r$p$sal$hash (base64url). Nada de PIN en claro.
alter table public.restaurants drop constraint if exists restaurants_pin_hash_format;
alter table public.restaurants add constraint restaurants_pin_hash_format
  check (panel_pin_hash is null or panel_pin_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{32,}$');

update public.restaurants set slug = 'demo' where is_demo and slug is null;

-- ---------------------------------------------------------------------------------------------------------
-- Bloqueo por intentos fallidos (defensa real aunque el limitador en memoria de cada instancia sea débil).
-- 10 PIN incorrectos seguidos bloquean el acceso a ese restaurante por 10 minutos.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.panel_pin_failed(p_restaurant_id uuid)
returns timestamptz language plpgsql set search_path = ''
as $$
declare v_until timestamptz;
begin
  update public.restaurants
     set pin_failures = case when pin_failures + 1 >= 10 then 0 else pin_failures + 1 end,
         pin_locked_until = case when pin_failures + 1 >= 10 then now() + interval '10 minutes' else pin_locked_until end
   where id = p_restaurant_id and not is_demo
   returning pin_locked_until into v_until;
  return v_until;
end $$;

create or replace function public.panel_pin_ok(p_restaurant_id uuid)
returns void language sql set search_path = ''
as $$
  update public.restaurants set pin_failures = 0, pin_locked_until = null where id = p_restaurant_id and not is_demo;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Alta de un restaurante real (la usa scripts/crear-restaurante.mjs). Una sola transacción: restaurante + mesas.
-- Recibe el hash del PIN, nunca el PIN.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_create_restaurant(
  p_name text, p_slug text, p_color text, p_tables int, p_bill_mode text,
  p_sinpe_number text, p_sinpe_holder text, p_pin_hash text)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_id uuid;
begin
  if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'invalid_name'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' then raise exception 'invalid_slug'; end if;
  if p_slug = 'demo' then raise exception 'slug_taken'; end if;
  if p_color is null or p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid_color'; end if;
  if p_tables is null or p_tables < 1 or p_tables > 200 then raise exception 'invalid_tables'; end if;
  if p_bill_mode not in ('items', 'total') then raise exception 'invalid_mode'; end if;
  if p_pin_hash is null then raise exception 'invalid_pin_hash'; end if;
  if p_bill_mode = 'total' and (p_sinpe_number is null or p_sinpe_holder is null) then raise exception 'sinpe_required'; end if;
  begin
    insert into public.restaurants (name, slug, primary_color, bill_mode, sinpe_number, sinpe_holder, panel_pin_hash, is_demo)
    values (trim(p_name), p_slug, p_color, p_bill_mode, p_sinpe_number, trim(p_sinpe_holder), p_pin_hash, false)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;
  insert into public.tables (restaurant_id, number) select v_id, n from generate_series(1, p_tables) n;
  return jsonb_build_object('id', v_id, 'slug', p_slug, 'tables', p_tables);
end $$;

-- Cambia el PIN de un restaurante real (y levanta cualquier bloqueo). Las sesiones abiertas dejan de valer.
create or replace function public.admin_set_pin(p_slug text, p_pin_hash text)
returns jsonb language plpgsql set search_path = ''
as $$
declare v_id uuid;
begin
  if p_pin_hash is null then raise exception 'invalid_pin_hash'; end if;
  update public.restaurants set panel_pin_hash = p_pin_hash, pin_failures = 0, pin_locked_until = null
   where slug = p_slug and not is_demo returning id into v_id;
  if v_id is null then raise exception 'restaurant_not_found'; end if;
  return jsonb_build_object('id', v_id, 'slug', p_slug);
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Permisos: ninguna función es ejecutable desde el navegador.
-- ---------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  for f in select unnest(array[
    'panel_pin_failed(uuid)', 'panel_pin_ok(uuid)',
    'admin_create_restaurant(text,text,text,int,text,text,text,text)', 'admin_set_pin(text,text)'])
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

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
