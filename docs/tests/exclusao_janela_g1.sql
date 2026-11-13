-- Teste da migration 066 (F1: janela da G1 na exclusão/anonimização).
-- Prova: criança que HOJE (America/Sao_Paulo) embarcou e ainda não desembarcou, ou está em perna in_progress, não é
-- anonimizada nem excluída; o job diário pula e processa depois; admin_erase_student e admin_decide_erasure NÃO levantam
-- erro, registram a exclusão adiada (erasure_deferred) e avisam "adiada até o fim do dia por segurança da criança";
-- a criança segue nas paradas da volta; ao desembarcar, ou no dia seguinte, é excluída com o motivo certo; criança fora de
-- trânsito é excluída na hora; só admin chama admin_erase_student. A G2 (trigger de paradas congeladas) não é tocada.
-- Roda no SQL Editor com 1 motorista já existente; cria alunos/rotas de teste e reverte no fim.
-- Resultado esperado: "RESULTADO: exclusao_janela_g1 PASSOU".
do $$
declare
  v_driver uuid; v_admin uuid := gen_random_uuid();
  sA uuid := gen_random_uuid(); sB uuid := gen_random_uuid(); sC uuid := gen_random_uuid();
  sD uuid := gen_random_uuid(); sE uuid := gen_random_uuid(); sF uuid := gen_random_uuid();
  rA uuid; rB uuid; rD uuid; rE uuid; rF uuid; eF uuid; eA1 uuid; eA2 uuid; eB uuid; eD uuid; eE uuid;
  r json; n integer; v_ok boolean; v_req uuid; v_guard uuid; rr text;
begin
  select user_id into v_driver from driver_profiles limit 1;
  select user_id into v_guard from guardians limit 1;
  if v_driver is null or v_guard is null then raise exception 'FALHOU 0: precisa de 1 motorista e 1 responsável'; end if;

  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'adm-f1@teste.kangu', '{"role":"driver","full_name":"Adm F1"}'::jsonb, now(), now());
  insert into public.admin_users (user_id) values (v_admin);

  perform set_config('kangu.consent_internal', '1', true);
  insert into students (id, driver_id, full_name, status) values
    (sA, v_driver, 'TESTE A', 'active'), (sB, v_driver, 'TESTE B', 'active'), (sC, v_driver, 'TESTE C', 'active'),
    (sD, v_driver, 'TESTE D', 'active'), (sE, v_driver, 'TESTE E', 'active'), (sF, v_driver, 'TESTE F', 'active');
  update students set consent_status = 'authorized' where id in (sA, sB, sC, sD, sE, sF);

  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE F1 A', 'both', 'morning', '{1}') returning id into rA;
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE F1 B', 'both', 'morning', '{1}') returning id into rB;
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE F1 D', 'both', 'morning', '{1}') returning id into rD;
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE F1 E', 'both', 'morning', '{1}') returning id into rE;
  insert into route_stops (route_id, student_id, position, kind) values
    (rA, sA, 1, 'pickup'), (rA, sA, 1, 'dropoff'), (rB, sB, 1, 'pickup'), (rD, sD, 1, 'pickup'), (rE, sE, 1, 'pickup');

  -- (1) Caso da G1: embarcou na ida, ida encerrada, volta não iniciada
  insert into route_executions (route_id, service_date, leg, status, started_at, ended_at) values (rA, sp_today(), 'pickup', 'completed', now() - interval '2 hours', now() - interval '1 hour') returning id into eA1;
  insert into route_events (execution_id, student_id, type) values (eA1, sA, 'embarked');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_erase_student(sA, 'pedido teste');
  reset role;
  if (r ->> 'deferred')::boolean is not true or (r ->> 'message') not like '%adiada até o fim do dia por segurança da criança%' then
    raise exception 'FALHOU 1a: admin_erase_student deveria adiar e avisar (veio %)', r;
  end if;
  select count(*) into n from students where id = sA and anonymized_at is null and full_name = 'TESTE A';
  if n <> 1 then raise exception 'FALHOU 1b: a criança em trânsito não podia ser anonimizada'; end if;
  select count(*) into n from erasure_deferred where student_id = sA and reason = 'admin';
  if n <> 1 then raise exception 'FALHOU 1c: a exclusão adiada deveria estar registrada'; end if;
  select count(*) into n from erasure_ledger where student_id = sA;
  if n <> 0 then raise exception 'FALHOU 1d: nada deveria ter sido gravado no ledger ainda'; end if;
  select count(*) into n from route_stops where student_id = sA and kind = 'dropoff';
  if n <> 1 then raise exception 'FALHOU 1e: a criança deveria seguir na lista da volta'; end if;

  -- o job pula (continua em trânsito) e a volta em andamento também segura
  perform anonymize_due_students();
  select count(*) into n from students where id = sA and anonymized_at is null;
  if n <> 1 then raise exception 'FALHOU 1f: o job não podia anonimizar a criança em trânsito'; end if;
  insert into route_executions (route_id, service_date, leg, status, started_at) values (rA, sp_today(), 'dropoff', 'in_progress', now()) returning id into eA2;
  perform anonymize_due_students();
  select count(*) into n from students where id = sA and anonymized_at is null;
  if n <> 1 then raise exception 'FALHOU 1g: com a volta in_progress a criança segue protegida'; end if;
  select count(*) into n from route_stops where student_id = sA and kind = 'dropoff';
  if n <> 1 then raise exception 'FALHOU 1h: a parada da volta não podia sumir durante a volta'; end if;

  -- desembarcou e a volta encerrou: o job exclui, com o motivo e o detalhe do pedido
  insert into route_events (execution_id, student_id, type) values (eA2, sA, 'disembarked');
  update route_executions set status = 'completed', ended_at = now() where id = eA2;
  perform anonymize_due_students();
  select count(*) into n from students where id = sA and anonymized_at is not null and full_name = 'Aluno removido';
  if n <> 1 then raise exception 'FALHOU 1i: depois de desembarcar a criança deveria ser excluída'; end if;
  select count(*) into n from erasure_ledger where student_id = sA and reason = 'admin' and detail = 'pedido teste';
  if n <> 1 then raise exception 'FALHOU 1j: o ledger deveria registrar admin + detalhe'; end if;
  select count(*) into n from erasure_deferred where student_id = sA;
  if n <> 0 then raise exception 'FALHOU 1k: o adiamento deveria ter sido consumido'; end if;
  select count(*) into n from route_stops where student_id = sA;
  if n <> 0 then raise exception 'FALHOU 1l: as paradas deveriam ter sido removidas ao excluir'; end if;
  select count(*) into n from route_events where id in (select id from route_events where execution_id = eA1) and student_id = sA;
  if n <> 0 then raise exception 'FALHOU 1m: o embarque deveria ter perdido o vínculo com a criança'; end if;

  -- (2) Dia seguinte: o mesmo embarque, agora de ontem, não protege mais
  insert into route_executions (route_id, service_date, leg, status, started_at, ended_at) values (rB, sp_today(), 'pickup', 'completed', now() - interval '2 hours', now() - interval '1 hour') returning id into eB;
  insert into route_events (execution_id, student_id, type) values (eB, sB, 'embarked');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_erase_student(sB, null);
  reset role;
  if (r ->> 'deferred')::boolean is not true then raise exception 'FALHOU 2a: deveria adiar (veio %)', r; end if;
  update route_executions set service_date = sp_today() - 1 where id = eB;
  perform anonymize_due_students();
  select count(*) into n from students where id = sB and anonymized_at is not null;
  if n <> 1 then raise exception 'FALHOU 2b: no dia seguinte a criança deveria ser excluída'; end if;

  -- (3) Fora de trânsito: exclusão imediata, sem adiar
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_erase_student(sC, 'imediata');
  reset role;
  if (r ->> 'deferred')::boolean is not false then raise exception 'FALHOU 3a: criança fora de trânsito deveria ser excluída na hora (veio %)', r; end if;
  select count(*) into n from students where id = sC and anonymized_at is not null;
  if n <> 1 then raise exception 'FALHOU 3b: a criança deveria estar anonimizada'; end if;

  -- (4) Perna in_progress (sem evento de embarque) também protege
  insert into route_executions (route_id, service_date, leg, status, started_at) values (rD, sp_today(), 'pickup', 'in_progress', now()) returning id into eD;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_erase_student(sD, null);
  reset role;
  if (r ->> 'deferred')::boolean is not true then raise exception 'FALHOU 4a: perna in_progress deveria adiar (veio %)', r; end if;
  perform anonymize_due_students();
  select count(*) into n from students where id = sD and anonymized_at is null;
  if n <> 1 then raise exception 'FALHOU 4b: criança em perna in_progress não podia ser excluída'; end if;
  update route_executions set status = 'completed', ended_at = now() where id = eD;
  perform anonymize_due_students();
  select count(*) into n from students where id = sD and anonymized_at is not null;
  if n <> 1 then raise exception 'FALHOU 4c: depois de encerrar a perna a criança deveria ser excluída'; end if;

  -- (5) Retenção de 30 dias: o job também pula quem está em trânsito e processa no dia seguinte
  insert into route_executions (route_id, service_date, leg, status, started_at, ended_at) values (rE, sp_today(), 'pickup', 'completed', now() - interval '2 hours', now() - interval '1 hour') returning id into eE;
  insert into route_events (execution_id, student_id, type) values (eE, sE, 'embarked');
  update students set status = 'archived', purge_after = now() - interval '1 day' where id = sE;
  perform anonymize_due_students();
  select count(*) into n from students where id = sE and anonymized_at is null;
  if n <> 1 then raise exception 'FALHOU 5a: a retenção também não podia excluir criança em trânsito'; end if;
  update route_executions set service_date = sp_today() - 1 where id = eE;
  perform anonymize_due_students();
  select count(*) into n from students where id = sE and anonymized_at is not null;
  if n <> 1 then raise exception 'FALHOU 5b: no dia seguinte a retenção deveria excluir'; end if;
  select count(*) into n from erasure_ledger where student_id = sE and reason = 'retention_30d';
  if n <> 1 then raise exception 'FALHOU 5c: o ledger deveria registrar retention_30d'; end if;

  -- (6) Pedido do responsável concedido pelo admin com a criança em trânsito: concede, adia e avisa
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE F1 F', 'both', 'morning', '{1}') returning id into rF;
  insert into route_executions (route_id, service_date, leg, status, started_at, ended_at) values (rF, sp_today(), 'pickup', 'completed', now() - interval '2 hours', now() - interval '1 hour') returning id into eF;
  insert into route_events (execution_id, student_id, type) values (eF, sF, 'embarked');
  insert into erasure_requests (student_id, requested_by, note) values (sF, v_guard, 'quero apagar') returning id into v_req;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_decide_erasure(v_req, true, 'ok');
  reset role;
  if (r ->> 'deferred')::boolean is not true or (r ->> 'message') not like '%adiada até o fim do dia%' then
    raise exception 'FALHOU 6a: conceder com a criança em trânsito deveria adiar e avisar (veio %)', r;
  end if;
  select count(*) into n from erasure_requests where id = v_req and status = 'granted' and decision_note like '%adiada até o fim do dia%';
  if n <> 1 then raise exception 'FALHOU 6b: o pedido deveria constar como concedido, com o aviso no registro'; end if;
  select count(*) into n from students where id = sF and anonymized_at is null;
  if n <> 1 then raise exception 'FALHOU 6c: a criança não podia ser excluída ainda'; end if;
  select count(*) into n from erasure_deferred where student_id = sF and reason = 'subject_request';
  if n <> 1 then raise exception 'FALHOU 6d: adiamento com o motivo do pedido do responsável'; end if;

  -- (7) Só admin chama admin_erase_student
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform admin_erase_student(sF, null); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 7: não-admin não podia excluir'; end if;

  raise exception 'RESULTADO: exclusao_janela_g1 PASSOU';
end $$;
