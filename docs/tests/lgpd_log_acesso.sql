-- Teste da migration 058 (log legal de acesso, 6 meses, por sessão). Roda no SQL Editor; sempre reverte no fim.
-- Resultado esperado: "RESULTADO: lgpd_log_acesso PASSOU".
do $$
declare
  n integer;
  v_u uuid := gen_random_uuid();
  v_ok boolean;
begin
  -- 1. visitante (sem sessão): grava 1 registro público
  perform log_app_access('198.51.100.10');
  select count(*) into n from app_access_log where ip = '198.51.100.10' and user_id is null and area = 'public';
  if n <> 1 then raise exception 'FALHOU 1: visitante deveria gerar 1 registro público'; end if;

  -- 2. mesma sessão (mesmo IP, sem usuário) dentro de 6 h: não grava de novo
  perform log_app_access('198.51.100.10');
  select count(*) into n from app_access_log where ip = '198.51.100.10';
  if n <> 1 then raise exception 'FALHOU 2: repetição dentro de 6 h não podia gravar'; end if;

  -- 3. usuário logado no mesmo IP: registro novo, com o usuário e área authenticated
  perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  perform log_app_access('198.51.100.10');
  select count(*) into n from app_access_log where ip = '198.51.100.10' and user_id = v_u and area = 'authenticated';
  if n <> 1 then raise exception 'FALHOU 3: usuário logado deveria gerar 1 registro authenticated'; end if;
  perform log_app_access('198.51.100.10');
  select count(*) into n from app_access_log where ip = '198.51.100.10' and user_id = v_u;
  if n <> 1 then raise exception 'FALHOU 4: repetição do usuário dentro de 6 h não podia gravar'; end if;
  perform set_config('request.jwt.claims', '', true);

  -- 5. IP inválido, bloco CIDR e vazio não gravam
  select count(*) into n from app_access_log;
  perform log_app_access('unknown');
  perform log_app_access('10.0.0.0/8');
  perform log_app_access('');
  perform log_app_access(null);
  if (select count(*) from app_access_log) <> n then raise exception 'FALHOU 5: IP inválido não podia gravar'; end if;

  -- 6. renovação: sessão contínua há mais de 6 h grava um novo registro
  insert into app_access_log (at, ip, user_id, area) values (now() - interval '7 hours', '198.51.100.20', null, 'public');
  perform log_app_access('198.51.100.20');
  select count(*) into n from app_access_log where ip = '198.51.100.20';
  if n <> 2 then raise exception 'FALHOU 6: após 6 h deveria renovar (2 registros), achou %', n; end if;

  -- 7. trava de inundação: com 2000 registros na última hora, IP novo não grava
  insert into app_access_log (ip, area) select ('203.0.113.' || (g % 250 + 1))::inet, 'public' from generate_series(1, 2000) g;
  perform log_app_access('198.51.100.99');
  select count(*) into n from app_access_log where ip = '198.51.100.99';
  if n <> 0 then raise exception 'FALHOU 7: a trava de inundação deveria impedir a gravação'; end if;

  -- 8. retenção: registro com mais de 6 meses é apagado; o recente fica
  insert into app_access_log (at, ip, area) values (now() - interval '7 months', '192.0.2.200', 'public');
  perform purge_app_access_log();
  select count(*) into n from app_access_log where ip = '192.0.2.200';
  if n <> 0 then raise exception 'FALHOU 8: registro de 7 meses deveria ter sido apagado'; end if;
  select count(*) into n from app_access_log where ip = '198.51.100.10';
  if n < 1 then raise exception 'FALHOU 9: registro recente não podia ser apagado'; end if;

  -- 9. job agendado
  select count(*) into n from cron.job where jobname = 'kangu_purge_app_access_log';
  if n <> 1 then raise exception 'FALHOU 10: job de limpeza de 6 meses não agendado'; end if;

  -- 10. usuário comum não lê, não altera e não apaga o log
  set local role authenticated;
  v_ok := false;
  begin perform 1 from app_access_log limit 1; exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 11: authenticated não podia ler o log'; end if;
  v_ok := false;
  begin delete from app_access_log; exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 12: authenticated não podia apagar o log'; end if;
  v_ok := false;
  begin update app_access_log set ip = '1.1.1.1'; exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 13: authenticated não podia alterar o log'; end if;
  reset role;

  raise exception 'RESULTADO: lgpd_log_acesso PASSOU';
end $$;
