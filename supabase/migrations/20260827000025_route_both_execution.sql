-- Kangu v1 — Rotas 2.0 (execução): dirigir a rota 'both' por PERNA.
-- A rota 'both' tem duas listas (ida=pickup, volta=dropoff) numa entidade só.
-- Operacionalmente ela roda DUAS vezes no dia: a ida de manhã, a volta à tarde.
-- Cada perna é uma execução independente. Aqui damos a `route_executions` a
-- coluna que diz QUAL perna ela é, e ajustamos as funções do banco que precisam
-- enxergar a perna: a jornada do pai (Linha do tempo, G6/G5) e a Revisão (G1/G2).
--
-- PONTE DE COMPATIBILIDADE (o fio condutor da fatia): rotas antigas de uma perna
-- (outbound/inbound) têm `leg = null` e seguem idênticas — 1 execução/dia, sem
-- filtro de perna. Todo ramo novo é guardado por `leg is not null`.

-- 1) A execução ganha a perna. Nullable: legado = null.
alter table route_executions add column if not exists leg stop_type;

-- 2) Unicidade por perna. Antes: uma execução por (rota, dia). Agora a 'both'
-- precisa de duas no mesmo dia (ida e volta). Fazemos com DOIS índices únicos
-- parciais — sem função na expressão (o cast enum->text não é IMMUTABLE e o
-- Postgres recusa em índice):
--   a) legado (leg null): único por (rota, dia) => segue 1×/dia;
--   b) por perna (leg not null): único por (rota, dia, leg) => ida e volta
--      coexistem no mesmo dia, mas cada perna só uma vez.
alter table route_executions
  drop constraint if exists route_executions_route_id_service_date_key;

create unique index if not exists route_executions_route_date_single_key
  on route_executions (route_id, service_date)
  where leg is null;

create unique index if not exists route_executions_route_date_leg_key
  on route_executions (route_id, service_date, leg)
  where leg is not null;

-- ---------------------------------------------------------------------------
-- 3) Jornada ativa do pai (Linha do tempo, G6) escopada à PERNA em execução.
-- Numa rota 'both' o pai que está na ida não pode ver a contagem da volta (e
-- vice-versa): total_stops e children passam a filtrar route_stops pelo kind da
-- perna (`v_exec.leg`). Legado (leg null) conta tudo como antes. G5 preservado:
-- a função segue SECURITY DEFINER devolvendo só agregados + os filhos do próprio
-- responsável, agora recortados pela perna certa.
-- ---------------------------------------------------------------------------
create or replace function get_active_journey()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_exec record;
begin
  if v_uid is null then
    return null;
  end if;

  -- Execução em andamento hoje numa rota que contém um filho deste responsável.
  -- Agora traz também a perna (e.leg) para recortar a contagem e a lista.
  select e.id, e.route_id, e.leg, r.name as route_name, r.direction
    into v_exec
  from route_executions e
  join routes r on r.id = e.route_id
  join route_stops rs on rs.route_id = r.id
                     and (e.leg is null or rs.kind = e.leg)
  join guardian_student gs on gs.student_id = rs.student_id
  where gs.guardian_id = v_uid
    and e.service_date = current_date
    and e.status = 'in_progress'
  order by e.started_at desc nulls last
  limit 1;

  if not found then
    return null;
  end if;

  return json_build_object(
    'execution_id', v_exec.id,
    'route_name', v_exec.route_name,
    'direction', v_exec.direction,
    -- total_stops e children recortados pela perna em execução (v_exec.leg).
    'total_stops',
      (select count(*) from route_stops
        where route_id = v_exec.route_id
          and (v_exec.leg is null or kind = v_exec.leg)),
    'confirmed_count',
      (select count(distinct student_id) from route_events
        where execution_id = v_exec.id
          and student_id is not null
          and type in ('embarked', 'disembarked', 'student_absent')),
    'ended',
      exists (select 1 from route_events
               where execution_id = v_exec.id and type = 'route_ended'),
    'children', (
      select coalesce(json_agg(
               json_build_object(
                 'name', s.full_name,
                 'position', rs.position,
                 'state', coalesce(ev.state, 'waiting')
               ) order by rs.position
             ), '[]'::json)
      from route_stops rs
      join students s on s.id = rs.student_id
      join guardian_student gs on gs.student_id = rs.student_id
                              and gs.guardian_id = v_uid
      left join lateral (
        select case when re.type = 'student_absent' then 'absent' else 'boarded' end
        from route_events re
        where re.execution_id = v_exec.id
          and re.student_id = rs.student_id
          and re.type in ('embarked', 'disembarked', 'student_absent')
        limit 1
      ) ev(state) on true
      where rs.route_id = v_exec.route_id
        and (v_exec.leg is null or rs.kind = v_exec.leg)
    )
  );
end;
$$;

grant execute on function get_active_journey() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Revisão de hoje (G1/G2) ciente da PERNA.
-- Trocamos a assinatura para receber `p_leg stop_type` (null = legado). A perna
-- recorta os alunos revisados (só os da lista daquela perna) e determina a G1:
-- "nunca bloquear a VOLTA de quem embarcou" vale quando a perna em execução é a
-- volta — na 'both' isso é a perna dropoff; no legado, direction='inbound'.
-- Dropamos as versões antigas de 2/1 args e recriamos com p_leg default null
-- (a chamada legada de 2 args resolve para a nova sem ambiguidade).
-- ---------------------------------------------------------------------------
drop function if exists get_suspension_review(uuid);
drop function if exists apply_route_review(uuid, uuid[]);

create or replace function get_suspension_review(
  p_route_id uuid,
  p_leg stop_type default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dir route_direction;
  v_is_return boolean;
begin
  select direction into v_dir from routes where id = p_route_id and driver_id = v_uid;
  if not found then
    raise exception 'Apenas o motorista dono da rota.';
  end if;

  -- Perna de volta? legado inbound, ou a perna dropoff numa rota 'both'.
  v_is_return := (v_dir = 'inbound') or (p_leg = 'dropoff');

  return (
    select coalesce(json_agg(json_build_object(
      'student_id', s.id,
      'name', s.full_name,
      'g1_forced', v_is_return and exists (
        select 1 from route_events re
        join route_executions e on e.id = re.execution_id
        join routes r2 on r2.id = e.route_id
        where re.student_id = s.id
          and re.type = 'embarked'
          and e.service_date = current_date
          and r2.driver_id = v_uid
      )
    ) order by s.full_name), '[]'::json)
    from route_stops rs
    join students s on s.id = rs.student_id
    where rs.route_id = p_route_id
      and (p_leg is null or rs.kind = p_leg)
      and s.pay_status = 'blocked'
  );
end;
$$;

create or replace function apply_route_review(
  p_route_id uuid,
  p_skip_student_ids uuid[],
  p_leg stop_type default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_dir       route_direction;
  v_exec      uuid;
  r           record;
  v_g1        boolean;
  v_is_return boolean;
begin
  select direction into v_dir from routes where id = p_route_id and driver_id = v_uid;
  if not found then
    raise exception 'Apenas o motorista dono da rota.';
  end if;

  v_is_return := (v_dir = 'inbound') or (p_leg = 'dropoff');

  -- cria/retoma a execução de hoje DESTA perna e coloca em andamento.
  select id into v_exec from route_executions
   where route_id = p_route_id and service_date = current_date
     and coalesce(leg::text, 'single') = coalesce(p_leg::text, 'single');
  if not found then
    insert into route_executions (route_id, service_date, leg, status, started_at)
    values (p_route_id, current_date, p_leg, 'in_progress', now())
    returning id into v_exec;
    insert into route_events (execution_id, type) values (v_exec, 'route_started');
  else
    update route_executions set status = 'in_progress', started_at = coalesce(started_at, now())
     where id = v_exec and status <> 'completed';
  end if;

  -- decide por aluno blocked (recortado pela perna).
  for r in
    select s.id as student_id
    from route_stops rs
    join students s on s.id = rs.student_id
    where rs.route_id = p_route_id
      and (p_leg is null or rs.kind = p_leg)
      and s.pay_status = 'blocked'
  loop
    v_g1 := v_is_return and exists (
      select 1 from route_events re
      join route_executions e on e.id = re.execution_id
      join routes r2 on r2.id = e.route_id
      where re.student_id = r.student_id
        and re.type = 'embarked'
        and e.service_date = current_date
        and r2.driver_id = v_uid
    );

    if v_g1 then
      -- G1: inclusão forçada, NUNCA pulo (mesmo se vier na lista).
      insert into route_events (execution_id, student_id, type, metadata)
      values (v_exec, r.student_id, 'stop_forced_driver_override',
              jsonb_build_object('reason', 'g1_return'));
    elsif r.student_id = any (p_skip_student_ids) then
      -- pulo só para quem o motorista confirmou.
      insert into route_events (execution_id, student_id, type, metadata)
      values (v_exec, r.student_id, 'stop_skipped_billing',
              jsonb_build_object('reason', 'billing'));
    else
      -- "Levar mesmo assim" (ou não confirmado como pulo) = forçado.
      insert into route_events (execution_id, student_id, type, metadata)
      values (v_exec, r.student_id, 'stop_forced_driver_override',
              jsonb_build_object('reason', 'driver_override'));
    end if;
  end loop;

  return v_exec;
end;
$$;

grant execute on function get_suspension_review(uuid, stop_type) to authenticated;
grant execute on function apply_route_review(uuid, uuid[], stop_type) to authenticated;
