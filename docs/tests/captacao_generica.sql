-- ATENÇÃO (2026-11-10): DESATUALIZADO. Chama submit_capture sem autorização (exigida desde a migration 059) e com a assinatura anterior à 063. Não usar como regressão; cobertura atual: lgpd_consentimento, lgpd_retencao_exclusao, escola_endereco_partes.
-- ===========================================================================
-- Marketplace, Frente E.1 — link de captação GENÉRICO e opt-in (migration 039).
-- Prova:
--   (1) forma: link 'scoped' exige turno+escola; 'generic' exige que sejam nulos;
--   (2) no máximo UM link genérico ATIVO por motorista (revogar libera um novo);
--   (3) submit_capture pelo link genérico exige escola E turno e grava o que o pai
--       informou na fila `pending`; a prévia pública diz kind = generic;
--   (4) pelo link TRAVADO, escola/turno enviados pelo pai são DESCARTADOS (o contexto é do link);
--   (5) link genérico revogado recusa o envio;
--   (6) aprovação: genérico -> aluno com a escola/turno do pai; travado -> os do link;
--   (7) vitrine: `request_token` só no modo perfil, só do genérico ATIVO — nunca o de um
--       link travado; some ao revogar; nulo na listagem.
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional: termina em exceção
-- 'RESULTADO: ... PASSOU' (visível no SQL Editor) e ROLLBACK.
-- APLICAR as migrations 037, 038 e 039 ANTES de rodar.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-0000000a0011');
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-0000000a0011');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0011', 'authenticated', 'authenticated', 'driver-g@teste.kangu', '{"role":"driver","full_name":"Mkt Generico"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0011', 'authenticated', 'authenticated', 'pai-g@teste.kangu',    '{"role":"guardian","full_name":"Pai Generico"}'::jsonb, now(), now());

-- Motorista COMPLETO e listado na vitrine (para o check 7).
update public.users set phone = '11999990011' where id = '00000000-0000-0000-0000-0000000e0011';
update public.driver_profiles set
  service_cities = 'Mauá', service_neighborhoods = 'Centro', service_schools = 'Escola A',
  age_min = 4, age_max = 15, service_shifts = '{morning}',
  price_min_cents = 25000, price_max_cents = 40000,
  van_photo_path = '00000000-0000-0000-0000-0000000e0011/van-1', marketplace_listed = true
where user_id = '00000000-0000-0000-0000-0000000e0011';
insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix)
values ('00000000-0000-0000-0000-0000000e0011', 'Van G', 'GGG1G11', 12, 'Van G', 2022, 'Branca', 'PFX-G');

-- Link TRAVADO (o de sempre) + primeiro genérico.
insert into capture_links (id, driver_id, kind, shift, school, token, status) values
  ('00000000-0000-0000-0000-0000000c2001', '00000000-0000-0000-0000-0000000e0011', 'scoped',  'morning', 'Escola A', 'tok-scoped', 'active'),
  ('00000000-0000-0000-0000-0000000c2002', '00000000-0000-0000-0000-0000000e0011', 'generic', null,      null,       'tok-g1',     'active');

-- ===========================================================================
-- CHECK 1 — forma de cada tipo (check constraint).
-- ===========================================================================
do $$
declare a boolean := false; b boolean := false;
begin
  begin
    insert into capture_links (driver_id, kind, shift, school, token)
    values ('00000000-0000-0000-0000-0000000e0011', 'scoped', null, null, 'tok-bad-1');
  exception when check_violation then a := true; end;
  begin
    insert into capture_links (driver_id, kind, shift, school, token, status)
    values ('00000000-0000-0000-0000-0000000e0011', 'generic', 'morning', 'Escola X', 'tok-bad-2', 'revoked');
  exception when check_violation then b := true; end;
  if not a then raise exception 'FALHOU (1): link travado sem turno/escola foi aceito'; end if;
  if not b then raise exception 'FALHOU (1): link genérico com turno/escola foi aceito'; end if;
  raise notice 'OK (1/7): forma de cada tipo imposta pelo banco';
end $$;

-- ===========================================================================
-- CHECK 2 — um genérico ATIVO por motorista; revogar libera outro.
-- ===========================================================================
do $$
declare dup boolean := false; n int;
begin
  begin
    insert into capture_links (driver_id, kind, token)
    values ('00000000-0000-0000-0000-0000000e0011', 'generic', 'tok-dup');
  exception when unique_violation then dup := true; end;
  if not dup then raise exception 'FALHOU (2): dois genéricos ativos para o mesmo motorista'; end if;

  update capture_links set status = 'revoked' where token = 'tok-g1';
  insert into capture_links (id, driver_id, kind, token)
  values ('00000000-0000-0000-0000-0000000c2003', '00000000-0000-0000-0000-0000000e0011', 'generic', 'tok-g2');

  select count(*) into n from capture_links
   where driver_id = '00000000-0000-0000-0000-0000000e0011' and kind = 'generic' and status = 'active';
  if n <> 1 then raise exception 'FALHOU (2): esperado 1 genérico ativo, veio %', n; end if;
  raise notice 'OK (2/7): um genérico ativo por motorista; revogar libera um novo (token novo)';
end $$;

-- ===========================================================================
-- CHECK 3 — envio pelo genérico: escola E turno obrigatórios; fila pending com os dados do pai.
-- ===========================================================================
do $$
declare no_school boolean := false; no_shift boolean := false; s record; prev json;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0011', 'role', 'authenticated')::text, true);

  begin
    perform submit_capture(p_token := 'tok-g2', p_child_full_name := 'Filho Sem Escola',
      p_child_birth_date := null, p_pickup_address := 'Rua 1', p_dropoff_same := true, p_dropoff_address := null,
      p_responsible_phone := null, p_responsible_whatsapp := null,
      p_school := '   ', p_shift := 'afternoon');
  exception when others then no_school := true; end;
  begin
    perform submit_capture(p_token := 'tok-g2', p_child_full_name := 'Filho Sem Turno',
      p_child_birth_date := null, p_pickup_address := 'Rua 1', p_dropoff_same := true, p_dropoff_address := null,
      p_responsible_phone := null, p_responsible_whatsapp := null,
      p_school := 'Colégio Beltrano', p_shift := null);
  exception when others then no_shift := true; end;

  perform submit_capture(p_token := 'tok-g2', p_child_full_name := 'Filho Generico',
    p_child_birth_date := date '2018-03-03', p_pickup_address := 'Rua Casa, 10', p_dropoff_same := true,
    p_dropoff_address := null, p_responsible_phone := '11999990011', p_responsible_whatsapp := null,
    p_school := '  Colégio Beltrano ', p_shift := 'afternoon');
  reset role;

  if not no_school then raise exception 'FALHOU (3): aceitou link genérico sem escola'; end if;
  if not no_shift  then raise exception 'FALHOU (3): aceitou link genérico sem turno'; end if;

  select * into s from capture_submissions where child_full_name = 'Filho Generico';
  if s.status <> 'pending' or s.child_school <> 'Colégio Beltrano' or s.child_shift <> 'afternoon' then
    raise exception 'FALHOU (3): submissão genérica incorreta (status=%, escola=%, turno=%)', s.status, s.child_school, s.child_shift;
  end if;
  if exists (select 1 from capture_submissions where child_full_name in ('Filho Sem Escola', 'Filho Sem Turno')) then
    raise exception 'FALHOU (3): envio recusado deixou linha na fila';
  end if;

  prev := get_capture_link_preview('tok-g2');
  if prev->>'kind' <> 'generic' or prev->>'shift' is not null or prev->>'school' is not null then
    raise exception 'FALHOU (3): prévia do link genérico incorreta: %', prev;
  end if;
  raise notice 'OK (3/7): genérico exige escola e turno; fila pending com os dados do pai; prévia kind=generic';
end $$;

-- ===========================================================================
-- CHECK 4 — link TRAVADO: escola/turno vindos do pai são descartados.
-- ===========================================================================
do $$
declare s record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0011', 'role', 'authenticated')::text, true);
  perform submit_capture(p_token := 'tok-scoped', p_child_full_name := 'Filho Travado',
    p_child_birth_date := null, p_pickup_address := 'Rua Casa, 20', p_dropoff_same := true,
    p_dropoff_address := null, p_responsible_phone := null, p_responsible_whatsapp := null,
    p_school := 'Escola Trocada', p_shift := 'afternoon');
  reset role;
  select * into s from capture_submissions where child_full_name = 'Filho Travado';
  if s.child_school is not null or s.child_shift is not null then
    raise exception 'FALHOU (4): link travado guardou escola/turno do pai (%, %)', s.child_school, s.child_shift;
  end if;
  raise notice 'OK (4/7): link travado descarta escola/turno enviados pelo pai';
end $$;

-- ===========================================================================
-- CHECK 5 — genérico revogado recusa o envio.
-- ===========================================================================
do $$
declare barrou boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0011', 'role', 'authenticated')::text, true);
  begin
    perform submit_capture(p_token := 'tok-g1', p_child_full_name := 'Filho Revogado',
      p_child_birth_date := null, p_pickup_address := 'Rua 1', p_dropoff_same := true, p_dropoff_address := null,
      p_responsible_phone := null, p_responsible_whatsapp := null,
      p_school := 'Escola A', p_shift := 'morning');
  exception when others then barrou := true; end;
  reset role;
  if not barrou then raise exception 'FALHOU (5): link genérico revogado aceitou envio'; end if;
  if exists (select 1 from capture_submissions where child_full_name = 'Filho Revogado') then
    raise exception 'FALHOU (5): envio recusado criou submissão';
  end if;
  raise notice 'OK (5/7): genérico revogado recusa o envio';
end $$;

-- ===========================================================================
-- CHECK 6 — aprovação: genérico usa escola/turno do pai; travado usa os do link.
-- ===========================================================================
do $$
declare g uuid; t uuid; sg record; st record;
begin
  select id into g from capture_submissions where child_full_name = 'Filho Generico';
  select id into t from capture_submissions where child_full_name = 'Filho Travado';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000e0011', 'role', 'authenticated')::text, true);
  perform approve_capture(g);
  perform approve_capture(t);
  reset role;

  select * into sg from students where full_name = 'Filho Generico';
  select * into st from students where full_name = 'Filho Travado';
  if sg.school <> 'Colégio Beltrano' or sg.shift <> 'afternoon' or sg.status <> 'active' then
    raise exception 'FALHOU (6): aluno do genérico com escola/turno errados (%, %)', sg.school, sg.shift;
  end if;
  if st.school <> 'Escola A' or st.shift <> 'morning' then
    raise exception 'FALHOU (6): aluno do travado deveria ter a escola/turno do LINK (%, %)', st.school, st.shift;
  end if;
  if not exists (select 1 from guardian_student gs where gs.student_id = sg.id
                   and gs.guardian_id = '00000000-0000-0000-0000-0000000a0011') then
    raise exception 'FALHOU (6): responsável não foi vinculado ao aluno do genérico';
  end if;
  raise notice 'OK (6/7): aprovação do genérico usa o que o pai informou; travado segue usando o link';
end $$;

-- ===========================================================================
-- CHECK 7 — vitrine: request_token só no perfil, só do genérico ATIVO.
-- ===========================================================================
do $$
declare pid uuid; tok text; n int; list_tok text;
begin
  select public_id into pid from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e0011';

  set local role anon;
  select m.request_token into tok from public.marketplace_listing(p_public_id => pid) m;
  select count(*) into n from public.marketplace_listing(p_public_id => pid) m;
  select m.request_token into list_tok from public.marketplace_listing(p_city => 'Mauá', p_limit => 50) m
   where m.driver_name = 'Mkt Generico';
  reset role;
  if n <> 1 then raise exception 'FALHOU (7): motorista do fixture não aparece na vitrine'; end if;
  if tok is distinct from 'tok-g2' then
    raise exception 'FALHOU (7): token do perfil deveria ser o do genérico ativo (tok-g2), veio %', tok;
  end if;
  if list_tok is not null then raise exception 'FALHOU (7): token vazou na listagem'; end if;

  -- Revogado o genérico: o token some (e o do link travado, ainda ativo, NÃO toma o lugar).
  update capture_links set status = 'revoked' where token = 'tok-g2';
  set local role anon;
  select m.request_token into tok from public.marketplace_listing(p_public_id => pid) m;
  reset role;
  if tok is not null then raise exception 'FALHOU (7): token apareceu sem genérico ativo (veio %)', tok; end if;

  raise notice 'OK (7/7): request_token só no perfil e só do genérico ativo; some ao revogar; nunca o do travado';
end $$;

do $$ begin raise exception 'RESULTADO: CAPTACAO GENERICA PASSOU (7/7)'; end $$;

rollback;
