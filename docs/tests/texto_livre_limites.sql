-- Teste da migration 067 (F2: texto livre que poderia coletar dado de saúde/deficiência).
-- Prova: (1) limite de tamanho NO BANCO em occurrences.note (200), route_exceptions.reason (120) e
-- erasure_requests.note (300); as funções truncam em vez de falhar; (2) quem lê cada campo: occurrences.note só o motorista
-- autor (responsável vinculado, outro motorista e anônimo NÃO leem; o aviso ao pai é genérico); route_exceptions.reason só o
-- motorista dono; erasure_requests.note só o responsável que pediu; (3) a anonimização zera occurrences.note das execuções de
-- que a criança participou e preserva as de outras rotas; (4) o motivo livre do pedido de exclusão é zerado quando o pedido é
-- resolvido (concedido ou negado), e a decisão do admin permanece.
-- Roda no SQL Editor com 1 motorista e 1 responsável já existentes; cria dados de teste e reverte no fim.
-- Resultado esperado: "RESULTADO: texto_livre_limites PASSOU".
do $$
declare
  v_driver uuid; v_other uuid; v_guard uuid; v_guard2 uuid; v_admin uuid := gen_random_uuid();
  sA uuid := gen_random_uuid(); sB uuid := gen_random_uuid(); sX uuid := gen_random_uuid();
  rA uuid; rX uuid; eA uuid; eX uuid; oA uuid; oX uuid; reqA uuid; reqB uuid;
  n integer; v_ok boolean; v_note text; r json;
begin
  select user_id into v_driver from driver_profiles order by user_id limit 1;
  select user_id into v_other from driver_profiles where user_id <> v_driver order by user_id limit 1;
  select user_id into v_guard from guardians order by user_id limit 1;
  select user_id into v_guard2 from guardians where user_id <> v_guard order by user_id limit 1;
  if v_driver is null or v_other is null or v_guard is null or v_guard2 is null then
    raise exception 'FALHOU 0: precisa de 2 motoristas e 2 responsáveis';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'adm-f2@teste.kangu', '{"role":"driver","full_name":"Adm F2"}'::jsonb, now(), now());
  insert into public.admin_users (user_id) values (v_admin);

  perform set_config('kangu.consent_internal', '1', true);
  insert into students (id, driver_id, full_name, status) values (sA, v_driver, 'TESTE A', 'active'), (sB, v_driver, 'TESTE B', 'active'), (sX, v_driver, 'TESTE X', 'active');
  update students set consent_status = 'authorized' where id in (sA, sB, sX);
  insert into guardian_student (guardian_id, student_id) values (v_guard, sA), (v_guard, sB);
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE F2 A', 'both', 'morning', '{1}') returning id into rA;
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE F2 X', 'both', 'morning', '{1}') returning id into rX;
  insert into route_stops (route_id, student_id, position, kind) values (rA, sA, 1, 'pickup'), (rX, sX, 1, 'pickup');
  -- execuções de ONTEM (concluídas): sA participou de eA; sX, de eX
  insert into route_executions (route_id, service_date, leg, status, started_at, ended_at) values (rA, sp_today() - 1, 'pickup', 'completed', now() - interval '1 day', now() - interval '23 hours') returning id into eA;
  insert into route_executions (route_id, service_date, leg, status, started_at, ended_at) values (rX, sp_today() - 1, 'pickup', 'completed', now() - interval '1 day', now() - interval '23 hours') returning id into eX;
  insert into route_events (execution_id, student_id, type) values (eA, sA, 'embarked'), (eX, sX, 'embarked');

  -- (1) limites no banco
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  oA := register_occurrence(eA, 'delay', repeat('a', 500));
  oX := register_occurrence(eX, 'delay', 'nota da outra rota');
  reset role;
  select char_length(note) into n from occurrences where id = oA;
  if n <> 200 then raise exception 'FALHOU 1a: a função deveria truncar a nota em 200 (veio %)', n; end if;
  v_ok := false;
  begin insert into occurrences (execution_id, driver_id, type, note) values (eA, v_driver, 'delay', repeat('b', 201)); exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 1b: o banco deveria recusar nota > 200'; end if;
  v_ok := false;
  begin insert into route_exceptions (route_id, date, kind, reason) values (rA, sp_today() + 3, 'skip', repeat('c', 121)); exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 1c: o banco deveria recusar motivo > 120'; end if;
  insert into route_exceptions (route_id, date, kind, reason) values (rA, sp_today() + 3, 'skip', repeat('c', 120));
  v_ok := false;
  begin insert into erasure_requests (student_id, requested_by, note) values (sA, v_guard2, repeat('d', 301)); exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 1d: o banco deveria recusar motivo de exclusão > 300'; end if;

  -- (2) quem lê cada campo
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from occurrences where id = oA and note is not null;
  reset role;
  if n <> 1 then raise exception 'FALHOU 2a: o motorista autor deveria ler a própria nota'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from occurrences;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2b: responsável com filho na execução não pode ler occurrences (% linhas)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from occurrences where id in (oA, oX);
  select count(*) + n into n from route_exceptions where route_id = rA;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2c: outro motorista não pode ler ocorrência nem motivo de dia (% linhas)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from route_exceptions;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2d: responsável não lê route_exceptions'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from route_exceptions where route_id = rA and reason is not null;
  reset role;
  if n <> 1 then raise exception 'FALHOU 2e: o motorista dono deveria ler o motivo do dia'; end if;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from occurrences;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2f: anônimo não podia ler occurrences (% linhas)', n; end if;

  -- pedido de exclusão: só o responsável que pediu lê o motivo
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform request_erasure(sA, repeat('e', 500));
  perform request_erasure(sB, 'motivo B');
  select id, char_length(note) into reqA, n from erasure_requests where student_id = sA and requested_by = v_guard;
  select id into reqB from erasure_requests where student_id = sB and requested_by = v_guard;
  reset role;
  if n <> 300 then raise exception 'FALHOU 2g: request_erasure deveria truncar o motivo em 300 (veio %)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from erasure_requests;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2h: outro responsável não lê o pedido alheio'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from erasure_requests;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2i: motorista não lê pedido de exclusão'; end if;

  -- (4) resolver o pedido zera o motivo livre (concedido e negado); a decisão do admin permanece
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_decide_erasure(reqB, false, 'negado por teste');
  reset role;
  select count(*) into n from erasure_requests where id = reqB and status = 'denied' and note is null and decision_note = 'negado por teste';
  if n <> 1 then raise exception 'FALHOU 4a: pedido negado deveria ter o motivo zerado e a decisão mantida'; end if;

  -- (3)+(4) conceder: a criança A (execução de ontem, fora de trânsito) é excluída e as notas de ocorrência dela somem
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_decide_erasure(reqA, true, 'ok');
  reset role;
  select count(*) into n from erasure_requests where id = reqA and status = 'granted' and note is null;
  if n <> 1 then raise exception 'FALHOU 4b: pedido concedido deveria ter o motivo zerado'; end if;
  select count(*) into n from students where id = sA and anonymized_at is not null;
  if n <> 1 then raise exception 'FALHOU 3a: a criança A deveria estar excluída (veio %)', r; end if;
  select count(*) into n from occurrences where id = oA and note is null;
  if n <> 1 then raise exception 'FALHOU 3b: a nota da ocorrência da execução de A deveria ter sido zerada'; end if;
  select count(*) into n from occurrences where id = oX and note = 'nota da outra rota';
  if n <> 1 then raise exception 'FALHOU 3c: a nota de outra rota não podia ser apagada'; end if;
  select count(*) into n from occurrences where id = oA;
  if n <> 1 then raise exception 'FALHOU 3d: a ocorrência em si (tipo e hora) deve permanecer'; end if;

  raise exception 'RESULTADO: texto_livre_limites PASSOU';
end $$;
