-- ===========================================================================
-- Cobertura guiada, parte 3 — pool de bairros (`neighborhoods` + `add_neighborhood`, migration 046).
-- Prova: (1) só MOTORISTA adiciona (anon e responsável recusados); (2) normaliza (vírgula,
-- ponto-e-vírgula e quebra de linha viram espaço; espaços colapsam) e valida 2–60 caracteres;
-- (3) deduplica sem diferença de maiúsculas NA MESMA cidade e devolve o nome canônico, e a mesma
-- palavra em OUTRA cidade é outra linha; (4) escrita direta por API é negada, leitura é de
-- authenticated (anon não lê); (5) freio de 300 bairros criados por motorista.
-- Rodar como role privilegiado (SQL Editor). Termina em exceção 'RESULTADO: ... PASSOU'.
-- APLICAR as migrations 044–046 ANTES de rodar.
-- ===========================================================================

begin;

delete from public.neighborhoods where city_id in (3529401, 3547809) and name in ('Centro Teste', 'Vila Nova Teste', 'Jardim Teste');
delete from public.users where id in ('00000000-0000-0000-0000-0000000e0081', '00000000-0000-0000-0000-0000000a0081');
delete from auth.users   where id in ('00000000-0000-0000-0000-0000000e0081', '00000000-0000-0000-0000-0000000a0081');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0081', 'authenticated', 'authenticated', 'bairro-mot@teste.kangu', '{"role":"driver","full_name":"Bairro Motorista"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0081', 'authenticated', 'authenticated', 'bairro-pai@teste.kangu', '{"role":"guardian","full_name":"Bairro Pai"}'::jsonb, now(), now());

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

create function pg_temp.add(p_city integer, p_name text) returns text
language plpgsql as $$
declare r text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000e0081', 'role', 'authenticated')::text, true);
  select public.add_neighborhood(p_city, p_name) into r;
  reset role;
  return r;
end $$;

-- (1) quem pode adicionar
do $$
declare r1 text; r2 text; r3 text;
begin
  r1 := pg_temp.try_as('anon', null, 'select public.add_neighborhood(3529401, ''Centro Teste'')');
  r2 := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000a0081', 'select public.add_neighborhood(3529401, ''Centro Teste'')');
  if r1 not like '42501:%' then raise exception 'FALHOU (1): anon não negado: %', r1; end if;
  if r2 not like '42501:Apenas motoristas%' then raise exception 'FALHOU (1): responsável deveria ser recusado: %', r2; end if;
  if exists (select 1 from public.neighborhoods where name = 'Centro Teste') then raise exception 'FALHOU (1): recusa deixou linha'; end if;
  r3 := pg_temp.add(3529401, 'Centro Teste');
  if r3 <> 'Centro Teste' then raise exception 'FALHOU (1): motorista não conseguiu adicionar: %', r3; end if;
  raise notice 'OK (1/5): só motorista adiciona; anon e responsável recusados';
end $$;

-- (2) normalização e validação
do $$
declare r text; bad text; msg text;
begin
  r := pg_temp.add(3529401, '  Vila,  Nova;   Teste ' || chr(10));
  if r <> 'Vila Nova Teste' then raise exception 'FALHOU (2): normalização esperada "Vila Nova Teste", veio "%"', r; end if;
  if exists (select 1 from public.neighborhoods where name ~ '[,;\r\n]') then raise exception 'FALHOU (2): separador de cobertura vazou para o pool'; end if;
  foreach bad in array array['', ' ', 'A', repeat('x', 61), ',,,'] loop
    msg := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0081', format('select public.add_neighborhood(3529401, %L)', bad));
    if msg = 'ok' then raise exception 'FALHOU (2): nome inválido [%] foi aceito', bad; end if;
  end loop;
  msg := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0081', 'select public.add_neighborhood(1, ''Centro Fantasma'')');
  if msg = 'ok' then raise exception 'FALHOU (2): cidade inexistente aceita'; end if;
  raise notice 'OK (2/5): normaliza separadores e valida 2–60 caracteres e cidade';
end $$;

-- (3) deduplicação por cidade
do $$
declare a text; b text; c text; n int;
begin
  a := pg_temp.add(3529401, 'Jardim Teste');
  b := pg_temp.add(3529401, 'JARDIM teste');       -- mesma cidade, outra caixa → mesma linha
  c := pg_temp.add(3547809, 'Jardim Teste');       -- OUTRA cidade → outra linha
  if a <> 'Jardim Teste' or b <> 'Jardim Teste' then raise exception 'FALHOU (3): nome canônico esperado "Jardim Teste", veio "%"/"%"', a, b; end if;
  select count(*) into n from public.neighborhoods where city_id = 3529401 and lower(name) = 'jardim teste';
  if n <> 1 then raise exception 'FALHOU (3): duplicou na mesma cidade (n=%)', n; end if;
  select count(*) into n from public.neighborhoods where lower(name) = 'jardim teste';
  if n <> 2 then raise exception 'FALHOU (3): a mesma palavra em outra cidade deveria ser outra linha (n=%)', n; end if;
  raise notice 'OK (3/5): dedup sem diferença de caixa por cidade; outra cidade = outra linha';
end $$;

-- (4) leitura/escrita por API
do $$
declare w text; r_auth text; r_anon text;
begin
  foreach w in array array[
    'insert into public.neighborhoods (city_id, name) values (3529401, ''Direto'')',
    'update public.neighborhoods set name = ''X'' where city_id = 3529401',
    'delete from public.neighborhoods where city_id = 3529401'] loop
    if pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0081', w) not like '42501:%'
       or pg_temp.try_as('anon', null, w) not like '42501:%' then
      raise exception 'FALHOU (4): escrita direta não negada em [%]', w;
    end if;
  end loop;
  r_auth := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0081', 'select * from public.neighborhoods limit 1');
  r_anon := pg_temp.try_as('anon', null, 'select * from public.neighborhoods limit 1');
  if r_auth <> 'ok' then raise exception 'FALHOU (4): authenticated deveria ler o pool: %', r_auth; end if;
  if r_anon not like '42501:%' then raise exception 'FALHOU (4): anon não deveria ler o pool: %', r_anon; end if;
  raise notice 'OK (4/5): escrita direta negada; leitura só authenticated';
end $$;

-- (5) freio de 300 criados por motorista
do $$
declare msg text;
begin
  insert into public.neighborhoods (city_id, name, created_by)
  select 3550308, 'Bairro Spam ' || g, '00000000-0000-0000-0000-0000000e0081' from generate_series(1, 297) g;
  -- o motorista já criou 3 (Centro Teste, Vila Nova Teste, Jardim Teste/Mauá) + o de Santo André = 4; +297 = 301 ≥ 300
  msg := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0081', 'select public.add_neighborhood(3550308, ''Mais Um Bairro'')');
  if msg not like '%Limite de bairros%' then raise exception 'FALHOU (5): o limite de 300 não barrou: %', msg; end if;
  -- ...mas um bairro que JÁ existe continua sendo devolvido (não é criação)
  if pg_temp.add(3550308, 'bairro spam 1') <> 'Bairro Spam 1' then raise exception 'FALHOU (5): bairro existente deveria ser devolvido mesmo no limite'; end if;
  raise notice 'OK (5/5): limite de 300 bairros criados por motorista';
end $$;

do $$ begin raise exception 'RESULTADO: COBERTURA BAIRROS PASSOU (5/5)'; end $$;

rollback;
