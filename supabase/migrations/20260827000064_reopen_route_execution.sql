-- Kangu v1 — Reabrir rota encerrada por acidente.
--
-- Problema: "Encerrar rota" grava status = 'completed' e a execução é única por rota/dia/perna, então um
-- encerramento acidental não tinha volta. Nenhum caminho do app (nem apply_route_review, que ignora
-- 'completed') reativa uma execução concluída.
--
-- Esta migration:
--   1) adiciona o evento 'execution_reopened' (trilha de auditoria: guarda o ended_at original);
--   2) reopen_route_execution(): ÚNICA porta para completed -> in_progress. Só o motorista dono, só execução
--      concluída HOJE (sp_today), reativa a MESMA execução. Não toca em route_events de embarque (G1);
--      não cria linha em route_executions (então nenhum gatilho de INSERT dispara);
--   3) trava no banco: UPDATE completed -> in_progress por qualquer outro caminho é recusado. Hoje o dono tem
--      RLS "all" em route_executions e poderia fazer isso direto pelo cliente: era um furo. A trava só fecha
--      esse par de estados; nenhuma transição que o app usa hoje (scheduled/canceled -> in_progress,
--      in_progress -> completed) é afetada;
--   4) get_active_journey: 'ended' deixa de ser "existe algum route_ended" e passa a ser "existe route_ended
--      POSTERIOR à última reabertura". Sem isso o pai veria "Rota concluída" numa rota reaberta e em andamento.
--      Resto da função idêntico à da migration 033 (G5/G6 intactos).
--
-- G4: o GPS apagado no encerramento NÃO é restaurado; a posição só volta pela janela normal (in_progress + foreground).

alter type route_event_type add value if not exists 'execution_reopened';

create or replace function public.guard_execution_reopen()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kangu.reopen_execution', true), '') <> '1' then
    raise exception 'Uma rota encerrada só pode ser reaberta pela função de reabertura.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_execution_reopen on public.route_executions;
create trigger trg_guard_execution_reopen
  before update of status on public.route_executions
  for each row
  when (old.status = 'completed' and new.status = 'in_progress')
  execute function public.guard_execution_reopen();

create or replace function public.reopen_route_execution(p_execution_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_exec   route_executions;
  v_driver uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_exec from route_executions where id = p_execution_id for update;
  if not found then
    raise exception 'Apenas o motorista dono da rota pode reabri-la.';
  end if;
  select driver_id into v_driver from routes where id = v_exec.route_id;
  if v_driver is distinct from v_uid then
    raise exception 'Apenas o motorista dono da rota pode reabri-la.';
  end if;
  if v_exec.status <> 'completed' then
    raise exception 'Só uma rota encerrada pode ser reaberta.';
  end if;
  if v_exec.service_date <> public.sp_today() then
    raise exception 'Só é possível reabrir uma rota encerrada hoje.';
  end if;

  perform set_config('kangu.reopen_execution', '1', true);
  update route_executions
     set status = 'in_progress', ended_at = null
   where id = p_execution_id;
  perform set_config('kangu.reopen_execution', '', true);

  insert into route_events (execution_id, type, metadata, created_at)
  values (p_execution_id, 'execution_reopened',
          jsonb_build_object('previous_status', 'completed', 'previous_ended_at', v_exec.ended_at),
          clock_timestamp());

  return json_build_object('execution_id', p_execution_id);
end;
$$;

revoke all on function public.reopen_route_execution(uuid) from public, anon;
grant execute on function public.reopen_route_execution(uuid) to authenticated;

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
      exists (select 1 from route_events re
               where re.execution_id = v_exec.id
                 and re.type = 'route_ended'
                 and re.created_at > coalesce(
                       (select max(x.created_at) from route_events x
                         where x.execution_id = v_exec.id and x.type = 'execution_reopened'),
                       '-infinity'::timestamptz)),
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
