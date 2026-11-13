-- Teste da migration 065 (notificação "rota iniciada").
-- Prova: (1) ida e volta notificam só os responsáveis da perna, com o texto certo e genérico; execução legada
-- sem perna usa "O motorista iniciou a rota."; (2) ausência declarada (ida/volta/both) tira o responsável só
-- daquele trajeto; (3) aluno suspenso e aluno anonimizado não notificam; (4) idempotente: insert repetido
-- (on conflict) e update da execução não duplicam; (5) falha na notificação NUNCA impede a criação da execução
-- (simulada com um CHECK que recusa todo insert em notifications); (6) G5: outro responsável e o motorista não
-- leem o aviso, o dono do aviso lê só o seu, e ninguém insere direto em notifications.
-- Roda no SQL Editor com 2 alunos já vinculados a responsáveis diferentes e 1 terceiro responsável; reverte no fim.
-- Resultado esperado: "RESULTADO: rota_iniciada_notificacao PASSOU".
do $$
declare
  v_sa uuid; v_ga uuid; v_sb uuid; v_gb uuid; v_gc uuid; v_driver uuid;
  v_r1 uuid; v_r3 uuid; v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid;
  n integer; n0 integer; v_body text; v_ok boolean;
begin
  select gs.student_id, gs.guardian_id, s.driver_id into v_sa, v_ga, v_driver
    from guardian_student gs join students s on s.id = gs.student_id order by gs.student_id limit 1;
  select gs.student_id, gs.guardian_id into v_sb, v_gb
    from guardian_student gs where gs.guardian_id <> v_ga and gs.student_id <> v_sa order by gs.student_id limit 1;
  select user_id into v_gc from guardians where user_id not in (v_ga, v_gb) limit 1;
  if v_sa is null or v_sb is null or v_gc is null then raise exception 'FALHOU 0: precisa de 2 alunos com responsáveis diferentes e 1 terceiro responsável'; end if;

  perform set_config('kangu.consent_internal', '1', true);
  update students set consent_status = 'authorized', status = 'active', anonymized_at = null where id in (v_sa, v_sb);

  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE notif', 'both', 'morning', '{1}') returning id into v_r1;
  insert into route_stops (route_id, student_id, position, kind) values
    (v_r1, v_sa, 1, 'pickup'), (v_r1, v_sb, 2, 'pickup'), (v_r1, v_sa, 1, 'dropoff'), (v_r1, v_sb, 2, 'dropoff');
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE notif legada', 'outbound', 'morning', '{1}') returning id into v_r3;
  insert into route_stops (route_id, student_id, position, kind) values (v_r3, v_sb, 1, 'pickup');

  -- (2) ausência de B só na ida (outbound)
  insert into absences (student_id, service_date, leg) values (v_sb, sp_today(), 'outbound');

  -- (1)(2) IDA: só A recebe (B ausente na ida); C e o motorista não
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_r1, sp_today(), 'pickup', 'in_progress', now()) returning id into v_e1;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e1::text and user_id = v_ga;
  if n <> 1 then raise exception 'FALHOU 1a: A deveria receber 1 aviso da ida (veio %)', n; end if;
  select body into v_body from notifications where metadata ->> 'execution_id' = v_e1::text and user_id = v_ga;
  if v_body <> 'O motorista iniciou a rota de ida.' then raise exception 'FALHOU 1b: texto da ida errado: %', v_body; end if;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e1::text and user_id = v_gb;
  if n <> 0 then raise exception 'FALHOU 2a: B ausente na ida não pode receber'; end if;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e1::text and user_id in (v_gc, v_driver);
  if n <> 0 then raise exception 'FALHOU 1c: terceiro responsável e motorista não recebem'; end if;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e1::text;
  if n <> 1 then raise exception 'FALHOU 1d: só 1 aviso esperado na ida (veio %)', n; end if;

  -- genérico: sem nome de criança, nem localização
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e1::text
     and (title || ' ' || coalesce(body, '') || ' ' || metadata::text) ~* '(lat|lng|aluno|crian|rua )';
  if n <> 0 then raise exception 'FALHOU 1e: aviso não pode carregar dado de criança/localização'; end if;

  -- (3) VOLTA com A suspenso: só B recebe (a ausência de B era só da ida)
  update students set consent_status = 'suspended' where id = v_sa;
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_r1, sp_today(), 'dropoff', 'in_progress', now()) returning id into v_e2;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e2::text and user_id = v_gb;
  if n <> 1 then raise exception 'FALHOU 1f: B deveria receber o aviso da volta (veio %)', n; end if;
  select body into v_body from notifications where metadata ->> 'execution_id' = v_e2::text and user_id = v_gb;
  if v_body <> 'O motorista iniciou a rota de volta.' then raise exception 'FALHOU 1g: texto da volta errado: %', v_body; end if;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e2::text and user_id = v_ga;
  if n <> 0 then raise exception 'FALHOU 3a: aluno suspenso não pode notificar o responsável'; end if;

  -- (2) execução legada sem perna usa a direção da rota: a ausência de B na ida (outbound) vale aqui também
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_r3, sp_today(), null, 'in_progress', now()) returning id into v_e4;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e4::text;
  if n <> 0 then raise exception 'FALHOU 2b: ausência de B (ida) deveria valer na execução legada de ida'; end if;

  -- (1) execução legada sem perna, em outro dia (sem ausência): texto sem ida/volta
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_r3, sp_today() + 1, null, 'in_progress', now()) returning id into v_e3;
  select body into v_body from notifications where metadata ->> 'execution_id' = v_e3::text and user_id = v_gb;
  if v_body is distinct from 'O motorista iniciou a rota.' then raise exception 'FALHOU 1h: texto legado errado: %', v_body; end if;

  -- (3) aluno anonimizado não notifica (outro dia, mesma rota legada)
  update students set anonymized_at = now() where id = v_sb;
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_r3, sp_today() + 2, null, 'in_progress', now()) returning id into v_e4;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e4::text;
  if n <> 0 then raise exception 'FALHOU 3b: aluno anonimizado não pode notificar'; end if;
  update students set anonymized_at = null where id = v_sb;

  -- (4) idempotência: insert repetido (conflito) e update da execução não duplicam
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_r1, sp_today(), 'pickup', 'in_progress', now()) on conflict do nothing;
  update route_executions set started_at = now() where id = v_e1;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e1::text;
  if n <> 1 then raise exception 'FALHOU 4: aviso duplicado (veio %)', n; end if;

  -- (6) G5: C e o motorista não leem; A lê o seu; ninguém insere direto
  perform set_config('request.jwt.claims', json_build_object('sub', v_gc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from notifications where metadata ->> 'execution_id' in (v_e1::text, v_e2::text, v_e3::text);
  reset role;
  if n <> 0 then raise exception 'FALHOU 6a: terceiro responsável leu aviso alheio (%)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from notifications where metadata ->> 'execution_id' in (v_e1::text, v_e2::text, v_e3::text);
  reset role;
  if n <> 0 then raise exception 'FALHOU 6b: motorista leu aviso de responsável (%)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ga, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from notifications where metadata ->> 'execution_id' in (v_e1::text, v_e2::text, v_e3::text);
  v_ok := false;
  begin insert into notifications (user_id, title, body, channel) values (v_ga, 'x', 'y', 'in_app'); exception when others then v_ok := true; end;
  reset role;
  if n <> 1 then raise exception 'FALHOU 6c: A deveria ler só o próprio aviso (veio %)', n; end if;
  if not v_ok then raise exception 'FALHOU 6d: insert direto em notifications deveria ser recusado'; end if;

  -- (5) falha na notificação nunca impede a execução: CHECK que recusa todo insert novo em notifications
  alter table notifications add constraint zz_teste_falha check (title = '__nunca__') not valid;
  update students set consent_status = 'authorized' where id = v_sa;
  insert into route_executions (route_id, service_date, leg, status, started_at) values (v_r1, sp_today() + 1, 'pickup', 'in_progress', now()) returning id into v_e5;
  alter table notifications drop constraint zz_teste_falha;
  select count(*) into n from route_executions where id = v_e5 and status = 'in_progress';
  if n <> 1 then raise exception 'FALHOU 5a: a execução precisa nascer mesmo com falha na notificação'; end if;
  select count(*) into n from notifications where metadata ->> 'execution_id' = v_e5::text;
  if n <> 0 then raise exception 'FALHOU 5b: com a falha simulada não deveria haver aviso (veio %)', n; end if;

  raise exception 'RESULTADO: rota_iniciada_notificacao PASSOU';
end $$;
