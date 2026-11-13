-- ===========================================================================
-- Marketplace — regra de cobertura cidade → bairro → escola (migration 051). Chamando COMO `anon`:
--  (1) visibilidade exige só CIDADE: sem bairros e sem escolas aparece; sem cidade não aparece;
--  (2) filtro de BAIRRO: lista marcada restringe ao marcado; lista vazia casa qualquer bairro do pool das cidades do
--      motorista (e só delas; com cidade no filtro, só daquela cidade);
--  (3) filtro de ESCOLA: idem — lista vazia casa escola das cidades dele, nunca de fora; lista marcada casa o nome
--      marcado; cadastro antigo com o NOME OFICIAL do INEP casa quando o filtro usa o nome de exibição;
--  (4) opções city-first: sem cidade só vêm cidades; com cidade vêm os bairros dela com a contagem certa (marcado +
--      "todos"); `marketplace_school_options` busca escola na cidade com a contagem e não devolve nada sem cidade.
-- Rodar como role privilegiado (SQL Editor). Termina em exceção 'RESULTADO: ... PASSOU' (rollback).
-- APLICAR as migrations 044–051 ANTES de rodar.
-- ===========================================================================
begin;

delete from public.users where id in (select id from auth.users where email like '%@cov.teste');
delete from auth.users   where email like '%@cov.teste';

create temp table t_sch as
  select (select inep_code from public.schools where city_id = 3529401 and display_name is not null order by inep_code limit 1) as m_code,
         (select inep_code from public.schools where city_id = 3547809 and display_name is not null order by inep_code limit 1) as sa_code,
         (select inep_code from public.schools where city_id = 3550308 and display_name is not null order by inep_code limit 1) as sp_code;
create temp table t_names as
  select (select display_name from public.schools where inep_code = t.m_code) as m_disp,
         (select name from public.schools where inep_code = t.m_code) as m_off,
         (select display_name from public.schools where inep_code = t.sa_code) as sa_disp,
         (select display_name from public.schools where inep_code = t.sp_code) as sp_disp
    from t_sch t;

insert into public.neighborhoods (city_id, name) values
  (3529401, 'Zz Bairro A'), (3529401, 'Zz Bairro B'), (3547809, 'Zz Bairro C');

create function pg_temp.mk(p_n int, p_cities text, p_nb text, p_sc text) returns void
language plpgsql as $$
declare v_id uuid := ('00000000-0000-0000-0000-0000000e00b' || p_n)::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', 'cov' || p_n || '@cov.teste',
          json_build_object('role', 'driver', 'full_name', 'Cov ' || p_n)::jsonb, now(), now());
  -- Fixture (migration 059): consentimento do motorista de teste; nenhuma asserção foi alterada.
  perform public._insert_consent(k, v_id, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture')
    from unnest(array['marketplace_listing','marketplace_requests']) k;

  update public.users set phone = '1199999' || lpad(p_n::text, 4, '0') where id = v_id;
  update public.driver_profiles set service_cities = p_cities, service_neighborhoods = p_nb, service_schools = p_sc,
         age_min = 3, age_max = 17, service_shifts = '{morning}', price_min_cents = 20000, price_max_cents = 30000,
         van_photo_path = v_id::text || '/van-1', marketplace_listed = true
   where user_id = v_id;
  insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix)
  values (v_id, 'Van ' || p_n, 'CV' || p_n || '1A23', 10, 'Van Cov', 2022, 'Branca', 'PFX-' || p_n);
end $$;

-- A: Mauá, bairro e escola marcados · B: Mauá, listas vazias · C: Santo André, listas vazias
-- D: Mauá, escola marcada pelo nome OFICIAL (cadastro antigo) · E: sem cidade (não aparece)
select pg_temp.mk(1, 'Mauá', 'Zz Bairro A', 'Escola A Teste');
select pg_temp.mk(2, 'Mauá', null, null);
select pg_temp.mk(3, 'Santo André', null, null);
select pg_temp.mk(4, 'Mauá', null, (select m_off from t_names));
select pg_temp.mk(5, null, null, null);

create function pg_temp.who(p_city text, p_nb text, p_sc text) returns text
language plpgsql as $$
declare r text;
begin
  set local role anon;
  select string_agg(replace(m.driver_name, 'Cov ', ''), ',' order by m.driver_name) into r
    from public.marketplace_listing(p_city => p_city, p_neighborhood => p_nb, p_school => p_sc, p_limit => 50) m
   where m.driver_name like 'Cov %';
  reset role;
  return coalesce(r, '');
end $$;

do $$
declare r text;
begin
  r := pg_temp.who(null, null, null);
  if r <> '1,2,3,4' then raise exception 'FALHOU (1): visíveis esperados 1,2,3,4 (cidade basta; sem cidade não aparece), veio [%]', r; end if;
  raise notice 'OK (1/4)';
end $$;

do $$
declare r text;
begin
  r := pg_temp.who(null, 'Zz Bairro A', null);
  if r <> '1,2,4' then raise exception 'FALHOU (2): Zz Bairro A (Mauá) → 1 (marcado), 2 e 4 (todos em Mauá), veio [%]', r; end if;
  r := pg_temp.who(null, 'ZZ BAIRRO B', null);
  if r <> '2,4' then raise exception 'FALHOU (2): Zz Bairro B → só os de lista vazia em Mauá (2,4), veio [%]', r; end if;
  r := pg_temp.who(null, 'Zz Bairro C', null);
  if r <> '3' then raise exception 'FALHOU (2): Zz Bairro C (Santo André) → 3, veio [%]', r; end if;
  r := pg_temp.who('Mauá', 'Zz Bairro C', null);
  if r <> '' then raise exception 'FALHOU (2): bairro de outra cidade com cidade no filtro deveria dar vazio, veio [%]', r; end if;
  r := pg_temp.who('Santo André', 'Zz Bairro A', null);
  if r <> '' then raise exception 'FALHOU (2): Zz Bairro A é de Mauá; Santo André não devolve, veio [%]', r; end if;
  raise notice 'OK (2/4)';
end $$;

do $$
declare r text; m_disp text; m_off text; sa_disp text; sp_disp text;
begin
  select t.m_disp, t.m_off, t.sa_disp, t.sp_disp into m_disp, m_off, sa_disp, sp_disp from t_names t;
  r := pg_temp.who(null, null, m_disp);
  if r <> '2,4' then raise exception 'FALHOU (3): escola de Mauá (nome de exibição) → 2 (todas) e 4 (oficial marcado), veio [%]', r; end if;
  r := pg_temp.who(null, null, m_off);
  if r <> '2,4' then raise exception 'FALHOU (3): nome oficial deveria casar igual, veio [%]', r; end if;
  r := pg_temp.who(null, null, 'Escola A Teste');
  if r <> '1' then raise exception 'FALHOU (3): escola marcada só pelo 1, veio [%]', r; end if;
  r := pg_temp.who(null, null, sa_disp);
  if r <> '3' then raise exception 'FALHOU (3): escola de Santo André → 3, veio [%]', r; end if;
  r := pg_temp.who(null, null, sp_disp);
  if r <> '' then raise exception 'FALHOU (3): escola de São Paulo (fora das cidades deles) deveria dar vazio, veio [%]', r; end if;
  r := pg_temp.who('Santo André', null, m_disp);
  if r <> '' then raise exception 'FALHOU (3): escola de Mauá com cidade Santo André no filtro, veio [%]', r; end if;
  raise notice 'OK (3/4)';
end $$;

do $$
declare o text; n int; v int; v_m text;
begin
  select t.m_disp into v_m from t_names t;
  set local role anon;
  select count(*) into n from public.marketplace_filter_options() x where x.kind <> 'city';
  select string_agg(x.value || '=' || x.driver_count, '|' order by x.value) into o
    from public.marketplace_filter_options('Mauá') x where x.kind = 'neighborhood' and x.value like 'Zz Bairro %';
  reset role;
  if n <> 0 then raise exception 'FALHOU (4): sem cidade só deveria haver cidades (veio % outras)', n; end if;
  if o is distinct from 'Zz Bairro A=3|Zz Bairro B=2' then raise exception 'FALHOU (4): bairros de Mauá esperados A=3 (1 marcado + 2 e 4) e B=2, veio [%]', o; end if;
  set local role anon;
  select string_agg(x.value || '=' || x.driver_count, '|' order by x.value) into o
    from public.marketplace_filter_options('Santo André') x where x.kind = 'neighborhood' and x.value like 'Zz Bairro %';
  select x.driver_count into v from public.marketplace_school_options('Mauá', substr(v_m, 1, 6)) x where x.value = v_m;
  select count(*) into n from public.marketplace_school_options(null, v_m);
  reset role;
  if o is distinct from 'Zz Bairro C=1' then raise exception 'FALHOU (4): bairros de Santo André esperados C=1, veio [%]', o; end if;
  if v is null or v < 2 then raise exception 'FALHOU (4): school_options deveria achar a escola de Mauá com ≥ 2 motoristas, veio %', v; end if;
  if n <> 0 then raise exception 'FALHOU (4): school_options sem cidade deveria ser vazio, veio %', n; end if;
  raise notice 'OK (4/4)';
end $$;

do $$ begin raise exception 'RESULTADO: MARKETPLACE COVERAGE PASSOU (4/4)'; end $$;
rollback;
