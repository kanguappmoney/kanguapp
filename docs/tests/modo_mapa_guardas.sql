-- ===========================================================================
-- Teste das guardas do Modo Mapa (G4, G6, G5) na tabela live_positions.
-- Prova, ponta a ponta na RLS, que a posição da van só chega ao pai quando a
-- execução está in_progress (G4) E o motorista está em modo 'map' (G6), e nunca
-- a um responsável não vinculado (G5). A RLS é o gate final — o app confia nela.
--
-- Como rodar (precisa de acesso privilegiado ao banco: postgres / service_role):
--   psql "<CONNECTION_STRING>" -f docs/tests/modo_mapa_guardas.sql
--   -- ou colar no SQL Editor do Supabase.
--
-- Tudo roda numa transação que termina em ROLLBACK: NÃO deixa resíduo no banco.
-- Cada checagem imprime "OK ..." via RAISE NOTICE; qualquer falha aborta com
-- RAISE EXCEPTION descrevendo a guarda violada.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente ----------------------------------------------------
-- Remove resíduo de rodadas anteriores DESTE fixture (ex.: um run onde o ROLLBACK
-- não pegou, deixando órfão em public.users sem par em auth.users). Só os ids
-- sintéticos abaixo — nada de dado real é tocado.
-- Apagar public.users cascateia para driver_profiles, students, routes,
-- route_stops, route_executions, live_positions, guardians e os vínculos.
-- O delete em auth.users cobre o caso oposto (sobra só do lado auth).
drop function if exists _seen_positions(uuid);
delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000a0001',
  '00000000-0000-0000-0000-0000000b0001'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000a0001',
  '00000000-0000-0000-0000-0000000b0001'
);

-- --- Fixture: 1 motorista, 1 aluno, 2 responsáveis (A vinculado, B não). --------
-- IMPORTANTE: inserir em auth.users DISPARA o gatilho on_auth_user_created
-- (handle_new_user), que cria sozinho:
--   1) a linha em public.users (papel e nome vêm do raw_user_meta_data);
--   2) a linha de driver_profiles OU guardians, conforme o papel.
-- Por isso NÃO inserimos users/driver_profiles/guardians à mão — seria duplicar
-- o id e estourar users_pkey. O motorista nasce com parent_tracking_mode = 'map'
-- (default da coluna), que é o estado inicial que o teste precisa.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driver@teste.kangu', '{"role":"driver","full_name":"Motorista Teste"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0001', 'authenticated', 'authenticated', 'paiA@teste.kangu',  '{"role":"guardian","full_name":"Responsável A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000b0001', 'authenticated', 'authenticated', 'paiB@teste.kangu',  '{"role":"guardian","full_name":"Responsável B"}'::jsonb, now(), now());

insert into students (id, driver_id, full_name) values
  ('00000000-0000-0000-0000-0000005c0001', '00000000-0000-0000-0000-0000000d0001', 'Aluno Teste');

-- Só o responsável A é vinculado ao aluno (G5).
insert into guardian_student (guardian_id, student_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000005c0001');

insert into routes (id, driver_id, name, direction) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000000d0001', 'Turma Manhã - Ida', 'outbound');
insert into route_stops (route_id, student_id, position, kind) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'pickup');

-- Execução começa 'scheduled' (rota ainda não saiu).
insert into route_executions (id, route_id, service_date, status) values
  ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000007a0001', current_date, 'scheduled');

-- Posição da van no banco (o motorista já emitiu). A RLS decide quem lê.
insert into live_positions (execution_id, lat, lng) values
  ('00000000-0000-0000-0000-0000009e0001', -23.6672, -46.4614);

-- --- Helper: quantas posições ESTE usuário enxerga para a execução. -------------
create or replace function _seen_positions(p_uid uuid) returns int
language plpgsql as $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select count(*) into n from live_positions
    where execution_id = '00000000-0000-0000-0000-0000009e0001';
  reset role;
  return n;
end $$;

-- ===========================================================================
-- CHECK 1 — G4: execução 'scheduled' => pai A (vinculado, modo map) vê 0.
-- ===========================================================================
do $$
declare n int := _seen_positions('00000000-0000-0000-0000-0000000a0001');
begin
  if n <> 0 then raise exception 'G4 FALHOU: pai leu posição com rota scheduled (n=%)', n; end if;
  raise notice 'OK G4 (1/4): rota scheduled -> pai A vê 0 posições';
end $$;

-- Motorista inicia a rota.
update route_executions set status = 'in_progress', started_at = now()
  where id = '00000000-0000-0000-0000-0000009e0001';

-- ===========================================================================
-- CHECK 2 — G4 + G6: in_progress + modo 'map' => pai A vê 1 (a van ao vivo).
-- ===========================================================================
do $$
declare n int := _seen_positions('00000000-0000-0000-0000-0000000a0001');
begin
  if n <> 1 then raise exception 'G4/G6 FALHOU: pai A não viu a van em rota ativa + modo map (n=%)', n; end if;
  raise notice 'OK G4+G6 (2/4): in_progress + map -> pai A vê a van';
end $$;

-- Motorista troca para modo Linha do tempo.
update driver_profiles set parent_tracking_mode = 'timeline'
  where user_id = '00000000-0000-0000-0000-0000000d0001';

-- ===========================================================================
-- CHECK 3 — G6: modo 'timeline' => pai A vê 0, MESMO com rota ativa e posição
-- gravada no banco. O modo Linha do tempo nunca entrega GPS.
-- ===========================================================================
do $$
declare n int := _seen_positions('00000000-0000-0000-0000-0000000a0001');
begin
  if n <> 0 then raise exception 'G6 FALHOU: modo timeline entregou posição ao pai (n=%)', n; end if;
  raise notice 'OK G6 (3/4): in_progress + timeline -> pai A vê 0 (nunca GPS no timeline)';
end $$;

-- Volta para 'map' para isolar a G5 no próximo check.
update driver_profiles set parent_tracking_mode = 'map'
  where user_id = '00000000-0000-0000-0000-0000000d0001';

-- ===========================================================================
-- CHECK 4 — G5: responsável B (NÃO vinculado) vê 0 mesmo no melhor cenário
-- possível (in_progress + map). Dado de posição nunca vaza para quem não é do aluno.
-- ===========================================================================
do $$
declare n int := _seen_positions('00000000-0000-0000-0000-0000000b0001');
begin
  if n <> 0 then raise exception 'G5 FALHOU: responsável não vinculado leu posição (n=%)', n; end if;
  raise notice 'OK G5 (4/4): responsável não vinculado vê 0 posições';
end $$;

do $$ begin raise notice '== TODAS AS GUARDAS DO MODO MAPA PASSARAM (G4, G6, G5) =='; end $$;

rollback;  -- não deixa resíduo no banco
