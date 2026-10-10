-- El color por defecto de la demo pasa a ser el escarlata de Divimesa.
alter table public.restaurants alter column primary_color set default '#D91E18';

-- Solo se cambia si todavía tiene el color anterior del seed; un color elegido en el panel se respeta.
update public.restaurants set primary_color = '#D91E18' where primary_color = '#0f766e';

-- "Restaurar valores de fábrica" vuelve al nuevo color. Se reescribe la función tomando su
-- definición actual, para no duplicar el resto del cuerpo.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.factory_reset()'::regprocedure);
  d := replace(d, '#0f766e', '#D91E18');
  execute d;
end $$;
