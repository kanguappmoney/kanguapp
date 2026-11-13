-- Teste da migration 064 (reabrir rota encerrada por acidente).
-- Prova: (1) só o motorista dono reabre; outro motorista e responsável são recusados; (2) só execução concluída
-- HOJE (dia anterior e já em andamento são recusadas); (3) reativa a MESMA execução, limpa ended_at e grava
-- 'execution_reopened' com o ended_at original; (4) embarques já registrados (G1) ficam intactos e nenhuma
-- execução/route_started nova nasce (então nenhum gatilho de INSERT dispara); (5) UPDATE direto completed ->
-- in_progress é recusado, inclusive pelo dono via RLS; (6) a Linha do tempo do pai volta a mostrar a rota ativa
-- e SEM "concluída" após reabrir, e volta a "concluída" se for encerrada de novo; (7) G2: paradas voltam a ficar
-- congeladas; (8) nenhuma notificação nova ao pai.
-- Roda no SQL Editor com dados já existentes (1 aluno com responsável); sempre reverte no fim.
-- Resultado esperado: "RESULTADO: reabrir_rota PASSOU".
do $$
declare
  v_student uuid; v_guard uuid; v_driver uuid; v_other uuid;
  v_route uuid; v_exec uuid; v_prev uuid; v_run uuid;
  v_ended timestamptz := now() - interval '5 minutes';
  v_emb uuid; n integer; n0 integer; n1 integer; v_ok boolean; j json; v_meta jsonb;
begin
  select gs.student_id, gs.guardian_id, s.driver_id into v_student, v_guard, v_driver
    from guardian_student gs join students s on s.id = gs.student_id limit 1;
  select user_id into v_other from driver_profiles where user_id <> v_driver limit 1;
  if v_student is null or v_other is null then raise exception 'FALHOU 0: precisa de 1 aluno vinculado e 2 motoristas'; end if;

  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE reabrir', 'both', 'morning', '{1}') returning id into v_route;
  insert into route_stops (route_id, student_id, position, kind) values (v_route, v_student, 1, 'pickup');

  -- execução de HOJE: iniciada, embarque registrado, encerrada (como o botão "Encerrar rota" faz)
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_route, sp_today(), 'pickup', 'in_progress', now() - interval '1 hour') returning id into v_exec;
  insert into route_events (execution_id, type, created_at) values (v_exec, 'route_started', now() - interval '1 hour');
  insert into route_events (execution_id, student_id, type, created_at) values (v_exec, v_student, 'embarked', now() - interval '30 minutes') returning id into v_emb;
  insert into route_events (execution_id, type, created_at) values (v_exec, 'route_ended', v_ended);
  update route_executions set status = 'completed', ended_at = v_ended where id = v_exec;

  select count(*) into n0 from notifications where user_id = v_guard;

  -- (5) update direto completed -> in_progress: recusado (superusuário e dono via RLS)
  v_ok := false;
  begin update route_executions set status = 'in_progress' where id = v_exec; exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 5a: update direto completed->in_progress deveria ser recusado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin update route_executions set status = 'in_progress' where id = v_exec; exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 5b: o dono não pode reabrir por update direto (RLS)'; end if;
  select count(*) into n from route_executions where id = v_exec and status = 'completed';
  if n <> 1 then raise exception 'FALHOU 5c: a execução deveria seguir concluída'; end if;

  -- (6a) concluída não aparece como ativa para o pai
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := get_active_journey();
  reset role;
  if j is not null and (j ->> 'execution_id')::uuid = v_exec then raise exception 'FALHOU 6a: execução concluída não pode aparecer como jornada ativa'; end if;

  -- (1) outro motorista e o responsável não reabrem
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform reopen_route_execution(v_exec); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 1a: outro motorista não pode reabrir'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform reopen_route_execution(v_exec); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 1b: responsável não pode reabrir'; end if;
  select count(*) into n from route_executions where id = v_exec and status = 'completed';
  if n <> 1 then raise exception 'FALHOU 1c: tentativas recusadas não podem alterar a execução'; end if;

  -- (2) execução de dia anterior concluída: recusada
  insert into route_executions (route_id, service_date, leg, status, started_at, ended_at) values (v_route, sp_today() - 1, 'pickup', 'completed', now() - interval '1 day', now() - interval '1 day') returning id into v_prev;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform reopen_route_execution(v_prev); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 2a: execução de dia anterior não pode ser reaberta'; end if;

  -- (3)(4) dono reabre no mesmo dia
  select count(*) into n1 from route_executions where route_id = v_route;
  set local role authenticated;
  perform reopen_route_execution(v_exec);
  reset role;
  select count(*) into n from route_executions where id = v_exec and status = 'in_progress' and ended_at is null;
  if n <> 1 then raise exception 'FALHOU 3a: a mesma execução deveria voltar a in_progress com ended_at limpo'; end if;
  select count(*) into n from route_executions where route_id = v_route;
  if n <> n1 then raise exception 'FALHOU 3b: reabrir não pode criar execução nova'; end if;
  select metadata into v_meta from route_events where execution_id = v_exec and type = 'execution_reopened';
  if v_meta is null or (v_meta ->> 'previous_ended_at')::timestamptz <> v_ended or v_meta ->> 'previous_status' <> 'completed' then
    raise exception 'FALHOU 3c: evento de auditoria sem o ended_at original (%)', v_meta;
  end if;
  select count(*) into n from route_events where id = v_emb and execution_id = v_exec and student_id = v_student and type = 'embarked';
  if n <> 1 then raise exception 'FALHOU 4a: o embarque registrado (G1) deveria estar intacto'; end if;
  select count(*) into n from route_events where execution_id = v_exec and type = 'route_started';
  if n <> 1 then raise exception 'FALHOU 4b: reabrir não pode gravar outro route_started'; end if;

  -- (2b) já em andamento: recusada
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform reopen_route_execution(v_exec); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 2b: execução em andamento não pode ser reaberta'; end if;

  -- (6b) pai vê a rota ativa e NÃO concluída
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := get_active_journey();
  reset role;
  if j is null or (j ->> 'execution_id')::uuid <> v_exec then raise exception 'FALHOU 6b: pai deveria ver a execução reaberta como ativa'; end if;
  if (j ->> 'ended')::boolean then raise exception 'FALHOU 6c: rota reaberta não pode aparecer como concluída para o pai'; end if;
  if (j -> 'children' -> 0 ->> 'state') <> 'boarded' then raise exception 'FALHOU 6d: o embarque registrado deveria seguir aparecendo'; end if;

  -- (6e) encerrar de novo volta a "concluída" na Linha do tempo
  insert into route_events (execution_id, type, created_at) values (v_exec, 'route_ended', clock_timestamp());
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := get_active_journey();
  reset role;
  if not (j ->> 'ended')::boolean then raise exception 'FALHOU 6e: novo encerramento deveria voltar a ser concluída'; end if;

  -- (7) G2: com a execução em andamento as paradas ficam congeladas
  v_ok := false;
  begin insert into route_stops (route_id, student_id, position, kind) values (v_route, v_student, 2, 'dropoff'); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 7: G2 — paradas deveriam estar congeladas após reabrir'; end if;

  -- (8) nenhuma notificação nova
  select count(*) into n from notifications where user_id = v_guard;
  if n <> n0 then raise exception 'FALHOU 8: reabrir não pode notificar o pai (antes %, depois %)', n0, n; end if;

  raise exception 'RESULTADO: reabrir_rota PASSOU';
end $$;
