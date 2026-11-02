-- ===========================================================================
-- Marketplace, Frentes D+E — guarda da vitrine pública `marketplace_listing(...)` (migrations
-- 037 e 038: filtros, paginação, assinatura em dia, public_id).
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
--   (5) anon não lê as tabelas-base por fora da função (RLS), a função é SECURITY DEFINER
--       com search_path fixo e as funções INTERNAS (marketplace_visible/_tokens) não são
--       executáveis por anon;
--   (6) filtros (cidade, bairro, escola, idade do filho, turno — sozinhos e combinados) são
--       aplicados DENTRO da função, sem diferença de maiúsculas;
--   (7) paginação dentro da função (limit/offset, total_count, piso/teto do limit), telefone
--       só no modo perfil (public_id) e opções dos filtros só de motoristas visíveis.
--   Requisito da Frente E dentro do check (3): assinatura 'paused' tira o motorista; 'trial'
--   e 'active' mantêm (o enum não tem 'canceled' — o `in ('active','trial')` já o excluiria).
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional: termina em exceção
-- 'RESULTADO: ... PASSOU' (visível no SQL Editor, que esconde `raise notice`) e ROLLBACK.
-- APLICAR as migrations 037 e 038 ANTES de rodar (e as 034 e 036).
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente (só ids sintéticos deste fixture) ------------------
delete from public.users where id in ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0002');
delete from auth.users   where id in ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0002');

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

-- Segundo motorista COMPLETO e visível (filtros/paginação): outra faixa etária, outro turno.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0002', 'authenticated', 'authenticated', 'segundo@mkt.teste', '{"role":"driver","full_name":"Mkt Segundo"}'::jsonb, now(), now());
update public.users set phone = '11999990002' where id = '00000000-0000-0000-0000-0000000e0002';
update public.driver_profiles set
  service_cities = 'Santo André', service_neighborhoods = 'Jardim', service_schools = 'Colégio Beltrano',
  age_min = 10, age_max = 17, service_shifts = '{integral}', price_min_cents = 30000, price_max_cents = 50000,
  van_photo_path = '00000000-0000-0000-0000-0000000e0002/van-1', marketplace_listed = true
where user_id = '00000000-0000-0000-0000-0000000e0002';
insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix)
values ('00000000-0000-0000-0000-0000000e0002', 'Van B', 'YYY8Y88', 10, 'Van B', 2021, 'Prata', 'PFX-888');

-- --- Helpers (somem no rollback): chamam a vitrine COMO anon ---------------------
-- Visibilidade do fixture A (ou outro motorista) em MODO PERFIL: public_id lido como
-- privilegiado, depois a chamada é feita como anon — independe de quantos motoristas reais
-- existam ou da paginação.
create function pg_temp.anon_count(p_uid uuid default '00000000-0000-0000-0000-0000000e0001') returns int
language plpgsql as $$
declare n int; pid uuid;
begin
  select public_id into pid from public.driver_profiles where user_id = p_uid;
  set local role anon;
  select count(*) into n from public.marketplace_listing(p_public_id => pid);
  reset role;
  return n;
end $$;

create function pg_temp.anon_row(p_uid uuid default '00000000-0000-0000-0000-0000000e0001') returns jsonb
language plpgsql as $$
declare r jsonb; pid uuid;
begin
  select public_id into pid from public.driver_profiles where user_id = p_uid;
  set local role anon;
  select to_jsonb(m) into r from public.marketplace_listing(p_public_id => pid) m;
  reset role;
  return r;
end $$;

-- Nomes 'Mkt %' devolvidos por uma busca com filtros (como anon).
create function pg_temp.anon_names(
  p_city text default null, p_neighborhood text default null, p_school text default null,
  p_age integer default null, p_shift student_shift default null
) returns text
language plpgsql as $$
declare r text;
begin
  set local role anon;
  select coalesce(string_agg(m.driver_name, '|' order by m.driver_name), '') into r
    from public.marketplace_listing(p_city, p_neighborhood, p_school, p_age, p_shift, 50, 0) m
   where m.driver_name like 'Mkt %';
  reset role;
  return r;
end $$;

-- ===========================================================================
-- CHECK 1 — perfil completo + toggle ligado aparece (e as vagas são calculadas).
-- ===========================================================================
do $$
declare r jsonb;
begin
  if pg_temp.anon_count() <> 1 then
    raise exception 'FALHOU (1): motorista completo com toggle ligado não apareceu para anon';
  end if;
  r := pg_temp.anon_row();
  if (r->>'spots_available')::int <> 12 then
    raise exception 'FALHOU (1): vagas esperadas 12 (15 − 3 ativos; arquivado não conta), veio %', r->>'spots_available';
  end if;
  if r->>'phone' <> '11999990001' or r->>'van_model' <> 'Sprinter Teste'
     or (r->>'price_min_cents')::int <> 25000 or (r->>'price_max_cents')::int <> 40000
     or r->>'service_cities' <> 'Mauá, Santo André' then
    raise exception 'FALHOU (1): campos do whitelist com valor errado: %', r;
  end if;
  -- Na LISTAGEM (sem public_id) o telefone vem nulo; só o perfil o entrega.
  set local role anon;
  if (select m.phone from public.marketplace_listing(p_city => 'Mauá', p_limit => 50) m
       where m.driver_name = 'Mkt Completo') is not null then
    reset role;
    raise exception 'FALHOU (1): telefone saiu na listagem (deveria ser nulo fora do modo perfil)';
  end if;
  reset role;
  raise notice 'OK (1/7): completo + toggle ligado aparece; vagas = 12; telefone só no perfil';
end $$;

-- ===========================================================================
-- CHECK 2 — toggle desligado não aparece, mesmo completo.
-- ===========================================================================
do $$
begin
  update public.driver_profiles set marketplace_listed = false
   where user_id = '00000000-0000-0000-0000-0000000e0001';
  if pg_temp.anon_count() <> 0 then
    raise exception 'FALHOU (2): toggle desligado mas o motorista apareceu';
  end if;
  update public.driver_profiles set marketplace_listed = true
   where user_id = '00000000-0000-0000-0000-0000000e0001';
  if pg_temp.anon_count() <> 1 then
    raise exception 'FALHOU (2): religar o toggle não trouxe o motorista de volta';
  end if;
  raise notice 'OK (2/7): toggle desligado não aparece; religado volta';
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
  -- Assinatura (Frente E): só 'active' ou 'trial'
  ('assinatura pausada',     $q$update public.driver_profiles set subscription_status = 'paused' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.driver_profiles set subscription_status = 'active' where user_id = '00000000-0000-0000-0000-0000000e0001'$q$),
  -- Contato
  ('sem telefone',           $q$update public.users set phone = null where id = '00000000-0000-0000-0000-0000000e0001'$q$,
                             $q$update public.users set phone = '11999990001' where id = '00000000-0000-0000-0000-0000000e0001'$q$);

do $$
declare c record; n int := 0;
begin
  for c in select * from cases loop
    execute c.break_sql;
    if pg_temp.anon_count() <> 0 then
      raise exception 'FALHOU (3): toggle ligado e faltando "%", mas o motorista apareceu', c.label;
    end if;
    execute c.fix_sql;
    if pg_temp.anon_count() <> 1 then
      raise exception 'FALHOU (3): restaurar "%" não trouxe o motorista de volta (outro requisito o está tirando)', c.label;
    end if;
    n := n + 1;
  end loop;
  -- 'trial' também aparece (e 'active' já foi provado pela restauração acima).
  update public.driver_profiles set subscription_status = 'trial'
   where user_id = '00000000-0000-0000-0000-0000000e0001';
  if pg_temp.anon_count() <> 1 then
    raise exception 'FALHOU (3): assinatura trial deveria aparecer';
  end if;
  raise notice 'OK (3/7): % requisitos faltando, um a um — nenhum aparece; todos voltam ao restaurar; trial e active aparecem', n;
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
    'public_id','service_cities','service_neighborhoods','service_schools','service_shifts',
    'spots_available','total_count','van_model','van_photo_path'];
  -- Só as colunas de SAÍDA (modo 't'); os parâmetros de filtro (p_*) são entrada.
  r jsonb; txt text; bad text;
begin
  select array_agg(n order by n) into cols
    from pg_proc p, unnest(p.proargnames) n
   where p.oid = 'public.marketplace_listing(text,text,text,integer,student_shift,integer,integer,uuid)'::regprocedure
     and n !~ '^p_';
  if cols is distinct from expected then
    raise exception 'FALHOU (4): colunas da função % ≠ whitelist %', cols, expected;
  end if;

  r := pg_temp.anon_row();
  -- O caminho da foto da van carrega o id do motorista POR DESENHO (a policy do bucket
  -- exige a pasta = auth.uid()); o id não é coluna da função, então fora do caminho ele
  -- não pode aparecer em lugar nenhum.
  txt := (r - 'van_photo_path')::text;
  foreach bad in array array[
    'Rua Secreta', 'secreto@mkt.teste', 'CNH-999888', 'PFX-777', 'ZZZ9Z99',
    'Branca', 'Sigiloso', '0000000e0001', 'user_id'] loop
    if position(bad in txt) > 0 then
      raise exception 'FALHOU (4): dado restrito "%" vazou na linha pública: %', bad, txt;
    end if;
  end loop;
  raise notice 'OK (4/7): colunas = whitelist exato; nenhum dado restrito na linha de um motorista completo';
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
    from pg_proc where oid = 'public.marketplace_listing(text,text,text,integer,student_shift,integer,integer,uuid)'::regprocedure;
  if not sec then raise exception 'FALHOU (5): marketplace_listing não é SECURITY DEFINER'; end if;
  if cfg is null or not exists (select 1 from unnest(cfg) c where c like 'search_path=%') then
    raise exception 'FALHOU (5): marketplace_listing sem search_path fixo';
  end if;
  -- Funções INTERNAS (regra de visibilidade e helper): anon e authenticated não executam.
  if has_function_privilege('anon', 'public.marketplace_visible()', 'execute')
     or has_function_privilege('authenticated', 'public.marketplace_visible()', 'execute')
     or has_function_privilege('anon', 'public.marketplace_tokens(text)', 'execute') then
    raise exception 'FALHOU (5): função interna da vitrine executável por anon/authenticated';
  end if;
  begin
    set local role anon;
    perform 1 from public.marketplace_visible();
    reset role;
    raise exception 'FALHOU (5): anon chamou marketplace_visible() (deveria ser negado)';
  exception when insufficient_privilege then
    reset role;
  end;
  raise notice 'OK (5/7): anon não lê tabelas-base; função SECURITY DEFINER com search_path fixo; internas fechadas';
end $$;

-- O check 3 restaura cada campo com um valor simplificado (ex.: cidades = 'Mauá'). Antes
-- dos filtros, repõe o fixture A exatamente como foi criado.
update public.driver_profiles set
  service_cities = 'Mauá, Santo André', service_neighborhoods = 'Vila Assis, Centro',
  service_schools = 'EMEF Fulano', age_min = 4, age_max = 15,
  service_shifts = '{morning,afternoon}', price_min_cents = 25000, price_max_cents = 40000,
  subscription_status = 'active'
where user_id = '00000000-0000-0000-0000-0000000e0001';

-- ===========================================================================
-- CHECK 6 — filtros dentro da função. A = Mauá + Santo André / Vila Assis + Centro /
-- EMEF Fulano / 4–15 anos / manhã+tarde. B = Santo André / Jardim / Colégio Beltrano /
-- 10–17 anos / integral.
-- ===========================================================================
do $$
declare
  c record; n int := 0;
begin
  -- (filtro descrito, resultado obtido, esperado)
  for c in
    select * from (values
      ('cidade Mauá (caixa baixa)',        pg_temp.anon_names(p_city => 'mauá'),                       'Mkt Completo'),
      ('cidade Santo André',               pg_temp.anon_names(p_city => 'Santo André'),                'Mkt Completo|Mkt Segundo'),
      ('cidade inexistente',               pg_temp.anon_names(p_city => 'Atlântida'),                  ''),
      ('bairro Centro',                    pg_temp.anon_names(p_neighborhood => 'CENTRO'),             'Mkt Completo'),
      ('bairro Jardim',                    pg_temp.anon_names(p_neighborhood => 'jardim'),             'Mkt Segundo'),
      ('escola EMEF Fulano',               pg_temp.anon_names(p_school => 'emef fulano'),              'Mkt Completo'),
      ('escola Colégio Beltrano',          pg_temp.anon_names(p_school => 'Colégio Beltrano'),         'Mkt Segundo'),
      ('idade 3 (fora de todos)',          pg_temp.anon_names(p_age => 3),                             ''),
      ('idade 4 (borda mínima de A)',      pg_temp.anon_names(p_age => 4),                             'Mkt Completo'),
      ('idade 12 (A e B)',                 pg_temp.anon_names(p_age => 12),                            'Mkt Completo|Mkt Segundo'),
      ('idade 17 (borda máxima de B)',     pg_temp.anon_names(p_age => 17),                            'Mkt Segundo'),
      ('idade 18 (fora de todos)',         pg_temp.anon_names(p_age => 18),                            ''),
      ('turno manhã',                      pg_temp.anon_names(p_shift => 'morning'),                   'Mkt Completo'),
      ('turno integral',                   pg_temp.anon_names(p_shift => 'integral'),                  'Mkt Segundo'),
      ('combinado: Santo André + integral',pg_temp.anon_names(p_city => 'Santo André', p_shift => 'integral'), 'Mkt Segundo'),
      ('combinado: Santo André + idade 5', pg_temp.anon_names(p_city => 'Santo André', p_age => 5),   'Mkt Completo'),
      ('combinado sem interseção',         pg_temp.anon_names(p_city => 'Mauá', p_shift => 'integral'), ''),
      ('filtro só de espaços = sem filtro',pg_temp.anon_names(p_city => '   '),                       'Mkt Completo|Mkt Segundo')
    ) as t(descr, got, want)
  loop
    if c.got is distinct from c.want then
      raise exception 'FALHOU (6): filtro "%" devolveu [%] (esperado [%])', c.descr, c.got, c.want;
    end if;
    n := n + 1;
  end loop;
  raise notice 'OK (6/7): % combinações de filtro aplicadas dentro da função', n;
end $$;

-- ===========================================================================
-- CHECK 7 — paginação dentro da função, telefone só no perfil, opções dos filtros.
-- ===========================================================================
do $$
declare
  r1 record; r2 record; r3 record; k int; opts text; ph text;
begin
  set local role anon;

  -- limit 1 / offset 0 e 1 sobre "Santo André" (A e B): páginas diferentes, total = 2.
  select * into r1 from public.marketplace_listing(p_city => 'Santo André', p_limit => 1, p_offset => 0);
  select * into r2 from public.marketplace_listing(p_city => 'Santo André', p_limit => 1, p_offset => 1);
  select count(*) into k from public.marketplace_listing(p_city => 'Santo André', p_limit => 1, p_offset => 2);
  -- limit 0 e offset negativo são saneados (piso 1; offset 0) — não quebram nem trazem a lista toda.
  select * into r3 from public.marketplace_listing(p_city => 'Santo André', p_limit => 0, p_offset => -5);
  select count(*) into k from public.marketplace_listing(p_city => 'Santo André', p_limit => 0, p_offset => -5);
  reset role;

  if r1.driver_name is distinct from 'Mkt Completo' or r2.driver_name is distinct from 'Mkt Segundo' then
    raise exception 'FALHOU (7): páginas erradas (offset 0 = %, offset 1 = %)', r1.driver_name, r2.driver_name;
  end if;
  if r1.total_count <> 2 or r2.total_count <> 2 then
    raise exception 'FALHOU (7): total_count esperado 2, veio % / %', r1.total_count, r2.total_count;
  end if;
  if k <> 1 or r3.driver_name is distinct from 'Mkt Completo' then
    raise exception 'FALHOU (7): limit 0 / offset negativo não foram saneados (linhas=%, primeiro=%)', k, r3.driver_name;
  end if;

  -- Além do fim: nenhuma linha.
  set local role anon;
  select count(*) into k from public.marketplace_listing(p_city => 'Santo André', p_limit => 1, p_offset => 2);
  -- Teto do limit: pedir 1000 nunca devolve mais que 50 (aqui só há poucos, então só não pode quebrar).
  select count(*) into k from public.marketplace_listing(p_limit => 1000) m where m.driver_name like 'Mkt %';
  reset role;
  if k <> 2 then raise exception 'FALHOU (7): limit 1000 devolveu % motoristas de teste (esperado 2)', k; end if;

  -- Telefone: nulo na listagem, presente no perfil.
  set local role anon;
  select m.phone into ph from public.marketplace_listing(p_city => 'Mauá') m where m.driver_name = 'Mkt Completo';
  reset role;
  if ph is not null then raise exception 'FALHOU (7): telefone na listagem'; end if;
  if pg_temp.anon_row('00000000-0000-0000-0000-0000000e0002') ->> 'phone' is distinct from '11999990002' then
    raise exception 'FALHOU (7): telefone ausente no modo perfil';
  end if;

  -- Opções dos filtros: vêm só de motoristas visíveis (e um pausado/oculto não contribui).
  set local role anon;
  select string_agg(o.kind || ':' || o.value || '=' || o.driver_count, '|' order by o.kind, o.value) into opts
    from public.marketplace_filter_options() o
   where o.value in ('Mauá', 'Santo André', 'Jardim', 'Centro');
  reset role;
  if opts is distinct from 'city:Mauá=1|city:Santo André=2|neighborhood:Centro=1|neighborhood:Jardim=1' then
    raise exception 'FALHOU (7): opções dos filtros inesperadas: %', opts;
  end if;
  update public.driver_profiles set marketplace_listed = false where user_id = '00000000-0000-0000-0000-0000000e0002';
  set local role anon;
  select count(*) into k from public.marketplace_filter_options() o where o.value = 'Jardim';
  reset role;
  if k <> 0 then raise exception 'FALHOU (7): opção de motorista oculto vazou nas opções dos filtros'; end if;

  raise notice 'OK (7/7): paginação (limit/offset/total/saneamento), telefone só no perfil, opções só de visíveis';
end $$;

do $$ begin raise exception 'RESULTADO: MARKETPLACE VIEW PASSOU (7/7)'; end $$;

rollback;
