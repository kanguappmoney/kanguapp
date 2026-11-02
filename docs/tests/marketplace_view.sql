-- ===========================================================================
-- Marketplace, Frente D — guarda da vitrine pública `marketplace_listing()` (migration 037).
-- Prova, chamando a função COMO `anon` (o público sem login):
--   (1) perfil completo + toggle ligado APARECE (e as vagas = capacidade − alunos ATIVOS);
--   (2) toggle desligado NÃO aparece, mesmo com tudo preenchido;
--   (3) toggle ligado mas faltando QUALQUER requisito NÃO aparece — cada campo, um a um:
--       área (cidades, bairros, escolas; nulo e só-espaços), idade (mín, máx), turno
--       (nenhum), preço (mín, máx), foto (nula e vazia), perfil da Frente A (prefixo,
--       placa, modelo, cor, sem veículo) e telefone. Para cada um, restaurar o campo faz
--       o motorista voltar a aparecer — prova que foi AQUELE campo que o tirou;
--   (4) nenhuma coluna restrita sai: a lista de colunas da função é EXATAMENTE o
--       whitelist, e a linha de um motorista com tudo preenchido não carrega endereço,
--       e-mail, CNH, prefixo, placa, cor, id nem nome de aluno;
--   (5) anon não lê as tabelas-base por fora da função (RLS) e a função é SECURITY DEFINER
--       com search_path fixo.
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional: termina em exceção
-- 'RESULTADO: ... PASSOU' (visível no SQL Editor, que esconde `raise notice`) e ROLLBACK.
-- APLICAR a migration 037 ANTES de rodar (e as 034 e 036).
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente (só ids sintéticos deste fixture) ------------------
delete from public.users where id = '00000000-0000-0000-0000-0000000e0001';
delete from auth.users   where id = '00000000-0000-0000-0000-0000000e0001';

-- --- Fixture: 1 motorista com TUDO preenchido e valores-isca nos campos restritos -
-- Inserir em auth.users dispara handle_new_user (cria public.users + driver_profiles).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0001', 'authenticated', 'authenticated', 'secreto@mkt.teste', '{"role":"driver","full_name":"Mkt Completo"}'::jsonb, now(), now());

update public.users set phone = '11999990001' where id = '00000000-0000-0000-0000-0000000e0001';

update public.driver_profiles set
  address               = 'Rua Secreta 999',          -- restrito
  document_number       = 'CNH-999888',               -- restrito (CNH)
  service_cities        = 'Mauá, Santo André',
  service_neighborhoods = 'Vila Assis, Centro',
  service_schools       = 'EMEF Fulano',
  age_min               = 4,
  age_max               = 15,
  service_shifts        = '{morning,afternoon}',
  price_min_cents       = 25000,
  price_max_cents       = 40000,
  van_photo_path        = '00000000-0000-0000-0000-0000000e0001/van-1',
  marketplace_listed    = true
where user_id = '00000000-0000-0000-0000-0000000e0001';

insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix)
values ('00000000-0000-0000-0000-0000000e0001', 'Sprinter Teste ZZZ9Z99', 'ZZZ9Z99', 15, 'Sprinter Teste', 2022, 'Branca', 'PFX-777');

-- 3 alunos ATIVOS + 1 ARQUIVADO (não conta): vagas = 15 − 3 = 12.
insert into public.students (driver_id, full_name, status) values
  ('00000000-0000-0000-0000-0000000e0001', 'Aluno Sigiloso Um',    'active'),
  ('00000000-0000-0000-0000-0000000e0001', 'Aluno Sigiloso Dois',  'active'),
  ('00000000-0000-0000-0000-0000000e0001', 'Aluno Sigiloso Três',  'active'),
  ('00000000-0000-0000-0000-0000000e0001', 'Aluno Sigiloso Velho', 'archived');

-- --- Helpers (somem no rollback): chamam a vitrine COMO anon ---------------------
create function pg_temp.anon_count(p_name text) returns int
language plpgsql as $$
declare n int;
begin
  set local role anon;
  select count(*) into n from public.marketplace_listing() m where m.driver_name = p_name;
  reset role;
  return n;
end $$;

create function pg_temp.anon_row(p_name text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  set local role anon;
  select to_jsonb(m) into r from public.marketplace_listing() m where m.driver_name = p_name;
  reset role;
  return r;
end $$;

-- ===========================================================================
-- CHECK 1 — perfil completo + toggle ligado aparece (e as vagas são calculadas).
-- ===========================================================================
do $$
declare r jsonb;
begin
  if pg_temp.anon_count('Mkt Completo') <> 1 then
    raise exception 'FALHOU (1): motorista completo com toggle ligado não apareceu para anon';
  end if;
  r := pg_temp.anon_row('Mkt Completo');
  if (r->>'spots_available')::int <> 12 then
    raise exception 'FALHOU (1): vagas esperadas 12 (15 − 3 ativos; arquivado não conta), veio %', r->>'spots_available';
  end if;
  if r->>'phone' <> '11999990001' or r->>'van_model' <> 'Sprinter Teste'
     or (r->>'price_min_cents')::int <> 25000 or (r->>'price_max_cents')::int <> 40000
     or r->>'service_cities' <> 'Mauá, Santo André' then
    raise exception 'FALHOU (1): campos do whitelist com valor errado: %', r;
  end if;
  raise notice 'OK (1/5): completo + toggle ligado aparece; vagas = 12';
end $$;

-- ===========================================================================
-- CHECK 2 — toggle desligado não aparece, mesmo completo.
-- ===========================================================================
do $$
begin
  update public.driver_profiles set marketplace_listed = false
   where user_id = '00000000-0000-0000-0000-0000000e0001';
  if pg_temp.anon_count('Mkt Completo') <> 0 then
    raise exception 'FALHOU (2): toggle desligado mas o motorista apareceu';
  end if;
  update public.driver_profiles set marketplace_listed = true
   where user_id = '00000000-0000-0000-0000-0000000e0001';
  if pg_temp.anon_count('Mkt Completo') <> 1 then
    raise exception 'FALHOU (2): religar o toggle não trouxe o motorista de volta';
  end if;
  raise notice 'OK (2/5): toggle desligado não aparece; religado volta';
end $$;

-- ===========================================================================
-- CHECK 3 — toggle ligado, mas faltando UM requisito: não aparece. Cada campo, um a um.
-- ===========================================================================
create temp table cases (label text, break_sql text, fix_sql text);
insert into cases values
  -- Área
  ('cidades nulas',          $q$update public.driver_profiles set service_cities = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set service_cities = 'Mauá' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('cidades só espaços',     $q$update public.driver_profiles set service_cities = '   ' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set service_cities = 'Mauá' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('bairros nulos',          $q$update public.driver_profiles set service_neighborhoods = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set service_neighborhoods = 'Centro' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('bairros vazios',         $q$update public.driver_profiles set service_neighborhoods = '' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set service_neighborhoods = 'Centro' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('escolas nulas',          $q$update public.driver_profiles set service_schools = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set service_schools = 'EMEF Fulano' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('escolas só espaços',     $q$update public.driver_profiles set service_schools = ' ' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set service_schools = 'EMEF Fulano' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  -- Idade
  ('idade mínima nula',      $q$update public.driver_profiles set age_min = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set age_min = 4 where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('idade máxima nula',      $q$update public.driver_profiles set age_max = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set age_max = 15 where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  -- Turno
  ('nenhum turno',           $q$update public.driver_profiles set service_shifts = '{}' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set service_shifts = '{morning}' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  -- Preço
  ('preço mínimo nulo',      $q$update public.driver_profiles set price_min_cents = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set price_min_cents = 25000 where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('preço máximo nulo',      $q$update public.driver_profiles set price_max_cents = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set price_max_cents = 40000 where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  -- Foto da van
  ('foto da van nula',       $q$update public.driver_profiles set van_photo_path = null where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set van_photo_path = '00000000-0000-0000-0000-0000000e0001/van-1' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('foto da van vazia',      $q$update public.driver_profiles set van_photo_path = '' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set van_photo_path = '00000000-0000-0000-0000-0000000e0001/van-1' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  -- Perfil completo (Frente A)
  ('sem prefixo',            $q$update public.vehicles set prefix = null where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.vehicles set prefix = 'PFX-777' where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('sem placa',              $q$update public.vehicles set plate = '' where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.vehicles set plate = 'ZZZ9Z99' where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('sem modelo',            $q$update public.vehicles set model = null where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.vehicles set model = 'Sprinter Teste' where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('sem cor',                $q$update public.vehicles set color = '  ' where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.vehicles set color = 'Branca' where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  ('sem veículo',            $q$delete from public.vehicles where driver_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix) values ('00000000-0000-0000-0000-0000000e0001', 'Sprinter Teste ZZZ9Z99', 'ZZZ9Z99', 15, 'Sprinter Teste', 2022, 'Branca', 'PFX-777')$q$),
  -- Contato
  ('sem telefone',           $q$update public.users set phone = null where id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.users set phone = '11999990001' where id = '00000000-0000-0000-0000-0000000e0001'$q$);

do $$
declare c record; n int := 0;
begin
  for c in select * from cases loop
    execute c.break_sql;
    if pg_temp.anon_count('Mkt Completo') <> 0 then
      raise exception 'FALHOU (3): toggle ligado e faltando "%", mas o motorista apareceu', c.label;
    end if;
    execute c.fix_sql;
    if pg_temp.anon_count('Mkt Completo') <> 1 then
      raise exception 'FALHOU (3): restaurar "%" não trouxe o motorista de volta (outro requisito o está tirando)', c.label;
    end if;
    n := n + 1;
  end loop;
  raise notice 'OK (3/5): % requisitos faltando, um a um — nenhum aparece; todos voltam ao restaurar', n;
end $$;

-- ===========================================================================
-- CHECK 4 — nenhuma coluna restrita: o contrato de colunas é EXATAMENTE o whitelist e a
-- linha de quem tem tudo preenchido não carrega endereço, e-mail, CNH, prefixo etc.
-- ===========================================================================
do $$
declare
  cols     text[];
  expected text[] := array[
    'age_max','age_min','driver_name','phone','price_max_cents','price_min_cents',
    'service_cities','service_neighborhoods','service_schools','service_shifts',
    'spots_available','van_model','van_photo_path'];
  r jsonb; txt text; bad text;
begin
  select array_agg(n order by n) into cols
    from pg_proc p, unnest(p.proargnames) n
   where p.oid = 'public.marketplace_listing()'::regprocedure;
  if cols is distinct from expected then
    raise exception 'FALHOU (4): colunas da função % ≠ whitelist %', cols, expected;
  end if;

  r := pg_temp.anon_row('Mkt Completo');
  -- O caminho da foto da van carrega o id do motorista POR DESENHO (a policy do bucket
  -- exige a pasta = auth.uid()); o id não é coluna da função, então fora do caminho ele
  -- não pode aparecer em lugar nenhum.
  txt := (r - 'van_photo_path')::text;
  foreach bad in array array[
    'Rua Secreta', 'secreto@mkt.teste', 'CNH-999888', 'PFX-777', 'ZZZ9Z99',
    'Branca', 'Sigiloso', '0000000e0001'] loop
    if position(bad in txt) > 0 then
      raise exception 'FALHOU (4): dado restrito "%" vazou na linha pública: %', bad, txt;
    end if;
  end loop;
  raise notice 'OK (4/5): colunas = whitelist exato; nenhum dado restrito na linha de um motorista completo';
end $$;

-- ===========================================================================
-- CHECK 5 — anon não lê as tabelas-base por fora da função; função segura.
-- ===========================================================================
do $$
declare t text; n int; sec boolean; cfg text[];
begin
  foreach t in array array['driver_profiles', 'users', 'vehicles', 'students'] loop
    begin
      set local role anon;
      execute format('select count(*) from public.%I', t) into n;
      reset role;
      if n <> 0 then
        raise exception 'FALHOU (5): anon leu % linhas de %', n, t;
      end if;
    exception when insufficient_privilege then
      reset role; -- negado por privilégio também é uma barreira válida
    end;
  end loop;

  select prosecdef, proconfig into sec, cfg
    from pg_proc where oid = 'public.marketplace_listing()'::regprocedure;
  if not sec then raise exception 'FALHOU (5): marketplace_listing não é SECURITY DEFINER'; end if;
  if cfg is null or not exists (select 1 from unnest(cfg) c where c like 'search_path=%') then
    raise exception 'FALHOU (5): marketplace_listing sem search_path fixo';
  end if;
  raise notice 'OK (5/5): anon não lê tabelas-base; função SECURITY DEFINER com search_path fixo';
end $$;

do $$ begin raise exception 'RESULTADO: MARKETPLACE VIEW PASSOU (5/5)'; end $$;

rollback;
