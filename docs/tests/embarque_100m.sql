-- ===========================================================================
-- Embarque a 100m (G1/G2) — auditoria do "embarcar mesmo assim" NO BANCO.
-- O gate de 100m é client-side (nunca trava). Aqui provamos o papel do banco:
--   1) G1 — NENHUM caminho recusa um embarque: forçado a 5 km E forçado sem GPS
--      (distance_m null) são aceitos. Não existe trava por distância;
--   2) auditoria canônica — o normalizador garante `forced` (boolean) e a chave
--      `distance_m` em todo embarque, mesmo quando o metadata vem vazio; o
--      forçado guarda a distância medida;
--   3) G5 — o pai vê "embarcou", nunca "forçado a X m": get_active_journey conta
--      o embarque sem jamais expor `forced`/`distance_m`.
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- APLICAR a migration 028 ANTES de rodar.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente ---------------------------------------------------
drop function if exists _journey(uuid);
delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000a0001'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000a0001'
);

-- --- Fixture: 1 motorista, 2 alunos, 1 responsável (vinculado ao Um) -----------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driver@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0001', 'authenticated', 'authenticated', 'pai@teste.kangu',   '{"role":"guardian","full_name":"Pai do Um"}'::jsonb, now(), now());

insert into students (id, driver_id, full_name, shift, status, pickup_lat, pickup_lng) values
  ('00000000-0000-0000-0000-0000005c0001', '00000000-0000-0000-0000-0000000d0001', 'Aluno Um',   'morning', 'active', -23.6672, -46.4614),
  ('00000000-0000-0000-0000-0000005c0002', '00000000-0000-0000-0000-0000000d0001', 'Aluno Dois', 'morning', 'active', null, null);

insert into guardian_student (guardian_id, student_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000005c0001');

-- Rota 'both'; ida (pickup) = Um(1), Dois(2). Execução da ida in_progress.
insert into routes (id, driver_id, name, direction, shift) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000000d0001', 'Turma Manhã', 'both', 'morning');
insert into route_stops (route_id, student_id, position, kind) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 2, 'pickup');
insert into route_executions (id, route_id, service_date, leg, status, started_at) values
  ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000007a0001', current_date, 'pickup', 'in_progress', now());

-- Helper: journey que ESTE responsável enxerga.
create or replace function _journey(p_uid uuid) returns json
language plpgsql as $$
declare j json;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select get_active_journey() into j;
  reset role;
  perform set_config('request.jwt.claims', null, true);
  return j;
end $$;

-- ===========================================================================
-- CHECK 1 — G1: nenhum caminho recusa o embarque (longe OU sem GPS).
-- ===========================================================================
do $$
declare far_ok boolean := true; nogps_ok boolean := true;
begin
  -- Embarque FORÇADO a 5 km (muito além dos 100m): tem que ser aceito.
  begin
    insert into route_events (execution_id, student_id, type, metadata) values
      ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000005c0001',
       'embarked', '{"forced": true, "distance_m": 5000}'::jsonb);
  exception when others then far_ok := false;
  end;
  if not far_ok then raise exception 'FALHOU (1): banco recusou embarque forçado a 5 km (violaria a G1)'; end if;

  -- Embarque FORÇADO sem GPS (distance_m null): também aceito.
  begin
    insert into route_events (execution_id, student_id, type, metadata) values
      ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000005c0002',
       'embarked', '{"forced": true, "distance_m": null}'::jsonb);
  exception when others then nogps_ok := false;
  end;
  if not nogps_ok then raise exception 'FALHOU (1): banco recusou embarque forçado sem GPS (violaria a G1)'; end if;

  raise notice 'OK (1/3): G1 — embarque a qualquer distância é aceito (nenhuma trava)';
end $$;

-- ===========================================================================
-- CHECK 2 — auditoria canônica (normalizador preenche forced/distance_m).
-- ===========================================================================
do $$
declare
  forced_far text; dist_far text; dist_nogps text; forced_norm text; has_dist boolean;
begin
  -- O forçado a 5 km guarda forced=true e a distância medida.
  select metadata->>'forced', metadata->>'distance_m' into forced_far, dist_far
    from route_events
    where execution_id = '00000000-0000-0000-0000-0000009e0001'
      and student_id = '00000000-0000-0000-0000-0000005c0001' and type = 'embarked';
  if forced_far <> 'true' then raise exception 'FALHOU (2): forçado não gravou forced=true (veio %)', forced_far; end if;
  if dist_far <> '5000' then raise exception 'FALHOU (2): distância do forçado errada (veio %)', dist_far; end if;

  -- O sem-GPS tem a chave distance_m presente, valor null.
  select metadata->>'distance_m' into dist_nogps
    from route_events
    where execution_id = '00000000-0000-0000-0000-0000009e0001'
      and student_id = '00000000-0000-0000-0000-0000005c0002' and type = 'embarked';
  if dist_nogps is not null then raise exception 'FALHOU (2): sem-GPS deveria ter distance_m null (veio %)', dist_nogps; end if;

  -- Embarque NORMAL com metadata vazio: o normalizador canoniza forced=false.
  delete from route_events
    where execution_id = '00000000-0000-0000-0000-0000009e0001'
      and student_id = '00000000-0000-0000-0000-0000005c0001';
  insert into route_events (execution_id, student_id, type, metadata) values
    ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000005c0001', 'embarked', '{}'::jsonb);
  select metadata->>'forced', (metadata ? 'distance_m') into forced_norm, has_dist
    from route_events
    where execution_id = '00000000-0000-0000-0000-0000009e0001'
      and student_id = '00000000-0000-0000-0000-0000005c0001' and type = 'embarked';
  if forced_norm <> 'false' then raise exception 'FALHOU (2): metadata vazio não virou forced=false (veio %)', forced_norm; end if;
  if not has_dist then raise exception 'FALHOU (2): normalizador não garantiu a chave distance_m'; end if;

  raise notice 'OK (2/3): auditoria canônica — forced/distance_m sempre presentes (forçado guarda a distância)';
end $$;

-- ===========================================================================
-- CHECK 3 — G5: o pai vê "embarcou", nunca o override nem a distância.
-- ===========================================================================
-- Deixa o Um embarcado FORÇADO a 5 km (o caso "interessante" de vazamento).
delete from route_events
  where execution_id = '00000000-0000-0000-0000-0000009e0001'
    and student_id = '00000000-0000-0000-0000-0000005c0001';
insert into route_events (execution_id, student_id, type, metadata) values
  ('00000000-0000-0000-0000-0000009e0001', '00000000-0000-0000-0000-0000005c0001',
   'embarked', '{"forced": true, "distance_m": 5000}'::jsonb);

do $$
declare j json; jtxt text;
begin
  j := _journey('00000000-0000-0000-0000-0000000a0001'); -- Pai do Um
  if j is null then raise exception 'FALHOU (3): journey nulo'; end if;
  jtxt := j::text;

  -- O embarque conta pro pai (confirmed_count >= 1) — o pai sabe que embarcou.
  if (j ->> 'confirmed_count')::int < 1 then
    raise exception 'FALHOU (3): embarque do Um não contou para o pai (confirmed=%)', j ->> 'confirmed_count';
  end if;
  -- Mas o override e a distância NUNCA vazam.
  if jtxt like '%forced%' then raise exception 'FALHOU (3): journey vazou "forced" para o pai'; end if;
  if jtxt like '%distance_m%' then raise exception 'FALHOU (3): journey vazou "distance_m" para o pai'; end if;
  if jtxt like '%5000%' then raise exception 'FALHOU (3): journey vazou a distância (5000) para o pai'; end if;

  raise notice 'OK (3/3): G5 — pai vê "embarcou", nunca o "mesmo assim" nem a distância';
end $$;

do $$ begin raise notice '== EMBARQUE 100m (G1/G2) PASSOU (3/3) =='; end $$;

drop function if exists _journey(uuid);
rollback;
