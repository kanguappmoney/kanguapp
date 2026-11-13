-- ===========================================================================
-- Extensão da G1 no Modo Direção — quem EMBARCOU na ida não fica AUSENTE na volta.
-- Prova o trigger `enforce_no_absent_after_ida_embark` (migration 032):
--   (a) a volta RECUSA `student_absent` para quem tem `embarked` na ida da mesma
--       rota + dia — por INSERT (caminho normal do setStopState: delete+insert) e
--       por UPDATE (trocar um `disembarked` existente por ausência = bypass);
--       e o `disembarked` desse aluno segue aceito (a volta fecha normal);
--   (b) a volta ACEITA "Ausente" para quem NÃO embarcou na ida (e para quem
--       embarcou numa ida de OUTRO dia — a trava é por rota + dia);
--   (c) a perna de IDA segue livre: "Ausente" no embarque é aceito sem restrição
--       (o caso real: pai foi buscar, aluno passou mal).
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- APLICAR a migration 032 ANTES de rodar.
-- "Hoje" = sp_today() (fuso de São Paulo, migration 033) — a mesma data das funções.
-- APLICAR a migration 033 ANTES de rodar.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente (só ids sintéticos deste fixture) ------------------
delete from public.users where id = '00000000-0000-0000-0000-0000000d0001';
delete from auth.users   where id = '00000000-0000-0000-0000-0000000d0001';

-- --- Fixture: 1 motorista, 3 alunos, rota 'both' --------------------------------
-- Inserir em auth.users dispara handle_new_user (cria public.users + driver).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driver@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb, now(), now());

--  Um   = embarcou na ida hoje       -> volta: só desembarque
--  Dois = NÃO embarcou na ida hoje   -> volta: ausente liberado
--  Três = embarcou na ida ONTEM      -> volta de hoje: ausente liberado
insert into students (id, driver_id, full_name, shift, status) values
  ('00000000-0000-0000-0000-0000005c0001', '00000000-0000-0000-0000-0000000d0001', 'Aluno Um',   'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0002', '00000000-0000-0000-0000-0000000d0001', 'Aluno Dois', 'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0003', '00000000-0000-0000-0000-0000000d0001', 'Aluno Três', 'morning', 'active');
-- Fixture: a trava da migration 060 exige aluno autorizado para entrar em route_stops (sem mexer em asserção).
select set_config('kangu.consent_internal', '1', true);
update students set consent_status = 'authorized' where id in ('00000000-0000-0000-0000-0000005c0001', '00000000-0000-0000-0000-0000005c0002', '00000000-0000-0000-0000-0000005c0003');


insert into routes (id, driver_id, name, direction, shift) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000000d0001', 'Turma Manhã', 'both', 'morning');
insert into route_stops (route_id, student_id, position, kind) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 2, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0003', 3, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'dropoff'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 2, 'dropoff'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0003', 3, 'dropoff');

-- Execuções: ida de ONTEM (encerrada), ida de HOJE (encerrada), volta de HOJE.
insert into route_executions (id, route_id, service_date, leg, status, started_at) values
  ('00000000-0000-0000-0000-0000009e0000', '00000000-0000-0000-0000-0000007a0001', sp_today() - 1, 'pickup',  'completed',   now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000007a0001', sp_today(),     'pickup',  'completed',   now() - interval '6 hours'),
  ('00000000-0000-0000-0000-0000009e0002', '00000000-0000-0000-0000-0000007a0001', sp_today(),     'dropoff', 'in_progress', now());

-- Embarques: Um na ida de hoje; Três só na ida de ontem. Dois não embarcou.
insert into route_events (execution_id, student_id, type) values
  ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000005c0001', 'embarked'),
  ('00000000-0000-0000-0000-0000009e0000', '00000000-0000-0000-0000-0000005c0003', 'embarked');

-- ===========================================================================
-- CHECK (a) — volta RECUSA ausência de quem embarcou na ida (insert e update).
-- ===========================================================================
do $$
declare barrou_insert boolean := false; barrou_update boolean := false;
begin
  -- Caminho normal (setStopState faz delete + insert).
  begin
    insert into route_events (execution_id, student_id, type) values
      ('00000000-0000-0000-0000-0000009e0002', '00000000-0000-0000-0000-0000005c0001', 'student_absent');
  exception when raise_exception then barrou_insert := true;
  end;
  if not barrou_insert then
    raise exception 'FALHOU (a): volta aceitou ausente (insert) de quem embarcou na ida';
  end if;

  -- Desembarque segue aceito: a volta de quem embarcou fecha normal.
  insert into route_events (execution_id, student_id, type) values
    ('00000000-0000-0000-0000-0000009e0002', '00000000-0000-0000-0000-0000005c0001', 'disembarked');

  -- Bypass por UPDATE: trocar o desembarque por ausência também é recusado.
  begin
    update route_events set type = 'student_absent'
     where execution_id = '00000000-0000-0000-0000-0000009e0002'
       and student_id   = '00000000-0000-0000-0000-0000005c0001';
  exception when raise_exception then barrou_update := true;
  end;
  if not barrou_update then
    raise exception 'FALHOU (a): volta aceitou ausente (update) de quem embarcou na ida';
  end if;

  raise notice 'OK (a 1/3): volta recusa ausente de quem embarcou na ida (insert e update); desembarque aceito';
end $$;

-- ===========================================================================
-- CHECK (b) — volta ACEITA ausência de quem NÃO embarcou na ida de hoje.
-- ===========================================================================
do $$
declare n int;
begin
  insert into route_events (execution_id, student_id, type) values
    ('00000000-0000-0000-0000-0000009e0002', '00000000-0000-0000-0000-0000005c0002', 'student_absent'), -- Dois: não embarcou
    ('00000000-0000-0000-0000-0000009e0002', '00000000-0000-0000-0000-0000005c0003', 'student_absent'); -- Três: embarcou só ONTEM
  select count(*) into n from route_events
   where execution_id = '00000000-0000-0000-0000-0000009e0002' and type = 'student_absent';
  if n <> 2 then raise exception 'FALHOU (b): esperado 2 ausentes na volta, veio %', n; end if;
  raise notice 'OK (b 2/3): volta aceita ausente de quem não embarcou na ida de hoje (inclui ida de outro dia)';
end $$;

-- ===========================================================================
-- CHECK (c) — a perna de IDA segue livre ("Ausente" sem restrição).
-- ===========================================================================
-- Ida de amanhã em andamento (nova execução; a trava nunca olha a ida).
insert into route_executions (id, route_id, service_date, leg, status, started_at) values
  ('00000000-0000-0000-0000-0000009e0003', '00000000-0000-0000-0000-0000007a0001', sp_today() + 1, 'pickup', 'in_progress', now());

do $$
declare n int;
begin
  -- Um (que já embarcou em outra ida) e Dois: ausentes na ida — aceitos.
  insert into route_events (execution_id, student_id, type) values
    ('00000000-0000-0000-0000-0000009e0003', '00000000-0000-0000-0000-0000005c0001', 'student_absent'),
    ('00000000-0000-0000-0000-0000009e0003', '00000000-0000-0000-0000-0000005c0002', 'student_absent');
  -- E na ida de hoje, trocar o embarque de Um por ausência (update) também passa.
  update route_events set type = 'student_absent'
   where execution_id = '00000000-0000-0000-0000-0000009e0001'
     and student_id   = '00000000-0000-0000-0000-0000005c0001';
  select count(*) into n from route_events
   where execution_id in ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000009e0003')
     and type = 'student_absent';
  if n <> 3 then raise exception 'FALHOU (c): esperado 3 ausentes na ida, veio %', n; end if;
  raise notice 'OK (c 3/3): ida segue livre — ausente aceito (insert e update)';
end $$;

do $$ begin raise notice '== G1 VOLTA SEM AUSENTE PASSOU (3/3) =='; end $$;

rollback;
