-- Kangu v1 — Fatia F2: texto livre que poderia coletar dado de saúde/deficiência/neurodivergência.
--
-- Campos livres hoje (varredura): occurrences.note (motorista, na ocorrência), route_exceptions.reason (motorista, motivo de
-- dia pulado/extra) e erasure_requests.note (responsável, motivo do pedido de exclusão). Esta migration:
--   1) limita o tamanho no BANCO (check, NOT VALID: vale para o que for gravado daqui em diante);
--   2) fecha a leitura de occurrences.note ao responsável: a policy occurrences_select_guardian deixava qualquer
--      responsável com filho na execução ler a nota do motorista por RLS, que pode citar outras crianças. O aviso ao pai
--      já é genérico (notifications) e nenhuma tela do pai lê esta tabela. Leem agora: o motorista autor e (via service/SQL) o admin;
--   3) a anonimização de um aluno zera occurrences.note das execuções de que ele participou (a ocorrência não tem vínculo
--      direto com aluno: critério = execuções em que ele tem evento de rota, ou parada na rota no período em que foi aluno);
--   4) o motivo livre do pedido de exclusão (erasure_requests.note) é zerado quando o pedido é resolvido (concedido ou negado).
-- Regra: NÃO criar campo de motivo livre em absences nem novo campo livre sobre criança sem texto do jurídico.

alter table public.occurrences
  drop constraint if exists occurrences_note_len,
  add constraint occurrences_note_len check (note is null or char_length(note) <= 200) not valid;
alter table public.route_exceptions
  drop constraint if exists route_exceptions_reason_len,
  add constraint route_exceptions_reason_len check (reason is null or char_length(reason) <= 120) not valid;
alter table public.erasure_requests
  drop constraint if exists erasure_requests_note_len,
  add constraint erasure_requests_note_len check (note is null or char_length(note) <= 300) not valid;

drop policy if exists occurrences_select_guardian on public.occurrences;

create or replace function public.register_occurrence(
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

  select r.id
    into v_route_id
  from route_executions e
  join routes r on r.id = e.route_id
  where e.id = p_execution_id
    and r.driver_id = v_uid;

  if not found then
    raise exception 'Apenas o motorista dono da execução pode registrar ocorrência.';
  end if;

  insert into occurrences (execution_id, driver_id, type, note)
  values (p_execution_id, v_uid, p_type, left(nullif(btrim(p_note), ''), 200))
  returning id into v_occ_id;

  v_msg := case p_type
    when 'traffic'        then 'A sua rota de hoje está enfrentando trânsito.'
    when 'delay'          then 'Houve um atraso na sua rota de hoje.'
    when 'breakdown'      then 'A van teve um problema mecânico na sua rota de hoje.'
    when 'vehicle_change' then 'Houve uma troca de veículo na sua rota de hoje.'
    else 'Aviso sobre a sua rota de hoje.'
  end;

  insert into notifications (user_id, title, body, channel, metadata)
  select distinct gs.guardian_id,
         'Aviso da rota',
         v_msg,
         'in_app'::delivery_channel,
         jsonb_build_object('occurrence_id', v_occ_id, 'type', p_type::text)
  from route_stops rs
  join guardian_student gs on gs.student_id = rs.student_id
  where rs.route_id = v_route_id;

  return v_occ_id;
end;
$$;

create or replace function public.request_erasure(p_student_id uuid, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;
  if not exists (select 1 from guardian_student where guardian_id = v_uid and student_id = p_student_id) then
    raise exception 'Você não é responsável vinculado a esta criança.';
  end if;
  insert into erasure_requests (student_id, requested_by, note)
  values (p_student_id, v_uid, left(nullif(btrim(p_note), ''), 300))
  on conflict (student_id, requested_by) where status = 'pending' do nothing
  returning id into v_id;
  return json_build_object('request_id', v_id);
end;
$$;
grant execute on function public.request_erasure(uuid, text) to authenticated;

create or replace function public._anonymize_student(p_student uuid, p_reason text, p_detail text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s students;
begin
  select * into s from students where id = p_student for update;
  if not found or s.anonymized_at is not null then return; end if;
  if public._student_in_transit_today(p_student) then
    raise exception 'Criança em trânsito hoje: exclusão adiada até o fim do dia por segurança da criança.' using errcode = '55000';
  end if;
  perform set_config('kangu.consent_internal', '1', true);

  if s.photo_path is not null then
    insert into storage_purge_queue (bucket, path, reason) values ('student-photos', s.photo_path, p_reason);
  end if;

  -- Notas livres das ocorrências das execuções de que a criança participou (antes de apagar paradas/eventos).
  update occurrences set note = null
   where note is not null
     and execution_id in (
           select ev.execution_id from route_events ev where ev.student_id = p_student
           union
           select ex.id from route_executions ex
             join route_stops rs on rs.route_id = ex.route_id
            where rs.student_id = p_student and ex.service_date >= s.created_at::date);

  delete from route_stops where student_id = p_student;
  delete from guardian_student where student_id = p_student;
  delete from student_invites where student_id = p_student;
  delete from absences where student_id = p_student;
  delete from capture_submissions where student_id = p_student;
  update route_events set student_id = null where student_id = p_student;

  update students set
    full_name = 'Aluno removido', birth_date = null, school = null, school_address = null, school_lat = null,
    school_lng = null, shift = null, turma = null, entry_time = null, exit_time = null, pickup_address = null,
    pickup_street = null, pickup_number = null, pickup_neighborhood = null, pickup_city = null,
    dropoff_street = null, dropoff_number = null, dropoff_neighborhood = null, dropoff_city = null,
    pickup_lat = null, pickup_lng = null, dropoff_address = null, dropoff_lat = null, dropoff_lng = null,
    responsible_name = null, responsible_phone = null, responsible_whatsapp = null, responsible_email = null,
    photo_path = null, status = 'archived', consent_status = 'suspended', purge_after = null, anonymized_at = now()
  where id = p_student;

  insert into erasure_ledger (student_id, driver_id, reason, detail, executed_by)
  values (p_student, s.driver_id, p_reason, p_detail, p_actor);
  delete from erasure_deferred where student_id = p_student;
end;
$$;
revoke all on function public._anonymize_student(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.admin_decide_erasure(p_request_id uuid, p_grant boolean, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r erasure_requests;
  v_deferred boolean := false;
  v_note text := left(p_note, 500);
begin
  perform public.admin_assert();
  select * into r from erasure_requests where id = p_request_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if r.status <> 'pending' then raise exception 'Pedido já decidido.'; end if;
  if p_grant then
    if public._student_in_transit_today(r.student_id) then
      insert into erasure_deferred (student_id, reason, detail, requested_by)
      values (r.student_id, 'subject_request', v_note, auth.uid())
      on conflict (student_id) do nothing;
      v_deferred := true;
      v_note := left(coalesce(v_note || ' · ', '') || 'Exclusão adiada até o fim do dia por segurança da criança.', 500);
    else
      perform public._anonymize_student(r.student_id, 'subject_request', v_note, auth.uid());
    end if;
  end if;
  -- O motivo livre do responsável some quando o pedido é resolvido (concedido ou negado).
  update erasure_requests
     set status = case when p_grant then 'granted' else 'denied' end,
         decided_at = now(), decided_by = auth.uid(), decision_note = v_note, note = null
   where id = p_request_id;
  if v_deferred then
    return json_build_object('ok', true, 'granted', true, 'deferred', true,
      'message', 'Exclusão adiada até o fim do dia por segurança da criança.');
  end if;
  return json_build_object('ok', true, 'granted', p_grant, 'deferred', false);
end;
$$;
revoke all on function public.admin_decide_erasure(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_erasure(uuid, boolean, text) to authenticated;
