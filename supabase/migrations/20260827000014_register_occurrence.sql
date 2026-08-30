-- Kangu v1 — Ocorrência + fan-out de notificação (SECURITY DEFINER).
-- Um único ponto de entrada que:
--   1) VALIDA que auth.uid() é o motorista dono da execução — antes de criar
--      qualquer coisa. Se não for dono, levanta exceção (nada é inserido).
--   2) Insere a ocorrência.
--   3) Notifica SÓ os pais VINCULADOS a alunos daquela rota (G5) — nunca um pai
--      não-vinculado. O `notifications` não tem policy de INSERT de propósito:
--      esta função é o único caminho de fan-out.
--   4) Texto GENÉRICO por tipo — nunca nome/endereço/dado de outra criança.

create or replace function register_occurrence(
  p_execution_id uuid,
  p_type occurrence_type,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_route_id  uuid;
  v_occ_id    uuid;
  v_msg       text;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  -- (1) dono da execução? (join execução -> rota -> driver)
  select r.id
    into v_route_id
  from route_executions e
  join routes r on r.id = e.route_id
  where e.id = p_execution_id
    and r.driver_id = v_uid;

  if not found then
    raise exception 'Apenas o motorista dono da execução pode registrar ocorrência.';
  end if;

  -- (2) insere a ocorrência
  insert into occurrences (execution_id, driver_id, type, note)
  values (p_execution_id, v_uid, p_type, p_note)
  returning id into v_occ_id;

  -- (4) texto genérico — sem qualquer dado de criança
  v_msg := case p_type
    when 'traffic'        then 'A sua rota de hoje está enfrentando trânsito.'
    when 'delay'          then 'Houve um atraso na sua rota de hoje.'
    when 'breakdown'      then 'A van teve um problema mecânico na sua rota de hoje.'
    when 'vehicle_change' then 'Houve uma troca de veículo na sua rota de hoje.'
    else 'Aviso sobre a sua rota de hoje.'
  end;

  -- (3) fan-out só para pais VINCULADOS a alunos desta rota (distinct = 1 por pai)
  insert into notifications (user_id, title, body, channel, metadata)
  select distinct gs.guardian_id,
         'Aviso da rota',
         v_msg,
         'in_app',
         jsonb_build_object('occurrence_id', v_occ_id, 'type', p_type::text)
  from route_stops rs
  join guardian_student gs on gs.student_id = rs.student_id
  where rs.route_id = v_route_id;

  return v_occ_id;
end;
$$;

grant execute on function register_occurrence(uuid, occurrence_type, text) to authenticated;
