-- ===========================================================================
-- Bairros que o motorista atende (`driver_neighborhoods`, `set_my_neighborhoods`; migration 050).
-- Prova: (1) só MOTORISTA define (anon e responsável recusados); (2) substitui a lista e mantém
-- `driver_profiles.service_neighborhoods` em sincronia (nomes do pool + digitados à mão; vazio → null);
-- (3) id inválido recusado, extras ruins descartados; (4) tetos 150 por cidade e 300 no total (recusa preserva a
-- lista); (5) leitura dono-only e escrita direta negada. Rodar como role privilegiado (SQL Editor). APLICAR 044–050.
-- Termina em exceção 'RESULTADO: ... PASSOU'.
-- ===========================================================================
begin;

delete from public.users where id in ('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e00a2', '00000000-0000-0000-0000-0000000a00a1');
delete from auth.users   where id in ('00000000-0000-0000-0000-0000000e00a1', '00000000-0000-0000-0000-0000000e00a2', '00000000-0000-0000-0000-0000000a00a1');
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e00a1', 'authenticated', 'authenticated', 'bairro2-mot1@teste.kangu', '{"role":"driver","full_name":"Bairro2 Motorista 1"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e00a2', 'authenticated', 'authenticated', 'bairro2-mot2@teste.kangu', '{"role":"driver","full_name":"Bairro2 Motorista 2"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a00a1', 'authenticated', 'authenticated', 'bairro2-pai@teste.kangu',  '{"role":"guardian","full_name":"Bairro2 Pai"}'::jsonb, now(), now());

-- pool de teste (some no rollback): 151 em São Paulo, 150 em Santo André, 3 em Mauá
insert into public.neighborhoods (city_id, name) select 3550308, 'Zz Teste Bairro ' || g from generate_series(1, 151) g;
insert into public.neighborhoods (city_id, name) select 3547809, 'Zz Teste Bairro ' || g from generate_series(1, 150) g;
insert into public.neighborhoods (city_id, name) select 3529401, 'Zz Teste Bairro ' || g from generate_series(1, 3) g;

create temp table t_ids as
  select (select array_agg(id order by id) from public.neighborhoods where city_id = 3529401 and name like 'Zz Teste Bairro %') as mau3,
         (select array_agg(id order by id) from (select id from public.neighborhoods where city_id = 3529401 and name like 'Zz Teste Bairro %' order by id limit 1) a) as mau1,
         (select array_agg(id order by id) from public.neighborhoods where city_id = 3550308 and name like 'Zz Teste Bairro %') as sp151,
         (select array_agg(id order by id) from (select id from public.neighborhoods where city_id = 3550308 and name like 'Zz Teste Bairro %' order by id limit 150) b) as sp150,
         (select array_agg(id order by id) from public.neighborhoods where city_id = 3547809 and name like 'Zz Teste Bairro %') as sa150;
grant select on t_ids to authenticated, anon;

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

create function pg_temp.setm(p_ids bigint[], p_extra text[] default '{}') returns text
language plpgsql as $$
declare r text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000e00a1', 'role', 'authenticated')::text, true);
  begin
    perform public.set_my_neighborhoods(p_ids, p_extra); r := 'ok';
  exception when others then r := sqlstate || ':' || sqlerrm; end;
  reset role;
  return r;
end $$;

do $$
declare r1 text; r2 text;
begin
  r1 := pg_temp.try_as('anon', null, 'select public.set_my_neighborhoods(''{}''::bigint[], ''{}''::text[])');
  r2 := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000a00a1', 'select public.set_my_neighborhoods(''{}''::bigint[], ''{}''::text[])');
  if r1 not like '42501:%' then raise exception 'FALHOU (1): anon não negado: %', r1; end if;
  if r2 not like '42501:Apenas motoristas%' then raise exception 'FALHOU (1): responsável deveria ser recusado: %', r2; end if;
  if pg_temp.setm((select mau3 from t_ids)) <> 'ok' then raise exception 'FALHOU (1): motorista não conseguiu definir a lista'; end if;
  raise notice 'OK (1/5): só motorista define; anon e responsável recusados';
end $$;

do $$
declare n int; t text; expected text;
begin
  select count(*) into n from public.driver_neighborhoods where driver_id = '00000000-0000-0000-0000-0000000e00a1';
  if n <> 3 then raise exception 'FALHOU (2): esperava 3 linhas, veio %', n; end if;
  select string_agg(name, ', ' order by lower(name)) into expected from public.neighborhoods where id = any ((select mau3 from t_ids)::bigint[]);
  select service_neighborhoods into t from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e00a1';
  if t is distinct from expected then raise exception 'FALHOU (2): service_neighborhoods esperado [%], veio [%]', expected, t; end if;
  perform pg_temp.setm((select mau1 from t_ids), array['Bairro Digitado', 'bairro digitado', 'A, B;C']);
  select count(*) into n from public.driver_neighborhoods where driver_id = '00000000-0000-0000-0000-0000000e00a1';
  if n <> 1 then raise exception 'FALHOU (2): a função deveria substituir a lista (n=%)', n; end if;
  select service_neighborhoods into t from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e00a1';
  if t not like '%, A B C, Bairro Digitado' then raise exception 'FALHOU (2): extras ausentes/mal normalizados em [%]', t; end if;
  perform pg_temp.setm('{}', '{}');
  select count(*) into n from public.driver_neighborhoods where driver_id = '00000000-0000-0000-0000-0000000e00a1';
  select service_neighborhoods into t from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e00a1';
  if n <> 0 or t is not null then raise exception 'FALHOU (2): lista vazia deveria zerar tudo (n=%, t=%)', n, t; end if;
  raise notice 'OK (2/5): substitui a lista e mantém service_neighborhoods em sincronia';
end $$;

do $$
declare r text;
begin
  r := pg_temp.setm(array[-1, -2]::bigint[]);
  if r = 'ok' then raise exception 'FALHOU (3): id inválido aceito'; end if;
  r := pg_temp.setm((select mau1 from t_ids), array['', 'x', repeat('y', 61), ',,,']);
  if r <> 'ok' then raise exception 'FALHOU (3): extras ruins deveriam ser descartados: %', r; end if;
  if (select service_neighborhoods from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e00a1') like '%yyy%' then
    raise exception 'FALHOU (3): extra de 61 caracteres foi aceito';
  end if;
  raise notice 'OK (3/5): id inválido recusado; extras fora do formato descartados';
end $$;

do $$
declare r text;
begin
  r := pg_temp.setm((select sp151 from t_ids));
  if r not like '%150 bairros por cidade%' then raise exception 'FALHOU (4): 151 numa cidade deveria ser recusado: %', r; end if;
  if pg_temp.setm((select sp150 || sa150 from t_ids)) <> 'ok' then raise exception 'FALHOU (4): 150+150 (300) deveria passar'; end if;
  r := pg_temp.setm((select sp150 || sa150 || mau1 from t_ids));
  if r not like '%300 bairros%' then raise exception 'FALHOU (4): 301 no total deveria ser recusado: %', r; end if;
  if (select count(*) from public.driver_neighborhoods where driver_id = '00000000-0000-0000-0000-0000000e00a1') <> 300 then
    raise exception 'FALHOU (4): a recusa não pode alterar a lista anterior';
  end if;
  raise notice 'OK (4/5): tetos de 150 por cidade e 300 no total; recusa preserva a lista';
end $$;

do $$
declare w text; seen int;
begin
  foreach w in array array[
    'insert into public.driver_neighborhoods (driver_id, neighborhood_id) values (''00000000-0000-0000-0000-0000000e00a2'', 1)',
    'update public.driver_neighborhoods set neighborhood_id = neighborhood_id',
    'delete from public.driver_neighborhoods'] loop
    if pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e00a2', w) not like '42501:%'
       or pg_temp.try_as('anon', null, w) not like '42501:%' then
      raise exception 'FALHOU (5): escrita direta não negada em [%]', w;
    end if;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e00a2', 'role', 'authenticated')::text, true);
  select count(*) into seen from public.driver_neighborhoods;
  reset role;
  if seen <> 0 then raise exception 'FALHOU (5): motorista 2 enxergou % linhas do motorista 1', seen; end if;
  if pg_temp.try_as('anon', null, 'select * from public.driver_neighborhoods') not like '42501:%' then
    raise exception 'FALHOU (5): anon não deveria ler driver_neighborhoods';
  end if;
  raise notice 'OK (5/5): leitura dono-only, escrita direta negada';
end $$;

do $$ begin raise exception 'RESULTADO: DRIVER NEIGHBORHOODS PASSOU (5/5)'; end $$;
rollback;
