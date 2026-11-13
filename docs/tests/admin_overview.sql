-- ===========================================================================
-- Admin, Visão Geral (parte 1) — `admin_overview(p_days)` (migration 041).
-- Método BASELINE-DELTA: lê a visão geral ANTES, cria um fixture conhecido e confere que
-- cada número subiu exatamente o esperado (independe dos dados reais já no banco).
--   (1) anon e não-admin são recusados (42501 / "Acesso negado."); o admin lê;
--   (2) cards: motoristas por status, perfil completo, na vitrine, responsáveis ATIVOS
--       (≥1 aluno ativo vinculado — quem só tem aluno arquivado ou nenhum NÃO conta),
--       alunos ativos;
--   (3) série dos últimos 30 dias: 6 baldes, os novos entram no último;
--   (4) funil do período: buscas → pedidos pelo link GENÉRICO (pedido de link travado não
--       entra) → aprovados/rejeitados/pendentes; período 7 × 30 dias separa as linhas;
--   (5) ranking de cidades/escolas: agrupa sem diferença de maiúsculas e respeita o período;
--   (6) a saída é só agregado (nenhum nome, e-mail ou telefone no JSON).
--
-- Rodar como role privilegiado (SQL Editor). Termina em exceção 'RESULTADO: ... PASSOU' e ROLLBACK.
-- APLICAR as migrations 037–041 ANTES de rodar.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000e0041', '00000000-0000-0000-0000-0000000e0042',
  '00000000-0000-0000-0000-0000000e0043', '00000000-0000-0000-0000-0000000a0051',
  '00000000-0000-0000-0000-0000000a0052', '00000000-0000-0000-0000-0000000a0053');
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000e0041', '00000000-0000-0000-0000-0000000e0042',
  '00000000-0000-0000-0000-0000000e0043', '00000000-0000-0000-0000-0000000a0051',
  '00000000-0000-0000-0000-0000000a0052', '00000000-0000-0000-0000-0000000a0053');

-- Admin primeiro (precisa existir para ler o BASELINE).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0041', 'authenticated', 'authenticated', 'adm-ov@teste.kangu', '{"role":"driver","full_name":"Ov Admin"}'::jsonb, now() - interval '60 days', now());
-- Fixture (migration 059): o motorista de teste concede o consentimento da vitrine/pedidos que a trava exige. Nenhuma asserção foi alterada.
select public._insert_consent(k, u.id, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture')
  from auth.users u cross join unnest(array['marketplace_listing','marketplace_requests']) k
 where u.raw_user_meta_data ->> 'role' = 'driver' and u.email ~ '(teste\.kangu|\.teste)$'
   and not exists (select 1 from public.consents c where c.subject_user_id = u.id and c.kind = k and c.revoked_at is null);

insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000e0041');
-- O admin é "antigo" (60 dias): fora dos baldes de 30 dias.
update public.users set created_at = now() - interval '60 days' where id = '00000000-0000-0000-0000-0000000e0041';

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

create function pg_temp.ov(p_days integer) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000e0041', 'role', 'authenticated')::text, true);
  select public.admin_overview(p_days) into r;
  reset role;
  return r;
end $$;

-- Rótulo→contagem de um ranking (jsonb array) sem diferença de maiúsculas.
create function pg_temp.rank_count(p_arr jsonb, p_label text) returns int
language sql as $$
  select coalesce(sum((x->>'count')::int), 0)::int from jsonb_array_elements(p_arr) x
   where lower(x->>'label') = lower(p_label);
$$;

create temp table base (d7 jsonb, d30 jsonb);
insert into base values (pg_temp.ov(7), pg_temp.ov(30));

-- ===========================================================================
-- CHECK 1 — acesso.
-- ===========================================================================
do $$
declare r1 text; r2 text; r3 text;
begin
  r1 := pg_temp.try_as('anon', null, 'select public.admin_overview(30)');
  r2 := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000a0099', 'select public.admin_overview(30)');
  if r1 not like '42501:%' then raise exception 'FALHOU (1): anon não foi negado: %', r1; end if;
  if r2 <> '42501:Acesso negado.' then raise exception 'FALHOU (1): não-admin não recebeu "Acesso negado.": %', r2; end if;
  if (select d30->>'period_days' from base) <> '30' or (select d7->>'period_days' from base) <> '7' then
    raise exception 'FALHOU (1): period_days incorreto';
  end if;
  -- valor fora de 7/30 vira 30
  if pg_temp.ov(90)->>'period_days' <> '30' then raise exception 'FALHOU (1): p_days=90 deveria virar 30'; end if;
  raise notice 'OK (1/6): anon e não-admin negados; admin lê; período 7/30 (outro → 30)';
end $$;

-- --- Fixture ---------------------------------------------------------------
-- B: motorista trial, perfil completo, listado e visível. C: pausado, incompleto.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0042', 'authenticated', 'authenticated', 'motB-ov@teste.kangu', '{"role":"driver","full_name":"Ov Mot B"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0043', 'authenticated', 'authenticated', 'motC-ov@teste.kangu', '{"role":"driver","full_name":"Ov Mot C"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0051', 'authenticated', 'authenticated', 'paiG-ov@teste.kangu', '{"role":"guardian","full_name":"Ov Pai G"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0052', 'authenticated', 'authenticated', 'paiH-ov@teste.kangu', '{"role":"guardian","full_name":"Ov Pai H"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0053', 'authenticated', 'authenticated', 'paiI-ov@teste.kangu', '{"role":"guardian","full_name":"Ov Pai I"}'::jsonb, now(), now());
-- Fixture (migration 059): o motorista de teste concede o consentimento da vitrine/pedidos que a trava exige. Nenhuma asserção foi alterada.
select public._insert_consent(k, u.id, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture')
  from auth.users u cross join unnest(array['marketplace_listing','marketplace_requests']) k
 where u.raw_user_meta_data ->> 'role' = 'driver' and u.email ~ '(teste\.kangu|\.teste)$'
   and not exists (select 1 from public.consents c where c.subject_user_id = u.id and c.kind = k and c.revoked_at is null);

update public.users set phone = '11999990042' where id = '00000000-0000-0000-0000-0000000e0042';
update public.driver_profiles set
  service_cities = 'Mauá', service_neighborhoods = 'Centro', service_schools = 'Escola A',
  age_min = 4, age_max = 15, service_shifts = '{morning}', price_min_cents = 25000, price_max_cents = 40000,
  van_photo_path = '00000000-0000-0000-0000-0000000e0042/van-1', marketplace_listed = true, subscription_status = 'trial'
where user_id = '00000000-0000-0000-0000-0000000e0042';
update public.driver_profiles set subscription_status = 'paused' where user_id = '00000000-0000-0000-0000-0000000e0043';
insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix) values
  ('00000000-0000-0000-0000-0000000e0042', 'Van B', 'OVB1B11', 12, 'Van B', 2022, 'Branca', 'PFX-OB'),
  ('00000000-0000-0000-0000-0000000e0043', 'Van C', 'OVC1C11', 10, 'Van C', 2021, '', null);

-- Alunos: S1 ativo (vinculado a G) | S2 ARQUIVADO (vinculado a H) | I sem vínculo.
insert into public.students (id, driver_id, full_name, status) values
  ('00000000-0000-0000-0000-0000005c5001', '00000000-0000-0000-0000-0000000e0042', 'Ov Aluno Ativo', 'active'),
  ('00000000-0000-0000-0000-0000005c5002', '00000000-0000-0000-0000-0000000e0042', 'Ov Aluno Arquivado', 'archived');
insert into public.guardian_student (guardian_id, student_id) values
  ('00000000-0000-0000-0000-0000000a0051', '00000000-0000-0000-0000-0000005c5001'),
  ('00000000-0000-0000-0000-0000000a0052', '00000000-0000-0000-0000-0000005c5002');

-- Pedidos: 3 pelo link GENÉRICO (pending/approved/rejected) + 1 pelo link TRAVADO (não entra no funil).
insert into capture_links (id, driver_id, kind, shift, school, token, status) values
  ('00000000-0000-0000-0000-0000000c5001', '00000000-0000-0000-0000-0000000e0042', 'generic', null, null, 'tok-ov-g', 'active'),
  ('00000000-0000-0000-0000-0000000c5002', '00000000-0000-0000-0000-0000000e0043', 'scoped', 'morning', 'Escola S', 'tok-ov-s', 'active');
insert into capture_submissions (link_id, driver_id, guardian_id, child_full_name, status, child_school, child_shift, created_at) values
  ('00000000-0000-0000-0000-0000000c5001', '00000000-0000-0000-0000-0000000e0042', '00000000-0000-0000-0000-0000000a0053', 'Ov Crianca 1', 'pending',  'Escola X', 'morning', now()),
  ('00000000-0000-0000-0000-0000000c5001', '00000000-0000-0000-0000-0000000e0042', '00000000-0000-0000-0000-0000000a0053', 'Ov Crianca 2', 'approved', 'Escola X', 'morning', now()),
  ('00000000-0000-0000-0000-0000000c5001', '00000000-0000-0000-0000-0000000e0042', '00000000-0000-0000-0000-0000000a0053', 'Ov Crianca 3', 'rejected', 'Escola X', 'morning', now()),
  ('00000000-0000-0000-0000-0000000c5002', '00000000-0000-0000-0000-0000000e0043', '00000000-0000-0000-0000-0000000a0053', 'Ov Crianca 4', 'pending',  null, null, now()),
  -- pedido genérico ANTIGO (10 dias): entra no período de 30, não no de 7.
  ('00000000-0000-0000-0000-0000000c5001', '00000000-0000-0000-0000-0000000e0042', '00000000-0000-0000-0000-0000000a0053', 'Ov Crianca 5', 'pending',  'Escola X', 'morning', now() - interval '10 days');

-- Buscas (log): 3 de "Mauá" em grafias diferentes, 1 "Santo André", 2 da escola "Escola Zeta",
-- e 1 ANTIGA (10 dias) de "Antiga" — só no período de 30.
insert into public.marketplace_search_log (city, school) values
  ('Mauá', null), ('mauá', null), ('MAUÁ', null), ('Santo André', null), (null, 'Escola Zeta'), (null, 'escola zeta');
insert into public.marketplace_search_log (city, created_at) values ('Antiga', now() - interval '10 days');

-- ===========================================================================
-- CHECK 2 — cards (delta sobre o baseline).
-- ===========================================================================
do $$
declare b jsonb := (select d30 from base); n jsonb := pg_temp.ov(30);
begin
  if (n->>'drivers_total')::int - (b->>'drivers_total')::int <> 2 then raise exception 'FALHOU (2): drivers_total delta <> 2'; end if;
  if (n#>>'{drivers_by_status,trial}')::int  - (b#>>'{drivers_by_status,trial}')::int  <> 1
  or (n#>>'{drivers_by_status,paused}')::int - (b#>>'{drivers_by_status,paused}')::int <> 1
  or (n#>>'{drivers_by_status,active}')::int - (b#>>'{drivers_by_status,active}')::int <> 0 then
    raise exception 'FALHOU (2): distribuição por status (esperado +1 trial, +1 paused, +0 active): %', n->'drivers_by_status';
  end if;
  if (n->>'profile_complete')::int - (b->>'profile_complete')::int <> 1 then raise exception 'FALHOU (2): profile_complete delta <> 1'; end if;
  if (n->>'listed_visible')::int  - (b->>'listed_visible')::int  <> 1 then raise exception 'FALHOU (2): listed_visible delta <> 1'; end if;
  if (n->>'guardians_total')::int - (b->>'guardians_total')::int <> 3 then raise exception 'FALHOU (2): guardians_total delta <> 3'; end if;
  -- ativos: G (aluno ativo) conta; H (só aluno arquivado) e I (nenhum) NÃO.
  if (n->>'guardians_active')::int - (b->>'guardians_active')::int <> 1 then
    raise exception 'FALHOU (2): guardians_active delta deveria ser 1 (só G), veio %', (n->>'guardians_active')::int - (b->>'guardians_active')::int;
  end if;
  if (n->>'students_active')::int - (b->>'students_active')::int <> 1 then raise exception 'FALHOU (2): students_active delta <> 1 (arquivado não conta)'; end if;
  raise notice 'OK (2/6): cards — motoristas por status, perfil completo, vitrine, responsáveis ativos, alunos ativos';
end $$;

-- ===========================================================================
-- CHECK 3 — série dos últimos 30 dias.
-- ===========================================================================
do $$
declare b jsonb := (select d30 from base); n jsonb := pg_temp.ov(30); lb jsonb; ln_ jsonb;
begin
  if jsonb_array_length(n->'series') <> 6 then raise exception 'FALHOU (3): série deveria ter 6 baldes, veio %', jsonb_array_length(n->'series'); end if;
  lb := b->'series'->5; ln_ := n->'series'->5;
  -- os novos entram no ÚLTIMO balde (hoje): 2 motoristas, 3 responsáveis, 2 alunos.
  if (ln_->>'drivers')::int - (lb->>'drivers')::int <> 2 or (ln_->>'guardians')::int - (lb->>'guardians')::int <> 3
     or (ln_->>'students')::int - (lb->>'students')::int <> 2 then
    raise exception 'FALHOU (3): último balde sem os novos (drivers/guardians/students): % vs %', lb, ln_;
  end if;
  -- o admin criado há 60 dias NÃO entra em nenhum balde de 30 dias (delta dos baldes 0–4 = 0).
  if (select sum((t.x->>'drivers')::int) from jsonb_array_elements(n->'series') with ordinality as t(x, i) where t.i <= 5)
     <> (select sum((t.x->>'drivers')::int) from jsonb_array_elements(b->'series') with ordinality as t(x, i) where t.i <= 5) then
    raise exception 'FALHOU (3): baldes antigos mudaram sem motivo';
  end if;
  raise notice 'OK (3/6): série de 30 dias em 6 baldes; novos no balde de hoje';
end $$;

-- ===========================================================================
-- CHECK 4 — funil e período.
-- ===========================================================================
do $$
declare b30 jsonb := (select d30 from base); b7 jsonb := (select d7 from base); n30 jsonb := pg_temp.ov(30); n7 jsonb := pg_temp.ov(7);
begin
  -- 30 dias: 6 buscas + 1 antiga = +7; pedidos genéricos: 3 de hoje + 1 antigo = +4 (o do link travado não entra)
  if (n30#>>'{funnel,searches}')::int - (b30#>>'{funnel,searches}')::int <> 7 then raise exception 'FALHOU (4): buscas 30d delta <> 7'; end if;
  if (n30#>>'{funnel,requests}')::int - (b30#>>'{funnel,requests}')::int <> 4 then raise exception 'FALHOU (4): pedidos 30d delta <> 4 (link travado não pode contar)'; end if;
  if (n30#>>'{funnel,approved}')::int - (b30#>>'{funnel,approved}')::int <> 1
  or (n30#>>'{funnel,rejected}')::int - (b30#>>'{funnel,rejected}')::int <> 1
  or (n30#>>'{funnel,pending}')::int  - (b30#>>'{funnel,pending}')::int  <> 2 then
    raise exception 'FALHOU (4): status do funil 30d (esperado +1 aprovado, +1 rejeitado, +2 pendentes): %', n30->'funnel';
  end if;
  -- 7 dias: some o que é de 10 dias atrás.
  if (n7#>>'{funnel,searches}')::int - (b7#>>'{funnel,searches}')::int <> 6 then raise exception 'FALHOU (4): buscas 7d delta <> 6'; end if;
  if (n7#>>'{funnel,requests}')::int - (b7#>>'{funnel,requests}')::int <> 3 then raise exception 'FALHOU (4): pedidos 7d delta <> 3'; end if;
  if (n7#>>'{funnel,pending}')::int - (b7#>>'{funnel,pending}')::int <> 1 then raise exception 'FALHOU (4): pendentes 7d delta <> 1'; end if;
  -- o funil é coerente: aprovados + rejeitados + pendentes = pedidos
  if (n30#>>'{funnel,approved}')::int + (n30#>>'{funnel,rejected}')::int + (n30#>>'{funnel,pending}')::int <> (n30#>>'{funnel,requests}')::int then
    raise exception 'FALHOU (4): aprovados+rejeitados+pendentes ≠ pedidos';
  end if;
  raise notice 'OK (4/6): funil buscas→pedidos(genérico)→status; período 7 × 30 dias';
end $$;

-- ===========================================================================
-- CHECK 5 — ranking sem diferença de maiúsculas, respeitando o período.
-- ===========================================================================
do $$
declare b30 jsonb := (select d30 from base); n30 jsonb := pg_temp.ov(30); n7 jsonb := pg_temp.ov(7);
begin
  if pg_temp.rank_count(n30->'top_cities', 'Mauá') - pg_temp.rank_count(b30->'top_cities', 'Mauá') <> 3 then
    raise exception 'FALHOU (5): "Mauá/mauá/MAUÁ" deveriam somar 3 numa linha só: %', n30->'top_cities';
  end if;
  if (select count(*) from jsonb_array_elements(n30->'top_cities') x where lower(x->>'label') = 'mauá') > 1 then
    raise exception 'FALHOU (5): grafias de Mauá não foram agrupadas: %', n30->'top_cities';
  end if;
  if pg_temp.rank_count(n30->'top_schools', 'Escola Zeta') - pg_temp.rank_count(b30->'top_schools', 'Escola Zeta') <> 2 then
    raise exception 'FALHOU (5): escola "Escola Zeta" deveria somar 2: %', n30->'top_schools';
  end if;
  if pg_temp.rank_count(n7->'top_cities', 'Antiga') <> 0 then raise exception 'FALHOU (5): busca de 10 dias atrás apareceu no ranking de 7 dias'; end if;
  if jsonb_array_length(n30->'top_cities') > 5 or jsonb_array_length(n30->'top_schools') > 5 then raise exception 'FALHOU (5): ranking passou de 5 linhas'; end if;
  raise notice 'OK (5/6): ranking de cidades/escolas agrupa maiúsculas e respeita o período';
end $$;

-- ===========================================================================
-- CHECK 6 — só agregado: nenhum nome/e-mail/telefone no JSON.
-- ===========================================================================
do $$
declare txt text := pg_temp.ov(30)::text; bad text;
begin
  foreach bad in array array['Ov Mot', 'Ov Pai', 'Ov Aluno', 'Ov Crianca', '@teste.kangu', '11999990042', 'tok-ov'] loop
    if position(bad in txt) > 0 then raise exception 'FALHOU (6): dado individual "%" no JSON da visão geral', bad; end if;
  end loop;
  raise notice 'OK (6/6): visão geral só tem agregados';
end $$;

do $$ begin raise exception 'RESULTADO: ADMIN OVERVIEW PASSOU (6/6)'; end $$;

rollback;
