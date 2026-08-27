-- Kangu v1 — Jornada ativa do responsável (Linha do tempo, G6)
-- G5/LGPD: pela RLS o pai só vê a parada/eventos do PRÓPRIO filho. Portanto a
-- contagem anônima "X de N paradas" não pode ser montada no cliente. Esta
-- função SECURITY DEFINER devolve só AGREGADOS (totais) + os filhos do próprio
-- responsável — nunca nome/posição de outra criança.
--
-- Alimentada apenas por route_events (sem GPS) — é a base do modo Linha do tempo.

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
  select e.id, e.route_id, r.name as route_name, r.direction
    into v_exec
  from route_executions e
  join routes r on r.id = e.route_id
  join route_stops rs on rs.route_id = r.id
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
    'total_stops',
      (select count(*) from route_stops where route_id = v_exec.route_id),
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
    )
  );
end;
$$;

grant execute on function get_active_journey() to authenticated;
