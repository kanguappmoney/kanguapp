-- Teste das migrations 055–057 (LGPD: retenção do GPS, log de IP separado, registro de exceções).
-- Roda no SQL Editor. Sempre termina com raise exception (reverte tudo): nada fica no banco.
-- Resultado esperado: "RESULTADO: lgpd_retencao PASSOU". Qualquer "FALHOU n" indica o ponto que quebrou.
do $$
declare
  v_driver uuid;
  v_route  uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid;
  n integer;
  v_ok boolean;
begin
  select driver_id into v_driver from routes limit 1;
  insert into routes (driver_id, name, direction, shift, weekdays)
    values (v_driver, 'TESTE lgpd', 'both', 'morning', '{1}') returning id into v_route;

  -- GPS 1: posição existe enquanto a rota está em andamento
  insert into route_executions (route_id, service_date, leg, status, started_at)
    values (v_route, current_date, 'pickup', 'in_progress', now()) returning id into v_e1;
  insert into live_positions (execution_id, lat, lng) values (v_e1, -23.6, -46.4);
  select count(*) into n from live_positions where execution_id = v_e1;
  if n <> 1 then raise exception 'FALHOU 1: a posição deveria existir com a rota em andamento'; end if;

  -- GPS 2: ao encerrar, a posição é apagada (gatilho, sem depender do app)
  update route_executions set status = 'completed', ended_at = now() where id = v_e1;
  select count(*) into n from live_positions where execution_id = v_e1;
  if n <> 0 then raise exception 'FALHOU 2: a posição deveria ter sido apagada ao encerrar a rota'; end if;

  -- GPS 3: rede de segurança — posição parada há mais de 24 h é apagada pelo job
  insert into route_executions (route_id, service_date, leg, status, started_at)
    values (v_route, current_date, 'dropoff', 'in_progress', now()) returning id into v_e2;
  insert into live_positions (execution_id, lat, lng, updated_at)
    values (v_e2, -23.6, -46.4, now() - interval '25 hours');
  perform cleanup_stale_live_positions();
  select count(*) into n from live_positions where execution_id = v_e2;
  if n <> 0 then raise exception 'FALHOU 3: posição parada há 25 h deveria ter sido apagada'; end if;

  -- GPS 4: posição recente de rota em andamento NÃO é apagada pelo job
  insert into route_executions (route_id, service_date, leg, status, started_at)
    values (v_route, current_date - 1, 'pickup', 'in_progress', now()) returning id into v_e3;
  insert into live_positions (execution_id, lat, lng) values (v_e3, -23.6, -46.4);
  perform cleanup_stale_live_positions();
  select count(*) into n from live_positions where execution_id = v_e3;
  if n <> 1 then raise exception 'FALHOU 4: posição recente não podia ser apagada'; end if;

  -- IP 1: a tabela de buscas não tem mais coluna de IP
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'marketplace_search_log' and column_name = 'ip';
  if n <> 0 then raise exception 'FALHOU 5: marketplace_search_log ainda tem a coluna ip'; end if;

  -- IP 2: a busca grava o IP na tabela própria e os filtros na tabela de buscas
  perform log_marketplace_search('TesteCidade', null, null, null, null, '203.0.113.7');
  select count(*) into n from marketplace_search_ip_log where ip = '203.0.113.7';
  if n <> 1 then raise exception 'FALHOU 6: o IP deveria estar no log próprio'; end if;
  select count(*) into n from marketplace_search_log where city = 'TesteCidade';
  if n <> 1 then raise exception 'FALHOU 7: a busca (sem IP) deveria estar no log de buscas'; end if;

  -- IP 3: IP inválido ou bloco CIDR não é gravado
  perform log_marketplace_search('TesteCidade', null, null, null, null, '10.0.0.0/8');
  perform log_marketplace_search('TesteCidade', null, null, null, null, 'unknown');
  select count(*) into n from marketplace_search_ip_log where ip = '10.0.0.0';
  if n <> 0 then raise exception 'FALHOU 8: bloco CIDR não podia virar IP'; end if;

  -- IP 4: a limpeza apaga IP com mais de 30 dias e mantém o recente
  insert into marketplace_search_ip_log (ip, created_at) values ('203.0.113.9', now() - interval '31 days');
  perform purge_search_ip_log();
  select count(*) into n from marketplace_search_ip_log where ip = '203.0.113.9';
  if n <> 0 then raise exception 'FALHOU 9: IP de 31 dias deveria ter sido apagado'; end if;
  select count(*) into n from marketplace_search_ip_log where ip = '203.0.113.7';
  if n <> 1 then raise exception 'FALHOU 10: IP recente não podia ser apagado'; end if;

  -- Jobs agendados existem
  select count(*) into n from cron.job where jobname in ('kangu_cleanup_live_positions', 'kangu_purge_search_ip_log');
  if n <> 2 then raise exception 'FALHOU 11: os dois jobs de limpeza deveriam estar agendados'; end if;

  -- Exceções de retenção e log de IP: fechados para usuário comum (authenticated) e anônimo
  set local role authenticated;
  v_ok := false;
  begin
    perform 1 from retention_exceptions limit 1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHOU 12: authenticated não deveria ler retention_exceptions'; end if;
  v_ok := false;
  begin
    perform 1 from marketplace_search_ip_log limit 1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHOU 13: authenticated não deveria ler o log de IP'; end if;
  reset role;

  raise exception 'RESULTADO: lgpd_retencao PASSOU';
end $$;
