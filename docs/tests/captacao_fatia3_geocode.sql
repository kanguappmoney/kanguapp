-- ===========================================================================
-- Captação — Fatia 3: geocoding persiste lat/lng na submissão.
-- A UI (autocomplete Mapbox) não é automatizável aqui, mas provamos o
-- encanamento no limite do banco: submit_capture com lat/lng grava as
-- coordenadas em capture_submissions. Sem coordenada, grava null (fallback).
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000a0001'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000a0001'
);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driverA@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0001', 'authenticated', 'authenticated', 'pai1@teste.kangu',    '{"role":"guardian","full_name":"Responsável 1"}'::jsonb, now(), now());

insert into capture_links (id, driver_id, shift, school, token, status)
values ('00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000d0001', 'morning', 'Escola A', 'tok-cap-a', 'active');

-- ===========================================================================
-- CHECK — submit com coordenada -> lat/lng gravados na submissão.
-- ===========================================================================
do $$
declare v_lat double precision; v_lng double precision;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0001', 'role', 'authenticated')::text, true);
  perform submit_capture(
    p_token := 'tok-cap-a', p_child_full_name := 'Criança Um',
    p_child_birth_date := null, p_pickup_address := 'Rua de Casa, 1',
    p_dropoff_same := true, p_dropoff_address := null,
    p_responsible_phone := null, p_responsible_whatsapp := null,
    p_pickup_lat := -23.6672, p_pickup_lng := -46.4614);
  select pickup_lat, pickup_lng into v_lat, v_lng
    from capture_submissions
   where guardian_id = '00000000-0000-0000-0000-0000000a0001'
   order by created_at desc limit 1;
  reset role;
  if v_lat is distinct from -23.6672 or v_lng is distinct from -46.4614 then
    raise exception 'FALHOU: coordenada não persistiu (lat=%, lng=%)', v_lat, v_lng;
  end if;
  raise notice 'OK: geocoding persiste lat/lng na submissão';
end $$;

do $$ begin raise notice '== CAPTAÇÃO FATIA 3: geocoding persiste PASSOU =='; end $$;

rollback;
