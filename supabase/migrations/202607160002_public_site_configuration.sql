begin;

-- El sitio público no debe poder consultar la tabla settings de forma genérica.
-- La función siguiente constituye el único contrato anónimo y devuelve una fila
-- estrictamente limitada a contenido público confirmado.
revoke select on public.settings from anon;

create or replace function public.get_public_site_configuration()
returns table (
  hostel_name text,
  phone text,
  whatsapp text,
  address text,
  city text,
  province text,
  base_price_ars numeric,
  check_in_from text,
  check_in_until text,
  check_out_until text,
  quiet_hours_from text,
  quiet_hours_until text,
  cancellation_policy text,
  minors_policy text,
  pets_policy text,
  smoking_policy text,
  quiet_hours_policy text
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed_settings as (
    select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) as values_by_key
    from public.settings s
    where s.key = any (array[
      'hostel.general',
      'hostel.schedules',
      'pricing.base_price',
      'hostel.policies'
    ])
  )
  select
    nullif(trim(values_by_key -> 'hostel.general' ->> 'name'), ''),
    nullif(trim(values_by_key -> 'hostel.general' ->> 'phone'), ''),
    nullif(trim(values_by_key -> 'hostel.general' ->> 'whatsapp'), ''),
    nullif(trim(values_by_key -> 'hostel.general' ->> 'address'), ''),
    nullif(trim(values_by_key -> 'hostel.general' ->> 'city'), ''),
    nullif(trim(values_by_key -> 'hostel.general' ->> 'province'), ''),
    case
      when values_by_key -> 'pricing.base_price' ->> 'amount' ~ '^[0-9]+([.][0-9]+)?$'
      then (values_by_key -> 'pricing.base_price' ->> 'amount')::numeric
      else null
    end,
    nullif(trim(values_by_key -> 'hostel.schedules' ->> 'checkInFrom'), ''),
    nullif(trim(values_by_key -> 'hostel.schedules' ->> 'checkInUntil'), ''),
    nullif(trim(values_by_key -> 'hostel.schedules' ->> 'checkOutUntil'), ''),
    nullif(trim(values_by_key -> 'hostel.schedules' ->> 'quietHoursFrom'), ''),
    nullif(trim(values_by_key -> 'hostel.schedules' ->> 'quietHoursUntil'), ''),
    nullif(trim(values_by_key -> 'hostel.policies' ->> 'cancellation'), ''),
    nullif(trim(values_by_key -> 'hostel.policies' ->> 'minors'), ''),
    nullif(trim(values_by_key -> 'hostel.policies' ->> 'pets'), ''),
    nullif(trim(values_by_key -> 'hostel.policies' ->> 'smoking'), ''),
    nullif(trim(values_by_key -> 'hostel.policies' ->> 'quietHours'), '')
  from allowed_settings;
$$;

revoke all on function public.get_public_site_configuration() from public, anon, authenticated;
grant execute on function public.get_public_site_configuration() to anon;

comment on function public.get_public_site_configuration() is
  'Contrato anónimo de solo lectura para el contenido público del sitio. No expone settings internos ni metadatos de auditoría.';

commit;
