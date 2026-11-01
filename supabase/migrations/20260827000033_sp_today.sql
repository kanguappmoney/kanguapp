-- Kangu v1 — "hoje" no fuso de São Paulo também NO BANCO (espelha lib/day do app).
-- O Postgres do Supabase roda em UTC: `current_date` vira o dia às 21h de São
-- Paulo — bem na janela em que a volta pode rodar. O app passou a usar
-- saoPauloToday(); se só o app mudasse, app e banco divergiriam das 21h à
-- meia-noite (o trigger da G2 não acharia a perna rodando, o pai perderia a
-- jornada, e a Revisão e o início direto criariam execuções com datas
-- diferentes). Esta migration troca SÓ a fonte da data: o helper sp_today() e as
-- 4 funções que usavam current_date, recriadas com o corpo idêntico ao da
-- definição vigente (025 e 027), apenas `current_date` -> `public.sp_today()`.
-- `create or replace` preserva os grants e o trigger da 026 (aponta pelo nome).

create or replace function sp_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function enforce_route_stops_frozen_while_running()
returns trigger
language plpgsql
as $$
declare
  v_route_id uuid;
  v_running  int;
begin
  -- No DELETE a linha é OLD (NEW é nulo); em INSERT/UPDATE é NEW.
  if tg_op = 'DELETE' then
    v_route_id := old.route_id;
  else
    v_route_id := new.route_id;
  end if;

  select count(*) into v_running
  from route_executions
  where route_id = v_route_id
    and service_date = public.sp_today()
    and status = 'in_progress';

  if v_running > 0 then
    raise exception 'G2: rota com perna em andamento hoje não pode ter as paradas editadas'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;


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
   where route_id = p_route_id and service_date = public.sp_today()
     and coalesce(leg::text, 'single') = coalesce(p_leg::text, 'single');
  if not found then
    insert into route_executions (route_id, service_date, leg, status, started_at)
    values (p_route_id, public.sp_today(), p_leg, 'in_progress', now())
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
        and e.service_date = public.sp_today()
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
    and e.service_date = public.sp_today()
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
          and e.service_date = public.sp_today()
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

