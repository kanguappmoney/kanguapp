-- PENDENTE (E0, 2026-11-13): a asserção (6) espera a coluna 'ip' em marketplace_search_log, removida na migration 056 (o IP foi para marketplace_search_ip_log). Corrigir exige alterar a lista esperada; aguarda decisão do Abner. Fixture do consentimento (059) já ajustada.
-- ===========================================================================
-- Marketplace, Frente F — guarda da área /admin e do log de buscas (migration 040).
-- Prova no banco (cada chamada é feita COMO anon / authenticated, nunca como superusuário):
--   (1) anon NÃO executa nenhuma função admin_*; is_admin() dá false;
--   (2) usuário autenticado que não é admin (motorista e responsável) é RECUSADO com 42501
--       'Acesso negado.' em todas as funções admin_*, e is_admin() dá false;
--   (3) ninguém se promove nem espia por API: authenticated não lê/insere/atualiza/apaga em
--       `admin_users` nem em `marketplace_search_log`;
--   (4) admin (na allowlist) lê: motoristas (perfil completo?, assinatura, toggle, visível de
--       verdade, campos faltando), responsáveis e a fila de captação de TODOS os motoristas com
--       filtro de status; as colunas são o contrato exato e NENHUM dado sensível (endereço,
--       nascimento, telefone da criança/responsável) aparece;
--   (5) a fila é SOMENTE LEITURA: o admin não consegue aprovar nem rejeitar (as funções do
--       motorista seguem checando o dono);
--   (6) log de buscas: anon registra (sem cadastro), normaliza (trim, 80 caracteres, idade
--       fora de 0–30 vira nulo, branco vira nulo), a tabela só tem filtros + hora (sem IP nem
--       usuário) e só o admin lê.
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional: termina em exceção
-- 'RESULTADO: ... PASSOU' (visível no SQL Editor) e ROLLBACK.
-- APLICAR as migrations 037–040 ANTES de rodar.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000e0031', '00000000-0000-0000-0000-0000000e0032',
  '00000000-0000-0000-0000-0000000e0033', '00000000-0000-0000-0000-0000000a0031');
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000e0031', '00000000-0000-0000-0000-0000000e0032',
  '00000000-0000-0000-0000-0000000e0033', '00000000-0000-0000-0000-0000000a0031');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0031', 'authenticated', 'authenticated', 'admin-t@teste.kangu',  '{"role":"driver","full_name":"Adm Teste"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0032', 'authenticated', 'authenticated', 'motB-t@teste.kangu',   '{"role":"driver","full_name":"Adm Mot B"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0033', 'authenticated', 'authenticated', 'motC-t@teste.kangu',   '{"role":"driver","full_name":"Adm Mot C"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0031', 'authenticated', 'authenticated', 'paiG-t@teste.kangu',   '{"role":"guardian","full_name":"Adm Pai G"}'::jsonb, now(), now());
-- Fixture (migration 059): o motorista de teste concede o consentimento da vitrine/pedidos que a trava exige. Nenhuma asserção foi alterada.
select public._insert_consent(k, u.id, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture')
  from auth.users u cross join unnest(array['marketplace_listing','marketplace_requests']) k
 where u.raw_user_meta_data ->> 'role' = 'driver' and u.email ~ '(teste\.kangu|\.teste)$'
   and not exists (select 1 from public.consents c where c.subject_user_id = u.id and c.kind = k and c.revoked_at is null);


-- A é admin (semeado como o SQL Editor fará com a conta real).
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000e0031');

-- B: perfil completo, listado e visível. C: perfil INCOMPLETO (sem prefixo e sem cor), pausado.
update public.users set phone = '11999990032' where id = '00000000-0000-0000-0000-0000000e0032';
update public.users set phone = '11999990033' where id = '00000000-0000-0000-0000-0000000e0033';
update public.driver_profiles set
  service_cities = 'Mauá', service_neighborhoods = 'Centro', service_schools = 'Escola A',
  age_min = 4, age_max = 15, service_shifts = '{morning}', price_min_cents = 25000, price_max_cents = 40000,
  van_photo_path = '00000000-0000-0000-0000-0000000e0032/van-1', marketplace_listed = true,
  subscription_status = 'trial'
where user_id = '00000000-0000-0000-0000-0000000e0032';
update public.driver_profiles set marketplace_listed = true, subscription_status = 'paused'
where user_id = '00000000-0000-0000-0000-0000000e0033';
insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix) values
  ('00000000-0000-0000-0000-0000000e0032', 'Van B', 'BBB1B11', 12, 'Van B', 2022, 'Branca', 'PFX-B'),
  ('00000000-0000-0000-0000-0000000e0033', 'Van C', 'CCC1C11', 10, 'Van C', 2021, '',       null);
insert into public.students (driver_id, full_name, status) values
  ('00000000-0000-0000-0000-0000000e0032', 'Aluno Sigiloso Admin', 'active');

-- Fila: pai G tem um pedido PENDENTE no link de B e um REJEITADO no link de C (cross-motorista).
insert into capture_links (id, driver_id, kind, shift, school, token, status) values
  ('00000000-0000-0000-0000-0000000c3001', '00000000-0000-0000-0000-0000000e0032', 'scoped', 'morning',   'Escola A', 'tok-adm-b', 'active'),
  ('00000000-0000-0000-0000-0000000c3002', '00000000-0000-0000-0000-0000000e0033', 'scoped', 'afternoon', 'Escola C', 'tok-adm-c', 'active');
insert into capture_submissions (id, link_id, driver_id, guardian_id, child_full_name, child_birth_date,
                                 pickup_address, responsible_phone, status) values
  ('00000000-0000-0000-0000-0000000b3001', '00000000-0000-0000-0000-0000000c3001', '00000000-0000-0000-0000-0000000e0032',
   '00000000-0000-0000-0000-0000000a0031', 'Criança Admin Um', date '2019-04-04', 'Rua Secreta da Criança 77', '11988887777', 'pending'),
  ('00000000-0000-0000-0000-0000000b3002', '00000000-0000-0000-0000-0000000c3002', '00000000-0000-0000-0000-0000000e0033',
   '00000000-0000-0000-0000-0000000a0031', 'Criança Admin Dois', null, null, null, 'rejected');

-- --- Helpers (somem no rollback) -------------------------------------------------
-- Executa um SQL COMO <role>/<uid> e devolve 'ok' ou 'SQLSTATE:mensagem'.
create function pg_temp.try_as(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  begin
    execute p_sql;
    r := 'ok';
  exception when others then
    r := sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return r;
end $$;

-- Executa um SELECT COMO <role>/<uid> e devolve as linhas em jsonb.
create function pg_temp.rows_as(p_role text, p_uid uuid, p_sql text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s) t', p_sql) into r;
  reset role;
  return r;
end $$;

create temp table admin_fns (sql text);
insert into admin_fns values
  ('select * from public.admin_list_drivers()'),
  ('select * from public.admin_list_guardians()'),
  ('select * from public.admin_list_submissions()'),
  ('select * from public.admin_list_search_log()');

-- ===========================================================================
-- CHECK 1 — anon não executa nenhuma função admin_*; is_admin() dá false.
-- ===========================================================================
do $$
declare f record; r text; n int := 0;
begin
  for f in select * from admin_fns loop
    r := pg_temp.try_as('anon', null, f.sql);
    if r not like '42501:%' then
      raise exception 'FALHOU (1): anon conseguiu/errou diferente em [%]: %', f.sql, r;
    end if;
    n := n + 1;
  end loop;
  if (pg_temp.rows_as('anon', null, 'select public.is_admin() as v') -> 0 ->> 'v') <> 'false' then
    raise exception 'FALHOU (1): is_admin() de anon deveria ser false';
  end if;
  raise notice 'OK (1/6): anon negado em % funções admin; is_admin() = false', n;
end $$;

-- ===========================================================================
-- CHECK 2 — autenticado que NÃO é admin (motorista e responsável) é recusado.
-- ===========================================================================
do $$
declare f record; r text; u uuid; n int := 0;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000e0032'::uuid, '00000000-0000-0000-0000-0000000a0031'::uuid] loop
    for f in select * from admin_fns loop
      r := pg_temp.try_as('authenticated', u, f.sql);
      if r <> '42501:Acesso negado.' then
        raise exception 'FALHOU (2): % não-admin deveria receber "Acesso negado." em [%], veio: %', u, f.sql, r;
      end if;
      n := n + 1;
    end loop;
    if (pg_temp.rows_as('authenticated', u, 'select public.is_admin() as v') -> 0 ->> 'v') <> 'false' then
      raise exception 'FALHOU (2): is_admin() de não-admin deveria ser false';
    end if;
  end loop;
  raise notice 'OK (2/6): motorista e responsável não-admin recusados com "Acesso negado." (% chamadas)', n;
end $$;

-- ===========================================================================
-- CHECK 3 — ninguém se promove nem espia por API.
-- ===========================================================================
do $$
declare s text; r text; u uuid := '00000000-0000-0000-0000-0000000e0032'; n int := 0;
begin
  foreach s in array array[
    'insert into public.admin_users (user_id) values (''00000000-0000-0000-0000-0000000e0032'')',
    'select * from public.admin_users',
    'delete from public.admin_users',
    'select * from public.marketplace_search_log',
    'update public.marketplace_search_log set city = ''x''',
    'delete from public.marketplace_search_log',
    'insert into public.marketplace_search_log (city) values (''direto'')'
  ] loop
    foreach r in array array[pg_temp.try_as('authenticated', u, s), pg_temp.try_as('anon', null, s)] loop
      if r not like '42501:%' then
        raise exception 'FALHOU (3): acesso direto não negado em [%]: %', s, r;
      end if;
      n := n + 1;
    end loop;
  end loop;
  if exists (select 1 from public.admin_users where user_id = '00000000-0000-0000-0000-0000000e0032') then
    raise exception 'FALHOU (3): motorista comum virou admin';
  end if;
  raise notice 'OK (3/6): admin_users e marketplace_search_log fechados a anon/authenticated (% tentativas)', n;
end $$;

-- ===========================================================================
-- CHECK 4 — admin lê as 3 listas; colunas exatas; nada sensível vaza.
-- ===========================================================================
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000e0031';
  d jsonb; g jsonb; s jsonb; sp jsonb; b jsonb; c jsonb; gg jsonb; txt text; bad text;
begin
  if (pg_temp.rows_as('authenticated', a, 'select public.is_admin() as v') -> 0 ->> 'v') <> 'true' then
    raise exception 'FALHOU (4): is_admin() do admin deveria ser true';
  end if;

  -- Motoristas
  d := pg_temp.rows_as('authenticated', a, 'select * from public.admin_list_drivers()');
  select x into b from jsonb_array_elements(d) x where x->>'full_name' = 'Adm Mot B';
  select x into c from jsonb_array_elements(d) x where x->>'full_name' = 'Adm Mot C';
  if b is null or c is null then raise exception 'FALHOU (4): motoristas do fixture ausentes na lista admin'; end if;
  if (b->>'profile_complete')::boolean is not true or b->>'missing_fields' is not null
     or b->>'subscription_status' <> 'trial' or (b->>'marketplace_listed')::boolean is not true
     or (b->>'visible_on_marketplace')::boolean is not true or (b->>'active_students')::int <> 1 then
    raise exception 'FALHOU (4): linha do motorista B incorreta: %', b;
  end if;
  if (c->>'profile_complete')::boolean is not false or c->>'missing_fields' <> 'Prefixo, Cor'
     or c->>'subscription_status' <> 'paused' or (c->>'marketplace_listed')::boolean is not true
     or (c->>'visible_on_marketplace')::boolean is not false then
    raise exception 'FALHOU (4): linha do motorista C incorreta (perfil incompleto/pausado deveria estar oculto): %', c;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(b) k) is distinct from
     array['active_students','created_at','email','full_name','marketplace_listed','missing_fields','open_requests',
           'phone','profile_complete','subscription_status','user_id','visible_on_marketplace'] then
    raise exception 'FALHOU (4): colunas de admin_list_drivers mudaram: %', (select array_agg(k) from jsonb_object_keys(b) k);
  end if;

  -- Responsáveis
  g := pg_temp.rows_as('authenticated', a, 'select * from public.admin_list_guardians()');
  select x into gg from jsonb_array_elements(g) x where x->>'full_name' = 'Adm Pai G';
  if gg is null or gg->>'email' <> 'paiG-t@teste.kangu' or (gg->>'pending_requests')::int <> 1
     or (gg->>'linked_students')::int <> 0 then
    raise exception 'FALHOU (4): linha do responsável incorreta: %', gg;
  end if;

  -- Fila cross-motorista (2 motoristas, 2 status) + filtro de status
  s := pg_temp.rows_as('authenticated', a, 'select * from public.admin_list_submissions()');
  sp := pg_temp.rows_as('authenticated', a, 'select * from public.admin_list_submissions(''pending'')');
  if (select count(*) from jsonb_array_elements(s) x where x->>'guardian_name' = 'Adm Pai G') <> 2 then
    raise exception 'FALHOU (4): fila admin deveria trazer os 2 pedidos (de 2 motoristas), veio %', s;
  end if;
  if not exists (select 1 from jsonb_array_elements(s) x where x->>'driver_name' = 'Adm Mot B' and x->>'status' = 'pending')
     or not exists (select 1 from jsonb_array_elements(s) x where x->>'driver_name' = 'Adm Mot C' and x->>'status' = 'rejected') then
    raise exception 'FALHOU (4): fila admin sem o cruzamento motorista × status: %', s;
  end if;
  if (select count(*) from jsonb_array_elements(sp) x where x->>'guardian_name' = 'Adm Pai G') <> 1 then
    raise exception 'FALHOU (4): filtro status=pending deveria trazer só 1 do fixture';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(s -> 0) k) is distinct from
     array['child_name','created_at','driver_name','guardian_email','guardian_name','id','link_kind','reviewed_at',
           'school','shift','status','total_count'] then
    raise exception 'FALHOU (4): colunas de admin_list_submissions mudaram';
  end if;

  -- Nada sensível em nenhuma das três listas
  txt := d::text || g::text || s::text;
  foreach bad in array array['Rua Secreta', '11988887777', '2019-04-04', 'Sigiloso', 'tok-adm-b', 'tok-adm-c', 'token'] loop
    if position(bad in txt) > 0 then
      raise exception 'FALHOU (4): dado sensível "%" vazou nas listas admin', bad;
    end if;
  end loop;
  raise notice 'OK (4/6): admin lê motoristas, responsáveis e fila cross-motorista; colunas exatas; sem dado sensível';
end $$;

-- ===========================================================================
-- CHECK 5 — a fila é SÓ LEITURA: admin não aprova nem rejeita (isso é do motorista dono).
-- ===========================================================================
do $$
declare a uuid := '00000000-0000-0000-0000-0000000e0031'; r1 text; r2 text; st text; n int;
begin
  r1 := pg_temp.try_as('authenticated', a, 'select public.approve_capture(''00000000-0000-0000-0000-0000000b3001'')');
  r2 := pg_temp.try_as('authenticated', a, 'select public.reject_capture(''00000000-0000-0000-0000-0000000b3001'')');
  if r1 = 'ok' or r2 = 'ok' then
    raise exception 'FALHOU (5): admin conseguiu aprovar/rejeitar (approve=%, reject=%)', r1, r2;
  end if;
  select status::text into st from capture_submissions where id = '00000000-0000-0000-0000-0000000b3001';
  select count(*) into n from students where full_name = 'Criança Admin Um';
  if st <> 'pending' or n <> 0 then
    raise exception 'FALHOU (5): submissão mudou (%) ou aluno foi criado (%)', st, n;
  end if;
  raise notice 'OK (5/6): admin não aprova nem rejeita; a submissão segue pending e nenhum aluno nasce';
end $$;

-- ===========================================================================
-- CHECK 6 — log de buscas: anon registra, normaliza, só filtros + hora, só admin lê.
-- ===========================================================================
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000e0031'; r text; l jsonb; n_before int; n_after int; cols text[];
begin
  select count(*) into n_before from public.marketplace_search_log;

  r := pg_temp.try_as('anon', null,
    'select public.log_marketplace_search(''  Mauá '', ''   '', ' || quote_literal(repeat('x', 100)) || ', 99, ''integral'')');
  if r <> 'ok' then raise exception 'FALHOU (6): anon não conseguiu registrar a busca: %', r; end if;
  r := pg_temp.try_as('anon', null, 'select public.log_marketplace_search()');
  if r <> 'ok' then raise exception 'FALHOU (6): anon não registrou busca sem filtros: %', r; end if;

  select count(*) into n_after from public.marketplace_search_log;
  if n_after <> n_before + 2 then raise exception 'FALHOU (6): esperado +2 linhas no log, veio +%', n_after - n_before; end if;

  -- normalização (lido como privilegiado)
  if not exists (select 1 from public.marketplace_search_log
                  where city = 'Mauá' and neighborhood is null and char_length(school) = 80
                    and child_age is null and shift = 'integral') then
    raise exception 'FALHOU (6): log não normalizou (trim / branco→nulo / 80 chars / idade 99→nulo)';
  end if;

  -- só filtros + hora: colunas exatas da tabela (sem IP, sem usuário)
  select array_agg(column_name::text order by column_name) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'marketplace_search_log';
  if cols is distinct from array['child_age','city','created_at','id','ip','neighborhood','school','shift'] then
    raise exception 'FALHOU (6): a tabela do log tem colunas além de filtros + hora (+ ip, da 043): %', cols;
  end if;

  -- não-admin não lê; admin lê com colunas exatas
  r := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0032', 'select * from public.admin_list_search_log()');
  if r <> '42501:Acesso negado.' then raise exception 'FALHOU (6): não-admin leu o log: %', r; end if;
  l := pg_temp.rows_as('authenticated', a, 'select * from public.admin_list_search_log(5)');
  if jsonb_array_length(l) < 2 or (select array_agg(k order by k) from jsonb_object_keys(l -> 0) k) is distinct from
     array['child_age','city','created_at','neighborhood','school','shift','total_count'] then
    raise exception 'FALHOU (6): leitura admin do log com colunas/linhas inesperadas: %', l;
  end if;
  raise notice 'OK (6/6): log de buscas — anon registra, normaliza, só filtros + hora, só admin lê';
end $$;

do $$ begin raise exception 'RESULTADO: ADMIN GUARD PASSOU (6/6)'; end $$;

rollback;
