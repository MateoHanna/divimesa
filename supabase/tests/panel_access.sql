-- Migración 0012 (acceso al panel por restaurante y alta de restaurantes).
-- Una sola transacción que termina con un error a propósito (RESULTADO ...) para no dejar nada guardado.
-- Esperado: RESULTADO ok. Cualquier otra cosa lista las comprobaciones que fallaron.
create temp table fails (msg text);

create function pg_temp.expect(name text, q text, want text) returns void language plpgsql as $$
declare e text;
begin
  begin execute q; e := 'sin error';
  exception when others then e := sqlerrm; end;
  if e not like '%' || want || '%' then insert into fails values (name || ': esperaba "' || want || '" y fue "' || e || '"'); end if;
end $$;

create function pg_temp.assert(name text, cond boolean) returns void language plpgsql as $$
begin if cond is not true then insert into fails values (name); end if; end $$;

do $$
declare
  h1 text := 'scrypt$16384$8$1$' || repeat('A', 22) || '$' || repeat('B', 43);
  h2 text := 'scrypt$16384$8$1$' || repeat('C', 22) || '$' || repeat('D', 43);
  r jsonb; rid uuid; rid2 uuid; n int; until_ts timestamptz; row_ record; demo_id uuid; tok text; st jsonb;
begin
  -- ---- La demo tiene su código y no tiene hash (su PIN es la variable PANEL_PIN)
  select id into demo_id from public.restaurants where is_demo;
  perform pg_temp.assert('demo_slug', (select slug from public.restaurants where id = demo_id) = 'demo');
  perform pg_temp.assert('demo_sin_hash', (select panel_pin_hash is null from public.restaurants where id = demo_id));

  -- ---- Restricciones
  perform pg_temp.expect('slug_mayuscula', $q$update public.restaurants set slug = 'Mala' where is_demo$q$, 'restaurants_slug_format');
  perform pg_temp.expect('slug_guion', $q$update public.restaurants set slug = '-mala' where is_demo$q$, 'restaurants_slug_format');
  perform pg_temp.expect('pin_en_claro', $q$update public.restaurants set panel_pin_hash = '12345678' where is_demo$q$, 'restaurants_pin_hash_format');

  -- ---- Alta de restaurante
  r := public.admin_create_restaurant('Soda Prueba', 'soda-prueba', '#0F766E', 12, 'total', '88887777', 'Soda Prueba SA', h1);
  rid := (r->>'id')::uuid;
  perform pg_temp.assert('alta_respuesta', r->>'slug' = 'soda-prueba' and (r->>'tables')::int = 12);
  select * into row_ from public.restaurants where id = rid;
  perform pg_temp.assert('alta_datos', row_.name = 'Soda Prueba' and row_.bill_mode = 'total' and row_.sinpe_number = '88887777'
    and row_.sinpe_holder = 'Soda Prueba SA' and row_.primary_color = '#0F766E' and not row_.is_demo and row_.panel_pin_hash = h1);
  select count(*) into n from public.tables where restaurant_id = rid;
  perform pg_temp.assert('alta_mesas', n = 12);
  perform pg_temp.assert('alta_tokens_distintos', (select count(distinct qr_token) from public.tables where restaurant_id = rid) = 12);
  perform pg_temp.assert('alta_mesas_visibles', (select count(*) from public.tables where restaurant_id = rid and is_hidden) = 0
    and (select min(number) from public.tables where restaurant_id = rid) = 1 and (select max(number) from public.tables where restaurant_id = rid) = 12);
  perform pg_temp.assert('alta_no_toca_demo', (select count(*) from public.restaurants where is_demo) = 1);

  perform pg_temp.expect('slug_repetido', format($q$select public.admin_create_restaurant('Otra', 'soda-prueba', '#0F766E', 3, 'items', null, null, %L)$q$, h2), 'slug_taken');
  perform pg_temp.expect('slug_demo', format($q$select public.admin_create_restaurant('Otra', 'demo', '#0F766E', 3, 'items', null, null, %L)$q$, h2), 'slug_taken');
  perform pg_temp.expect('nombre_vacio', format($q$select public.admin_create_restaurant(' ', 'x1', '#0F766E', 3, 'items', null, null, %L)$q$, h2), 'invalid_name');
  perform pg_temp.expect('slug_malo', format($q$select public.admin_create_restaurant('X', 'Mala Idea', '#0F766E', 3, 'items', null, null, %L)$q$, h2), 'invalid_slug');
  perform pg_temp.expect('color_malo', format($q$select public.admin_create_restaurant('X', 'x2', 'rojo', 3, 'items', null, null, %L)$q$, h2), 'invalid_color');
  perform pg_temp.expect('mesas_cero', format($q$select public.admin_create_restaurant('X', 'x3', '#0F766E', 0, 'items', null, null, %L)$q$, h2), 'invalid_tables');
  perform pg_temp.expect('mesas_muchas', format($q$select public.admin_create_restaurant('X', 'x4', '#0F766E', 201, 'items', null, null, %L)$q$, h2), 'invalid_tables');
  perform pg_temp.expect('modo_malo', format($q$select public.admin_create_restaurant('X', 'x5', '#0F766E', 3, 'otro', null, null, %L)$q$, h2), 'invalid_mode');
  perform pg_temp.expect('total_sin_sinpe', format($q$select public.admin_create_restaurant('X', 'x6', '#0F766E', 3, 'total', null, null, %L)$q$, h2), 'sinpe_required');
  perform pg_temp.expect('sin_hash', $q$select public.admin_create_restaurant('X', 'x7', '#0F766E', 3, 'items', null, null, null)$q$, 'invalid_pin_hash');
  perform pg_temp.expect('hash_en_claro', $q$select public.admin_create_restaurant('X', 'x8', '#0F766E', 3, 'items', null, null, '12345678')$q$, 'restaurants_pin_hash_format');
  perform pg_temp.assert('alta_fallida_no_deja_nada', (select count(*) from public.restaurants where slug in ('x1','x2','x3','x4','x5','x6','x7','x8')) = 0);

  r := public.admin_create_restaurant('Bar por Platos', 'bar-platos', '#112233', 4, 'items', null, null, h2);
  rid2 := (r->>'id')::uuid;
  perform pg_temp.assert('alta_items_sin_sinpe', (select bill_mode = 'items' and sinpe_number is null from public.restaurants where id = rid2));

  -- ---- Bloqueo por intentos: 9 fallos no bloquean, el 10 sí (10 minutos); un acierto reinicia la cuenta
  for i in 1..9 loop until_ts := public.panel_pin_failed(rid); end loop;
  perform pg_temp.assert('nueve_fallos_sin_bloqueo', until_ts is null and (select pin_failures = 9 and pin_locked_until is null from public.restaurants where id = rid));
  until_ts := public.panel_pin_failed(rid);
  perform pg_temp.assert('diez_fallos_bloquea', until_ts > now() + interval '9 minutes' and until_ts <= now() + interval '10 minutes 5 seconds'
    and (select pin_failures = 0 and pin_locked_until = until_ts from public.restaurants where id = rid));
  perform public.panel_pin_ok(rid);
  perform pg_temp.assert('acierto_levanta', (select pin_failures = 0 and pin_locked_until is null from public.restaurants where id = rid));
  perform public.panel_pin_failed(rid); perform public.panel_pin_failed(rid); perform public.panel_pin_ok(rid);
  perform pg_temp.assert('acierto_reinicia_cuenta', (select pin_failures = 0 from public.restaurants where id = rid));
  perform pg_temp.assert('bloqueo_ajeno_intacto', (select pin_failures = 0 and pin_locked_until is null from public.restaurants where id = rid2));

  -- La demo nunca se bloquea (su PIN no está en la base).
  for i in 1..12 loop perform public.panel_pin_failed(demo_id); end loop;
  perform pg_temp.assert('demo_no_se_bloquea', (select pin_failures = 0 and pin_locked_until is null from public.restaurants where id = demo_id));

  -- ---- Cambio de PIN
  for i in 1..10 loop perform public.panel_pin_failed(rid); end loop;
  perform pg_temp.assert('bloqueado_antes_de_cambiar', (select pin_locked_until > now() from public.restaurants where id = rid));
  r := public.admin_set_pin('soda-prueba', h2);
  perform pg_temp.assert('pin_cambiado', (select panel_pin_hash = h2 and pin_failures = 0 and pin_locked_until is null from public.restaurants where id = rid));
  perform pg_temp.expect('pin_cambio_inexistente', format($q$select public.admin_set_pin('no-existe', %L)$q$, h1), 'restaurant_not_found');
  perform pg_temp.expect('pin_cambio_demo', format($q$select public.admin_set_pin('demo', %L)$q$, h1), 'restaurant_not_found');
  perform pg_temp.expect('pin_cambio_sin_hash', $q$select public.admin_set_pin('soda-prueba', null)$q$, 'invalid_pin_hash');
  perform pg_temp.assert('demo_sigue_sin_hash', (select panel_pin_hash is null from public.restaurants where id = demo_id));

  -- ---- Lo que ve el cliente nunca incluye el hash, el código ni datos de acceso
  select qr_token into tok from public.tables where restaurant_id = rid and number = 1;
  st := public.client_state(tok, 'sesion-aaaaaaaaaaaaaaaa');
  perform pg_temp.assert('cliente_sin_hash', st::text not like '%scrypt%' and st::text not like '%soda-prueba%' and st::text not like '%pin%');

  -- ---- Permisos: nada ejecutable desde el navegador, ni las tablas abiertas sin RLS
  foreach tok in array array['panel_pin_failed(uuid)', 'panel_pin_ok(uuid)', 'admin_create_restaurant(text,text,text,int,text,text,text,text)', 'admin_set_pin(text,text)'] loop
    perform pg_temp.assert('anon_no_ejecuta_' || tok, not has_function_privilege('anon', 'public.' || tok, 'execute'));
    perform pg_temp.assert('auth_no_ejecuta_' || tok, not has_function_privilege('authenticated', 'public.' || tok, 'execute'));
    perform pg_temp.assert('service_ejecuta_' || tok, has_function_privilege('service_role', 'public.' || tok, 'execute'));
  end loop;
  perform pg_temp.assert('restaurants_con_rls', (select relrowsecurity from pg_class where oid = 'public.restaurants'::regclass));
  perform pg_temp.assert('restaurants_sin_politicas', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'restaurants') = 0);
  perform pg_temp.assert('auditoria_funciones', (
    select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))) = 0);
end $$;

do $$
declare m text;
begin
  select string_agg(msg, E'\n  - ') into m from fails;
  if m is null then raise exception 'RESULTADO ok'; end if;
  raise exception E'RESULTADO FALLÓ:\n  - %', m;
end $$;
