-- Ocorrência + aviso ao pai (register_occurrence, migrations 014/015/067).
-- Prova: (1) o responsável vinculado a um aluno da rota recebe 1 aviso GENÉRICO in-app (sem a nota do motorista, sem nome de
-- criança, sem localização); (2) responsável sem aluno na rota e o próprio motorista não recebem; (3) o responsável NÃO lê a
-- tabela occurrences (nem a nota); (4) só o motorista dono da execução registra; (5) a nota é gravada e truncada em 200.
-- Roda no SQL Editor com 1 aluno vinculado a um responsável e 1 segundo responsável; cria dados de teste e reverte no fim.
-- Resultado esperado: "RESULTADO: ocorrencia_notificacao_pai PASSOU".
do $$
declare
  v_student uuid; v_guard uuid; v_driver uuid; v_guard2 uuid; v_other uuid;
  v_route uuid; v_exec uuid; v_occ uuid; n integer; v_ok boolean; v_body text; v_txt text;
begin
  select gs.student_id, gs.guardian_id, s.driver_id into v_student, v_guard, v_driver
    from guardian_student gs join students s on s.id = gs.student_id order by gs.student_id limit 1;
  select user_id into v_guard2 from guardians where user_id <> v_guard order by user_id limit 1;
  select user_id into v_other from driver_profiles where user_id <> v_driver order by user_id limit 1;
  if v_student is null or v_guard2 is null or v_other is null then raise exception 'FALHOU 0: precisa de 1 aluno vinculado, 2 responsáveis e 2 motoristas'; end if;
  perform set_config('kangu.consent_internal', '1', true);
  update students set consent_status = 'authorized', status = 'active' where id = v_student;
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE ocorrência', 'both', 'morning', '{1}') returning id into v_route;
  insert into route_stops (route_id, student_id, position, kind) values (v_route, v_student, 1, 'pickup');
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_route, sp_today(), 'pickup', 'in_progress', now()) returning id into v_exec;

  -- (4) outro motorista não registra
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform register_occurrence(v_exec, 'delay', 'x'); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 4: outro motorista não podia registrar ocorrência'; end if;

  -- (1) o dono registra, com nota longa e sensível
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_occ := register_occurrence(v_exec, 'traffic', 'SEGREDO-NOTA ' || repeat('z', 300));
  reset role;
  select char_length(note) into n from occurrences where id = v_occ;
  if n <> 200 then raise exception 'FALHOU 5: nota deveria ser gravada truncada em 200 (veio %)', n; end if;

  select count(*) into n from notifications where user_id = v_guard and metadata ->> 'occurrence_id' = v_occ::text;
  if n <> 1 then raise exception 'FALHOU 1a: o responsável vinculado deveria receber 1 aviso (veio %)', n; end if;
  select body, title || ' ' || coalesce(body, '') || ' ' || metadata::text into v_body, v_txt
    from notifications where user_id = v_guard and metadata ->> 'occurrence_id' = v_occ::text;
  if v_body <> 'A sua rota de hoje está enfrentando trânsito.' then raise exception 'FALHOU 1b: texto genérico esperado (veio %)', v_body; end if;
  if v_txt ilike '%SEGREDO%' or v_txt ~* '(lat|lng|aluno|crian)' then raise exception 'FALHOU 1c: o aviso não pode carregar a nota, nome de criança nem localização: %', v_txt; end if;

  -- (2) não vinculados e o motorista não recebem
  select count(*) into n from notifications where metadata ->> 'occurrence_id' = v_occ::text and user_id in (v_guard2, v_driver, v_other);
  if n <> 0 then raise exception 'FALHOU 2: só responsáveis vinculados recebem (% outros)', n; end if;

  -- (3) o responsável não lê occurrences
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from occurrences;
  reset role;
  if n <> 0 then raise exception 'FALHOU 3: o responsável não pode ler occurrences (% linhas)', n; end if;

  raise exception 'RESULTADO: ocorrencia_notificacao_pai PASSOU';
end $$;
