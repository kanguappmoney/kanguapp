-- ===========================================================================
-- Admin, Assinaturas a acompanhar (parte 2) — `admin_list_trials()` (migration 042).
-- Prova: (1) anon e não-admin recusados; (2) só motoristas em TRIAL (ativa e pausada ficam de
-- fora), do MAIS ANTIGO ao mais novo, com `days_as_trial` desde o cadastro; (3) colunas
-- exatas, sem dado de aluno/responsável; (4) sinais úteis à cobrança (perfil completo,
-- alunos ativos, aparece na vitrine) batem com o fixture.
-- Rodar como role privilegiado (SQL Editor). Termina em exceção 'RESULTADO: ... PASSOU'.
-- APLICAR as migrations 037–042 ANTES de rodar.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000e0051', '00000000-0000-0000-0000-0000000e0052', '00000000-0000-0000-0000-0000000e0053',
  '00000000-0000-0000-0000-0000000e0054', '00000000-0000-0000-0000-0000000e0055', '00000000-0000-0000-0000-0000000e0056');
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000e0051', '00000000-0000-0000-0000-0000000e0052', '00000000-0000-0000-0000-0000000e0053',
  '00000000-0000-0000-0000-0000000e0054', '00000000-0000-0000-0000-0000000e0055', '00000000-0000-0000-0000-0000000e0056');

-- Admin + 3 trials (40, 10 e 1 dia de cadastro) + 1 ativa + 1 pausada.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0051', 'authenticated', 'authenticated', 'adm-tr@teste.kangu',  '{"role":"driver","full_name":"Tr Admin"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0052', 'authenticated', 'authenticated', 'tr40@teste.kangu',    '{"role":"driver","full_name":"Tr Trial 40d"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0053', 'authenticated', 'authenticated', 'tr10@teste.kangu',    '{"role":"driver","full_name":"Tr Trial 10d"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0054', 'authenticated', 'authenticated', 'tr1@teste.kangu',     '{"role":"driver","full_name":"Tr Trial 1d"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0055', 'authenticated', 'authenticated', 'tr-ativa@teste.kangu','{"role":"driver","full_name":"Tr Ativa"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0056', 'authenticated', 'authenticated', 'tr-pausa@teste.kangu','{"role":"driver","full_name":"Tr Pausada"}'::jsonb, now(), now());
-- Fixture (migration 059): o motorista de teste concede o consentimento da vitrine/pedidos que a trava exige. Nenhuma asserção foi alterada.
select public._insert_consent(k, u.id, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture')
  from auth.users u cross join unnest(array['marketplace_listing','marketplace_requests']) k
 where u.raw_user_meta_data ->> 'role' = 'driver' and u.email ~ '(teste\.kangu|\.teste)$'
   and not exists (select 1 from public.consents c where c.subject_user_id = u.id and c.kind = k and c.revoked_at is null);

insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000e0051');

update public.users set created_at = now() - interval '40 days' - interval '2 hours' where id = '00000000-0000-0000-0000-0000000e0052';
update public.users set created_at = now() - interval '10 days' - interval '2 hours' where id = '00000000-0000-0000-0000-0000000e0053';
update public.users set created_at = now() - interval '1 day'  - interval '2 hours' where id = '00000000-0000-0000-0000-0000000e0054';
update public.users set created_at = now() - interval '90 days' where id = '00000000-0000-0000-0000-0000000e0055';  -- ativa e MAIS antiga: não pode aparecer
update public.users set created_at = now() - interval '80 days' where id = '00000000-0000-0000-0000-0000000e0056';  -- pausada: não pode aparecer
update public.users set phone = '11999990052' where id = '00000000-0000-0000-0000-0000000e0052';
update public.driver_profiles set subscription_status = 'active' where user_id in ('00000000-0000-0000-0000-0000000e0051', '00000000-0000-0000-0000-0000000e0055');
update public.driver_profiles set subscription_status = 'paused' where user_id = '00000000-0000-0000-0000-0000000e0056';

-- O trial de 40 dias tem perfil completo, listado/visível e 1 aluno ativo; os outros não.
update public.driver_profiles set
  service_cities = 'Mauá', service_neighborhoods = 'Centro', service_schools = 'Escola A',
  age_min = 4, age_max = 15, service_shifts = '{morning}', price_min_cents = 25000, price_max_cents = 40000,
  van_photo_path = '00000000-0000-0000-0000-0000000e0052/van-1', marketplace_listed = true
where user_id = '00000000-0000-0000-0000-0000000e0052';
insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix)
values ('00000000-0000-0000-0000-0000000e0052', 'Van T', 'TRV1T11', 10, 'Van T', 2022, 'Branca', 'PFX-T');
insert into public.students (driver_id, full_name, status) values ('00000000-0000-0000-0000-0000000e0052', 'Tr Aluno Sigiloso', 'active');

create function pg_temp.try_as(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  begin execute p_sql; r := 'ok';
  exception when others then r := sqlstate || ':' || sqlerrm; end;
  reset role;
  return r;
end $$;

create function pg_temp.trials() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000e0051', 'role', 'authenticated')::text, true);
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into r from public.admin_list_trials() t;
  reset role;
  return r;
end $$;

do $$
declare r1 text; r2 text;
begin
  r1 := pg_temp.try_as('anon', null, 'select * from public.admin_list_trials()');
  r2 := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0052', 'select * from public.admin_list_trials()');
  if r1 not like '42501:%' then raise exception 'FALHOU (1): anon não foi negado: %', r1; end if;
  if r2 <> '42501:Acesso negado.' then raise exception 'FALHOU (1): motorista não-admin deveria receber "Acesso negado.": %', r2; end if;
  raise notice 'OK (1/4): anon e motorista não-admin negados';
end $$;

do $$
declare t jsonb := pg_temp.trials(); names text; k int;
begin
  -- só os 3 trials do fixture entre as linhas "Tr ..." (ativa e pausada ficam de fora)
  select string_agg(x->>'full_name', ' > ' order by ord) into names
    from jsonb_array_elements(t) with ordinality as e(x, ord) where x->>'full_name' like 'Tr %';
  if names is distinct from 'Tr Trial 40d > Tr Trial 10d > Tr Trial 1d' then
    raise exception 'FALHOU (2): ordem/seleção errada (esperado 40d > 10d > 1d, sem ativa/pausada): %', names;
  end if;
  -- ordenação global: a lista inteira vem do mais antigo ao mais novo
  select count(*) into k from jsonb_array_elements(t) with ordinality as a(x, i)
    join jsonb_array_elements(t) with ordinality as b(y, j) on j = i + 1
   where (a.x->>'created_at')::timestamptz > (b.y->>'created_at')::timestamptz;
  if k <> 0 then raise exception 'FALHOU (2): a lista não está do mais antigo ao mais novo (% inversões)', k; end if;
  if exists (select 1 from jsonb_array_elements(t) x where x->>'full_name' in ('Tr Ativa', 'Tr Pausada', 'Tr Admin')) then
    raise exception 'FALHOU (2): motorista fora de trial na lista';
  end if;
  raise notice 'OK (2/4): só trials, do mais antigo ao mais novo';
end $$;

do $$
declare t jsonb := pg_temp.trials(); a jsonb; b jsonb; c jsonb;
begin
  select x into a from jsonb_array_elements(t) x where x->>'full_name' = 'Tr Trial 40d';
  select x into b from jsonb_array_elements(t) x where x->>'full_name' = 'Tr Trial 10d';
  select x into c from jsonb_array_elements(t) x where x->>'full_name' = 'Tr Trial 1d';
  if (a->>'days_as_trial')::int <> 40 or (b->>'days_as_trial')::int <> 10 or (c->>'days_as_trial')::int <> 1 then
    raise exception 'FALHOU (3): days_as_trial esperado 40/10/1, veio %/%/%', a->>'days_as_trial', b->>'days_as_trial', c->>'days_as_trial';
  end if;
  if (a->>'profile_complete')::boolean is not true or (a->>'active_students')::int <> 1
     or (a->>'visible_on_marketplace')::boolean is not true or a->>'phone' <> '11999990052' or a->>'email' <> 'tr40@teste.kangu' then
    raise exception 'FALHOU (3): sinais do trial de 40 dias incorretos: %', a;
  end if;
  if (b->>'profile_complete')::boolean is not false or (b->>'active_students')::int <> 0
     or (b->>'visible_on_marketplace')::boolean is not false then
    raise exception 'FALHOU (3): sinais do trial de 10 dias incorretos: %', b;
  end if;
  raise notice 'OK (3/4): dias de trial e sinais de cobrança (perfil, alunos, vitrine) corretos';
end $$;

do $$
declare t jsonb := pg_temp.trials(); a jsonb; txt text; bad text;
begin
  select x into a from jsonb_array_elements(t) x where x->>'full_name' = 'Tr Trial 40d';
  if (select array_agg(k order by k) from jsonb_object_keys(a) k) is distinct from
     array['active_students','created_at','days_as_trial','email','full_name','phone','profile_complete','user_id','visible_on_marketplace'] then
    raise exception 'FALHOU (4): colunas de admin_list_trials mudaram: %', (select array_agg(k) from jsonb_object_keys(a) k);
  end if;
  txt := t::text;
  foreach bad in array array['Sigiloso', 'Rua ', 'van-1', 'prefix', 'PFX-T', 'TRV1T11'] loop
    if position(bad in txt) > 0 then raise exception 'FALHOU (4): dado inesperado "%" na lista de trials', bad; end if;
  end loop;
  raise notice 'OK (4/4): colunas exatas; nada de aluno/veículo/foto';
end $$;

do $$ begin raise exception 'RESULTADO: ADMIN TRIALS PASSOU (4/4)'; end $$;

rollback;
