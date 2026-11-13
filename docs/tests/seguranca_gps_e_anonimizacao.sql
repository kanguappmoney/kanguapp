-- Fatia E (E4 + E5): GPS apagado ao fim da rota, e anonimização sem abrir dado nem tocar nos registros legais.
-- E4: (1) a posição da van só é lida pelo responsável vinculado à execução (e só em modo Mapa) e pelo motorista dono; responsável
--     não vinculado, outro motorista e anônimo não leem; (2) ao encerrar a rota a posição é apagada; (3) reabrir a rota NÃO a
--     restaura (a posição só volta pelo envio normal, em rota in_progress).
-- E5: (4) depois de anonimizar o aluno, o ex-responsável não lê o aluno, a fatura, o convite nem a submissão dele, mas segue lendo
--     a própria autorização (evidência do titular); (5) a anonimização não toca app_access_log nem retention_exceptions; (6) o
--     ledger registra a exclusão; (7) a faixa de datas das faturas do aluno permanece (esqueleto financeiro) sem dado pessoal.
-- Roda no SQL Editor com 1 motorista e 2 responsáveis já existentes; reverte no fim.
-- Resultado esperado: "RESULTADO: seguranca_gps_e_anonimizacao PASSOU".
create function pg_temp.cnt(p_role text, p_uid uuid, p_sql text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  begin execute p_sql into n; exception when insufficient_privilege then n := 0; end;
  reset role;
  return n;
end $$;

do $$
declare
  v_d uuid; v_o uuid; gA uuid; gB uuid; sA uuid := gen_random_uuid(); rA uuid; eA uuid; n integer; m integer;
  v_t0 timestamptz := clock_timestamp(); log0 bigint; log1 bigint; ex0 bigint; ex1 bigint; inv uuid; v_mode parent_tracking_mode;
  chk jsonb := '{"version":"e5","sha256":"e5","snapshot":"e5","method":"remote","checks":[{"checked":true},{"checked":true}]}'::jsonb;
begin
  select user_id into v_d from driver_profiles order by user_id limit 1;
  select user_id into v_o from driver_profiles where user_id <> v_d order by user_id limit 1;
  select user_id into gA from guardians order by user_id limit 1;
  select user_id into gB from guardians where user_id <> gA order by user_id limit 1;
  if v_d is null or v_o is null or gA is null or gB is null then raise exception 'FALHOU 0: precisa de 2 motoristas e 2 responsáveis'; end if;
  select parent_tracking_mode into v_mode from driver_profiles where user_id = v_d;
  update driver_profiles set parent_tracking_mode = 'map' where user_id = v_d;

  perform set_config('kangu.consent_internal', '1', true);
  insert into students (id, driver_id, full_name, status) values (sA, v_d, 'ANON-A', 'active');
  update students set consent_status = 'authorized' where id = sA;
  insert into guardian_student (guardian_id, student_id) values (gA, sA);
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_d, 'TESTE E4', 'both', 'morning', '{1}') returning id into rA;
  insert into route_stops (route_id, student_id, position, kind) values (rA, sA, 1, 'pickup');
  insert into route_executions (route_id, service_date, leg, status, started_at) values (rA, sp_today() - 1, 'pickup', 'in_progress', now() - interval '1 day') returning id into eA;
  -- execução "de ontem": a anonimização de hoje não enxerga trânsito; a posição fictícia nasce com a execução em andamento
  update route_executions set service_date = sp_today() where id = eA;
  insert into live_positions (execution_id, lat, lng) values (eA, -23.6, -46.4);

  -- E4 (1): quem lê a posição
  n := pg_temp.cnt('authenticated', gA, 'select count(*) from live_positions where execution_id = ''' || eA || '''');
  if n <> 1 then raise exception 'FALHOU E4.1a: o responsável vinculado deveria ler a posição em modo Mapa (veio %)', n; end if;
  n := pg_temp.cnt('authenticated', gB, 'select count(*) from live_positions where execution_id = ''' || eA || '''')
     + pg_temp.cnt('authenticated', v_o, 'select count(*) from live_positions where execution_id = ''' || eA || '''')
     + pg_temp.cnt('anon', null, 'select count(*) from live_positions where execution_id = ''' || eA || '''');
  if n <> 0 then raise exception 'FALHOU E4.1b: responsável não vinculado, outro motorista e anônimo não podem ler a posição (% linhas)', n; end if;
  n := pg_temp.cnt('authenticated', v_d, 'select count(*) from live_positions where execution_id = ''' || eA || '''');
  if n <> 1 then raise exception 'FALHOU E4.1c: o motorista dono deveria ler a posição'; end if;
  -- modo Linha do tempo nunca entrega a posição (G6)
  update driver_profiles set parent_tracking_mode = 'timeline' where user_id = v_d;
  n := pg_temp.cnt('authenticated', gA, 'select count(*) from live_positions where execution_id = ''' || eA || '''');
  if n <> 0 then raise exception 'FALHOU E4.1d: em modo Linha do tempo o responsável não pode ler a posição (G6)'; end if;
  update driver_profiles set parent_tracking_mode = 'map' where user_id = v_d;

  -- E4 (2): encerrar apaga; (3) reabrir não restaura
  update route_executions set status = 'completed', ended_at = now() where id = eA;
  select count(*) into n from live_positions where execution_id = eA;
  if n <> 0 then raise exception 'FALHOU E4.2: a posição deveria ter sido apagada ao encerrar a rota'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated; perform reopen_route_execution(eA); reset role;
  select count(*) into n from live_positions where execution_id = eA;
  if n <> 0 then raise exception 'FALHOU E4.3: reabrir a rota não pode restaurar a posição apagada'; end if;
  update route_executions set status = 'completed', ended_at = now() where id = eA;

  -- E5: dados de partida para a anonimização
  insert into invoices (student_id, guardian_id, driver_id, billing_period, amount_cents, due_date)
    values (sA, gA, v_d, date_trunc('month', sp_today())::date, 12345, sp_today() + 5) returning id into inv;
  insert into student_invites (student_id, driver_id, token) values (sA, v_d, 'tok-e5');
  perform public._insert_consent('child_data', gA, sA, null, chk, 'e5');
  update route_executions set service_date = sp_today() - 1 where id = eA; -- fora de "hoje": criança não está em trânsito
  select count(*) into log0 from app_access_log where at <= v_t0; select count(*) into ex0 from retention_exceptions;
  n := pg_temp.cnt('authenticated', gA, 'select count(*) from students where id = ''' || sA || '''') + pg_temp.cnt('authenticated', gA, 'select count(*) from invoices where id = ''' || inv || '''');
  if n <> 2 then raise exception 'FALHOU E5.0: antes de anonimizar o responsável deveria ler aluno e fatura (veio %)', n; end if;

  perform public._anonymize_student(sA, 'admin', 'e5', null);

  select count(*) into log1 from app_access_log where at <= v_t0; select count(*) into ex1 from retention_exceptions;
  if log1 <> log0 then raise exception 'FALHOU E5.5a: a anonimização não pode tocar app_access_log (% -> %)', log0, log1; end if;
  if ex1 <> ex0 then raise exception 'FALHOU E5.5b: a anonimização não pode tocar retention_exceptions (% -> %)', ex0, ex1; end if;
  n := pg_temp.cnt('authenticated', gA, 'select count(*) from students where id = ''' || sA || '''')
     + pg_temp.cnt('authenticated', gA, 'select count(*) from invoices where id = ''' || inv || '''')
     + pg_temp.cnt('authenticated', gA, 'select count(*) from student_invites where token = ''tok-e5''')
     + pg_temp.cnt('authenticated', gA, 'select count(*) from guardian_student where student_id = ''' || sA || '''');
  if n <> 0 then raise exception 'FALHOU E5.4a: o ex-responsável ainda lê dado da criança excluída (% linhas)', n; end if;
  n := pg_temp.cnt('authenticated', v_d, 'select count(*) from students where id = ''' || sA || '''');
  if n <> 0 then raise exception 'FALHOU E5.4b: o motorista não enxerga aluno anonimizado (consent suspenso)'; end if;
  n := pg_temp.cnt('authenticated', gA, 'select count(*) from consents where subject_user_id = ''' || gA || ''' and student_id = ''' || sA || '''');
  if n <> 1 then raise exception 'FALHOU E5.4c: a evidência de aceite do titular deveria seguir legível por ele (veio %)', n; end if;
  n := pg_temp.cnt('authenticated', gB, 'select count(*) from consents where student_id = ''' || sA || '''');
  if n <> 0 then raise exception 'FALHOU E5.4d: outro responsável não lê a evidência do titular'; end if;
  select count(*) into n from erasure_ledger where student_id = sA and reason = 'admin';
  if n <> 1 then raise exception 'FALHOU E5.6: o ledger deveria registrar a exclusão'; end if;
  select count(*) into n from invoices where id = inv and amount_cents = 12345;
  if n <> 1 then raise exception 'FALHOU E5.7: a fatura (esqueleto financeiro) deveria permanecer'; end if;
  select count(*) into n from students where id = sA and full_name = 'Aluno removido' and responsible_name is null and pickup_address is null;
  if n <> 1 then raise exception 'FALHOU E5.7b: o aluno deveria estar sem dado pessoal'; end if;

  update driver_profiles set parent_tracking_mode = v_mode where user_id = v_d;
  raise exception 'RESULTADO: seguranca_gps_e_anonimizacao PASSOU';
end $$;
