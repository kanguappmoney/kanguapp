-- ===========================================================================
-- Rotas 2.0 — EXECUÇÃO da rota 'both' por perna.
-- Prova que o modelo de duas listas (ida=pickup, volta=dropoff) roda de fato:
--   1) ida e volta são execuções INDEPENDENTES no MESMO dia (o índice novo
--      route_id+dia+perna permite; o unique antigo route_id+dia rejeitaria) —
--      e uma segunda execução da mesma perna no dia é barrada;
--   2) journey escopado por perna: get_active_journey resolve a execução da
--      perna que contém o filho e conta só as paradas daquela perna (total_stops
--      = 2, não 4);
--   3) G5 + perna: a lista de filhos e a contagem não vazam a outra perna
--      (pai da ida vê só a ida; confirmar embarque na ida não conta na volta);
--   4) PONTE DE COMPATIBILIDADE: rota antiga de uma perna (leg null) continua
--      rodando e o journey a conta inteira, como antes.
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente (só ids sintéticos deste fixture) ------------------
drop function if exists _journey(uuid);
delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000a0001',
  '00000000-0000-0000-0000-0000000b0001',
  '00000000-0000-0000-0000-0000000c0001'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000a0001',
  '00000000-0000-0000-0000-0000000b0001',
  '00000000-0000-0000-0000-0000000c0001'
);

-- --- Fixture: 1 motorista, 4 alunos, 3 responsáveis ----------------------------
-- Inserir em auth.users dispara handle_new_user (cria public.users + driver/guardian).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driver@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0001', 'authenticated', 'authenticated', 'paiA@teste.kangu',  '{"role":"guardian","full_name":"Pai da Ida"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000b0001', 'authenticated', 'authenticated', 'paiB@teste.kangu',  '{"role":"guardian","full_name":"Pai da Volta"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000c0001', 'authenticated', 'authenticated', 'paiC@teste.kangu',  '{"role":"guardian","full_name":"Pai Legado"}'::jsonb,   now(), now());

-- Alunos (owner insere; RLS não se aplica ao setup).
--  Um   = só-ida       (pickup)
--  Dois = ambas        (pickup + dropoff)
--  Três = só-volta     (dropoff)
--  Quatro = rota antiga de uma perna (outbound)
insert into students (id, driver_id, full_name, shift, status) values
  ('00000000-0000-0000-0000-0000005c0001', '00000000-0000-0000-0000-0000000d0001', 'Aluno Um',     'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0002', '00000000-0000-0000-0000-0000000d0001', 'Aluno Dois',   'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0003', '00000000-0000-0000-0000-0000000d0001', 'Aluno Três',   'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0004', '00000000-0000-0000-0000-0000000d0001', 'Aluno Quatro', 'morning', 'active');

-- Vínculos (G5): cada pai só ao seu filho.
insert into guardian_student (guardian_id, student_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000005c0001'), -- Pai da Ida  -> Um
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000005c0003'), -- Pai da Volta-> Três
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000005c0004'); -- Pai Legado  -> Quatro

-- Rota encorpada 'both'. Ida: Um(1),Dois(2). Volta: Dois(1),Três(2).
insert into routes (id, driver_id, name, direction, shift) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000000d0001', 'Turma Manhã', 'both', 'morning');
insert into route_stops (route_id, student_id, position, kind) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 2, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 1, 'dropoff'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0003', 2, 'dropoff');

-- Rota antiga de uma perna (ponte de compatibilidade). Só Quatro.
insert into routes (id, driver_id, name, direction) values
  ('00000000-0000-0000-0000-0000007a0002', '00000000-0000-0000-0000-0000000d0001', 'Rota Antiga', 'outbound');
insert into route_stops (route_id, student_id, position, kind) values
  ('00000000-0000-0000-0000-0000007a0002', '00000000-0000-0000-0000-0000005c0004', 1, 'pickup');

-- --- Helper: journey que ESTE responsável enxerga ------------------------------
create or replace function _journey(p_uid uuid) returns json
language plpgsql as $$
declare j json;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select get_active_journey() into j;
  reset role;
  return j;
end $$;

-- ===========================================================================
-- CHECK 1 — ida e volta como execuções INDEPENDENTES no mesmo dia.
-- ===========================================================================
insert into route_executions (id, route_id, service_date, leg, status, started_at) values
  ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000007a0001', current_date, 'pickup',  'in_progress', now()),
  ('00000000-0000-0000-0000-0000009e0002', '00000000-0000-0000-0000-0000007a0001', current_date, 'dropoff', 'in_progress', now());

do $$
declare n int; barrou boolean := false;
begin
  select count(*) into n from route_executions
    where route_id = '00000000-0000-0000-0000-0000007a0001' and service_date = current_date;
  if n <> 2 then raise exception 'FALHOU: rota both não teve ida E volta no mesmo dia (n=%)', n; end if;

  -- Segunda execução da MESMA perna (pickup) no dia é barrada pelo índice único.
  begin
    insert into route_executions (route_id, service_date, leg, status)
    values ('00000000-0000-0000-0000-0000007a0001', current_date, 'pickup', 'in_progress');
  exception when unique_violation then barrou := true;
  end;
  if not barrou then raise exception 'FALHOU: aceitou duas execuções da mesma perna no dia'; end if;
  raise notice 'OK (1/4): ida e volta independentes no mesmo dia; perna duplicada barrada';
end $$;

-- ===========================================================================
-- CHECK 2 — journey escopado por perna (total_stops da perna, não da rota).
-- ===========================================================================
do $$
declare
  j_ida   json := _journey('00000000-0000-0000-0000-0000000a0001'); -- Pai da Ida  (Um)
  j_volta json := _journey('00000000-0000-0000-0000-0000000b0001'); -- Pai da Volta(Três)
begin
  if j_ida is null or j_volta is null then
    raise exception 'FALHOU: journey nulo (ida=%, volta=%)', j_ida, j_volta;
  end if;
  -- Ida tem 2 paradas (Um, Dois) — não 4 (a rota inteira).
  if (j_ida ->> 'total_stops')::int <> 2 then
    raise exception 'FALHOU: total_stops da ida = % (esperado 2)', j_ida ->> 'total_stops';
  end if;
  -- Volta tem 2 paradas (Dois, Três).
  if (j_volta ->> 'total_stops')::int <> 2 then
    raise exception 'FALHOU: total_stops da volta = % (esperado 2)', j_volta ->> 'total_stops';
  end if;
  if (j_ida ->> 'direction') <> 'both' then
    raise exception 'FALHOU: direction da journey = % (esperado both)', j_ida ->> 'direction';
  end if;
  raise notice 'OK (2/4): journey conta só a perna (ida=2, volta=2), não a rota inteira (4)';
end $$;

-- ===========================================================================
-- CHECK 3 — G5 + perna: sem vazamento da outra lista; confirmação por execução.
-- ===========================================================================
-- Motorista confirma o embarque de Dois na IDA (execução pickup).
insert into route_events (execution_id, student_id, type) values
  ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000005c0002', 'embarked');

do $$
declare
  j_ida   json := _journey('00000000-0000-0000-0000-0000000a0001'); -- Pai da Ida
  j_volta json := _journey('00000000-0000-0000-0000-0000000b0001'); -- Pai da Volta
  kids_ida json := j_ida -> 'children';
begin
  -- Pai da Ida só vê o PRÓPRIO filho (Um) na lista — nunca Dois/Três (G5).
  if json_array_length(kids_ida) <> 1 then
    raise exception 'FALHOU: lista de filhos da ida com % itens (esperado 1)', json_array_length(kids_ida);
  end if;
  if (kids_ida -> 0 ->> 'name') <> 'Aluno Um' then
    raise exception 'FALHOU: pai da ida viu filho errado (%)', kids_ida -> 0 ->> 'name';
  end if;
  -- O embarque de Dois foi na IDA: conta na ida (1), não na volta (0).
  if (j_ida ->> 'confirmed_count')::int <> 1 then
    raise exception 'FALHOU: confirmed_count da ida = % (esperado 1)', j_ida ->> 'confirmed_count';
  end if;
  if (j_volta ->> 'confirmed_count')::int <> 0 then
    raise exception 'FALHOU: confirmed_count da volta = % (esperado 0 — não vaza da ida)', j_volta ->> 'confirmed_count';
  end if;
  raise notice 'OK (3/4): G5 preservado por perna; confirmação da ida não vaza para a volta';
end $$;

-- ===========================================================================
-- CHECK 4 — ponte de compatibilidade: rota antiga de uma perna segue rodando.
-- ===========================================================================
insert into route_executions (id, route_id, service_date, leg, status, started_at) values
  ('00000000-0000-0000-0000-0000009e0003', '00000000-0000-0000-0000-0000007a0002', current_date, null, 'in_progress', now());

do $$
declare j json := _journey('00000000-0000-0000-0000-0000000c0001'); -- Pai Legado (Quatro)
begin
  if j is null then raise exception 'FALHOU: rota antiga não gerou journey'; end if;
  if (j ->> 'direction') <> 'outbound' then
    raise exception 'FALHOU: direction legado = % (esperado outbound)', j ->> 'direction';
  end if;
  -- leg null => conta a rota inteira (1 parada), comportamento de antes.
  if (j ->> 'total_stops')::int <> 1 then
    raise exception 'FALHOU: total_stops legado = % (esperado 1)', j ->> 'total_stops';
  end if;
  raise notice 'OK (4/4): rota antiga de uma perna (leg null) continua rodando';
end $$;

do $$ begin raise notice '== ROTAS 2.0 (execução da rota both) PASSOU (4/4) =='; end $$;

rollback;
