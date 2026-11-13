-- ===========================================================================
-- Escolas que o motorista atende (`driver_schools`, `set_my_schools`, `capture_link_schools`; migration 048).
-- Prova: (1) só MOTORISTA define a lista (anon e responsável recusados); (2) a função SUBSTITUI a lista e
-- grava `driver_profiles.service_schools` na mesma transação (nomes de exibição + digitados à mão; vazio → null);
-- (3) código inválido e nome digitado ruim são tratados; (4) tetos: 150 por cidade e 300 no total; (5) isolamento:
-- um motorista não lê as linhas do outro e não escreve direto; (6) `capture_link_schools` devolve a lista só de
-- um link ATIVO (revogado/desconhecido → vazio) e funciona sem login.
-- Rodar como role privilegiado (SQL Editor). Termina em exceção 'RESULTADO: ... PASSOU'.
-- APLICAR as migrations 044–048 ANTES de rodar.
-- ===========================================================================

begin;

delete from public.users where id in ('00000000-0000-0000-0000-0000000e0091', '00000000-0000-0000-0000-0000000e0092', '00000000-0000-0000-0000-0000000a0091');
delete from auth.users   where id in ('00000000-0000-0000-0000-0000000e0091', '00000000-0000-0000-0000-0000000e0092', '00000000-0000-0000-0000-0000000a0091');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0091', 'authenticated', 'authenticated', 'escola-mot1@teste.kangu', '{"role":"driver","full_name":"Escola Motorista 1"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0092', 'authenticated', 'authenticated', 'escola-mot2@teste.kangu', '{"role":"driver","full_name":"Escola Motorista 2"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0091', 'authenticated', 'authenticated', 'escola-pai@teste.kangu',  '{"role":"guardian","full_name":"Escola Pai"}'::jsonb, now(), now());
-- Fixture (migration 059): o motorista de teste concede o consentimento da vitrine/pedidos que a trava exige. Nenhuma asserção foi alterada.
select public._insert_consent(k, u.id, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture')
  from auth.users u cross join unnest(array['marketplace_listing','marketplace_requests']) k
 where u.raw_user_meta_data ->> 'role' = 'driver' and u.email ~ '(teste\.kangu|\.teste)$'
   and not exists (select 1 from public.consents c where c.subject_user_id = u.id and c.kind = k and c.revoked_at is null);


create temp table t_codes as
  select (select array_agg(inep_code order by inep_code) from (select inep_code from public.schools where city_id = 3529401 order by inep_code limit 3) a) as mau3,
         (select array_agg(inep_code order by inep_code) from (select inep_code from public.schools where city_id = 3550308 order by inep_code limit 151) b) as sp151,
         (select array_agg(inep_code order by inep_code) from (select inep_code from public.schools where city_id = 3550308 order by inep_code limit 150) c) as sp150,
         (select array_agg(inep_code order by inep_code) from (select inep_code from public.schools where city_id = 3547809 order by inep_code limit 150) d) as sa150,
         (select array_agg(inep_code order by inep_code) from (select inep_code from public.schools where city_id = 3529401 order by inep_code limit 1) e) as mau1;
grant select on t_codes to authenticated, anon;

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

create function pg_temp.setm(p_codes integer[], p_extra text[] default '{}') returns text
language plpgsql as $$
declare r text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000e0091', 'role', 'authenticated')::text, true);
  begin
    perform public.set_my_schools(p_codes, p_extra); r := 'ok';
  exception when others then r := sqlstate || ':' || sqlerrm; end;
  reset role;
  return r;
end $$;

-- (1) quem pode definir
do $$
declare r1 text; r2 text;
begin
  r1 := pg_temp.try_as('anon', null, 'select public.set_my_schools(''{}''::integer[], ''{}''::text[])');
  r2 := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000a0091', 'select public.set_my_schools(''{}''::integer[], ''{}''::text[])');
  if r1 not like '42501:%' then raise exception 'FALHOU (1): anon não negado: %', r1; end if;
  if r2 not like '42501:Apenas motoristas%' then raise exception 'FALHOU (1): responsável deveria ser recusado: %', r2; end if;
  if pg_temp.setm((select mau3 from t_codes)) <> 'ok' then raise exception 'FALHOU (1): motorista não conseguiu definir a lista'; end if;
  raise notice 'OK (1/6): só motorista define; anon e responsável recusados';
end $$;

-- (2) substitui a lista e grava o texto da Frente C na mesma transação
do $$
declare n int; t text; expected text;
begin
  select count(*) into n from public.driver_schools where driver_id = '00000000-0000-0000-0000-0000000e0091';
  if n <> 3 then raise exception 'FALHOU (2): esperava 3 linhas, veio %', n; end if;
  select string_agg(nm, ', ' order by lower(nm)) into expected from (
    select distinct coalesce(display_name, name) nm from public.schools where inep_code = any ((select mau3 from t_codes)::integer[])) q;
  select service_schools into t from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e0091';
  if t is distinct from expected then raise exception 'FALHOU (2): service_schools esperado [%], veio [%]', expected, t; end if;
  -- substitui (não acumula)
  perform pg_temp.setm((select mau1 from t_codes), array['Escola Digitada', 'escola digitada', 'A, B;C']);
  select count(*) into n from public.driver_schools where driver_id = '00000000-0000-0000-0000-0000000e0091';
  if n <> 1 then raise exception 'FALHOU (2): a função deveria substituir a lista (n=%)', n; end if;
  select service_schools into t from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e0091';
  if t not like '%, A B C, Escola Digitada' then raise exception 'FALHOU (2): extras ausentes/mal normalizados em [%]', t; end if;
  -- vazio → sem linhas e texto nulo
  perform pg_temp.setm('{}', '{}');
  select count(*) into n from public.driver_schools where driver_id = '00000000-0000-0000-0000-0000000e0091';
  select service_schools into t from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e0091';
  if n <> 0 or t is not null then raise exception 'FALHOU (2): lista vazia deveria zerar tudo (n=%, t=%)', n, t; end if;
  raise notice 'OK (2/6): substitui a lista e mantém service_schools em sincronia (digitados à mão, vazio → null)';
end $$;

-- (3) validações
do $$
declare r text;
begin
  r := pg_temp.setm(array[1, 2]);
  if r = 'ok' then raise exception 'FALHOU (3): código inválido aceito'; end if;
  r := pg_temp.setm((select mau1 from t_codes), array['', 'x', repeat('y', 61), ',,,']);
  if r <> 'ok' then raise exception 'FALHOU (3): extras ruins deveriam ser descartados, não recusar a lista: %', r; end if;
  if (select service_schools from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e0091') like '%yyy%' then
    raise exception 'FALHOU (3): extra de 61 caracteres foi aceito';
  end if;
  raise notice 'OK (3/6): código inválido recusado; extras fora do formato descartados';
end $$;

-- (4) tetos
do $$
declare r text;
begin
  r := pg_temp.setm((select sp151 from t_codes));
  if r not like '%150 escolas por cidade%' then raise exception 'FALHOU (4): 151 numa cidade deveria ser recusado: %', r; end if;
  if pg_temp.setm((select sp150 || sa150 from t_codes)) <> 'ok' then raise exception 'FALHOU (4): 150+150 (300) deveria passar'; end if;
  r := pg_temp.setm((select sp150 || sa150 || mau1 from t_codes));
  if r not like '%300 escolas%' then raise exception 'FALHOU (4): 301 no total deveria ser recusado: %', r; end if;
  if (select count(*) from public.driver_schools where driver_id = '00000000-0000-0000-0000-0000000e0091') <> 300 then
    raise exception 'FALHOU (4): a recusa não pode alterar a lista anterior';
  end if;
  raise notice 'OK (4/6): tetos de 150 por cidade e 300 no total; recusa preserva a lista';
end $$;

-- (5) isolamento e escrita direta
do $$
declare w text; seen int;
begin
  foreach w in array array[
    'insert into public.driver_schools (driver_id, inep_code) values (''00000000-0000-0000-0000-0000000e0092'', 1)',
    'update public.driver_schools set inep_code = inep_code',
    'delete from public.driver_schools'] loop
    if pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0092', w) not like '42501:%'
       or pg_temp.try_as('anon', null, w) not like '42501:%' then
      raise exception 'FALHOU (5): escrita direta não negada em [%]', w;
    end if;
  end loop;
  -- o motorista 2 não enxerga as linhas do 1 (RLS dono-only)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e0092', 'role', 'authenticated')::text, true);
  select count(*) into seen from public.driver_schools;
  reset role;
  if seen <> 0 then raise exception 'FALHOU (5): motorista 2 enxergou % linhas do motorista 1', seen; end if;
  if pg_temp.try_as('anon', null, 'select * from public.driver_schools') not like '42501:%' then
    raise exception 'FALHOU (5): anon não deveria ler driver_schools';
  end if;
  raise notice 'OK (5/6): leitura dono-only, escrita direta negada';
end $$;

-- (6) leitura pública do formulário do pai
do $$
declare n_active int; n_revoked int; n_unknown int; expected int;
begin
  perform pg_temp.setm((select mau3 from t_codes));
  insert into public.capture_links (driver_id, kind, shift, school, token, status)
    values ('00000000-0000-0000-0000-0000000e0091', 'generic', null, null, 'tok-escolas-teste-0091', 'active');
  select count(distinct coalesce(display_name, name)) into expected from public.schools where inep_code = any ((select mau3 from t_codes)::integer[]);

  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n_active from public.capture_link_schools('tok-escolas-teste-0091');
  select count(*) into n_unknown from public.capture_link_schools('token-que-nao-existe');
  reset role;
  if n_active <> expected then raise exception 'FALHOU (6): link ativo deveria devolver % nomes, veio %', expected, n_active; end if;
  if n_unknown <> 0 then raise exception 'FALHOU (6): token desconhecido deveria devolver vazio'; end if;

  update public.capture_links set status = 'revoked' where token = 'tok-escolas-teste-0091';
  set local role anon;
  select count(*) into n_revoked from public.capture_link_schools('tok-escolas-teste-0091');
  reset role;
  if n_revoked <> 0 then raise exception 'FALHOU (6): link revogado deveria devolver vazio'; end if;
  raise notice 'OK (6/6): lista pública só de link ativo, sem login';
end $$;

do $$ begin raise exception 'RESULTADO: DRIVER SCHOOLS PASSOU (6/6)'; end $$;

rollback;
