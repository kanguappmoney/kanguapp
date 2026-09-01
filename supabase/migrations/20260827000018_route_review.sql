-- Kangu v1 — Financeiro Fatia 3: G1/G2 na Revisão de hoje.
-- A lógica das guardas vive no banco (à prova de bypass) e é testável:
--   G1 — nunca bloquear a volta de quem embarcou. Se a rota é 'inbound' (volta)
--        e o aluno tem 'embarked' numa execução de HOJE → inclusão FORÇADA,
--        nunca pulo (mesmo se o id vier na lista de pulos).
--   G2 — nada é pulado sem confirmação. O pulo (stop_skipped_billing) só é
--        gravado para os alunos que o motorista confirmou (p_skip_student_ids),
--        e só quando esta função é chamada (o "Confirmar e iniciar"). Nunca
--        automático. "Levar mesmo assim" = ficar fora da lista → forçado.

-- Leitura da revisão: alunos 'blocked' na rota + flag g1_forced. (SECURITY
-- DEFINER, valida dono; a G1 é calculada aqui, no mesmo lugar que a aplicação.)
create or replace function get_suspension_review(p_route_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dir route_direction;
begin
  select direction into v_dir from routes where id = p_route_id and driver_id = v_uid;
  if not found then
    raise exception 'Apenas o motorista dono da rota.';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'student_id', s.id,
      'name', s.full_name,
      'g1_forced', (v_dir = 'inbound') and exists (
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
      and s.pay_status = 'blocked'
  );
end;
$$;

-- Aplica as decisões e inicia a execução. Retorna o id da execução.
create or replace function apply_route_review(
  p_route_id uuid,
  p_skip_student_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_dir    route_direction;
  v_exec   uuid;
  r        record;
  v_g1     boolean;
begin
  select direction into v_dir from routes where id = p_route_id and driver_id = v_uid;
  if not found then
    raise exception 'Apenas o motorista dono da rota.';
  end if;

  -- cria/retoma a execução de hoje e coloca em andamento
  select id into v_exec from route_executions
   where route_id = p_route_id and service_date = current_date;
  if not found then
    insert into route_executions (route_id, service_date, status, started_at)
    values (p_route_id, current_date, 'in_progress', now())
    returning id into v_exec;
    insert into route_events (execution_id, type) values (v_exec, 'route_started');
  else
    update route_executions set status = 'in_progress', started_at = coalesce(started_at, now())
     where id = v_exec and status <> 'completed';
  end if;

  -- decide por aluno blocked
  for r in
    select s.id as student_id
    from route_stops rs
    join students s on s.id = rs.student_id
    where rs.route_id = p_route_id and s.pay_status = 'blocked'
  loop
    v_g1 := (v_dir = 'inbound') and exists (
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

grant execute on function get_suspension_review(uuid) to authenticated;
grant execute on function apply_route_review(uuid, uuid[]) to authenticated;
