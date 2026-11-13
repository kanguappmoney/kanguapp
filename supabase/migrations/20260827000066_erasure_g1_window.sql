-- Kangu v1 — Fatia F1: janela da G1 na exclusão/anonimização.
--
-- Problema: entre o fim da ida e o início da volta, uma exclusão (a pedido ou admin) apagava as paradas da criança que
-- ainda estava na van e ela sumia da lista da volta (G1: nunca tirar a volta de quem embarcou).
--
-- Regra: não anonimiza nem exclui o aluno que, na data de HOJE (America/Sao_Paulo), embarcou e ainda não desembarcou,
-- nem enquanto estiver numa perna in_progress.
--   • job diário: pula e tenta no dia seguinte (o job roda às 03:41 UTC = 00:41 em SP, então "hoje" já é outro dia
--     e nada é adiado além do próximo job);
--   • admin_erase_student / admin_decide_erasure: NÃO levantam erro; registram a exclusão como adiada
--     (`erasure_deferred`) e devolvem "adiada até o fim do dia por segurança da criança"; o job processa depois.
-- A G2 (trigger de paradas congeladas) NÃO é alterada: esta fatia só decide QUANDO chamar a anonimização.

create table if not exists public.erasure_deferred (
  student_id   uuid primary key,
  reason       text not null check (reason in ('subject_request', 'admin')),
  detail       text,
  requested_by uuid,
  requested_at timestamptz not null default now()
);
alter table public.erasure_deferred enable row level security;
revoke all on table public.erasure_deferred from public, anon, authenticated;

-- A criança está "em trânsito" hoje?
--  (a) embarcou hoje (qualquer execução do dia) e não há desembarque dela hoje; ou
--  (b) tem parada numa rota com perna in_progress hoje (perna nula = rota de uma perna).
create or replace function public._student_in_transit_today(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
           select 1
             from public.route_events ev
             join public.route_executions ex on ex.id = ev.execution_id
            where ev.student_id = p_student and ev.type = 'embarked' and ex.service_date = public.sp_today()
              and not exists (
                    select 1
                      from public.route_events dv
                      join public.route_executions dx on dx.id = dv.execution_id
                     where dv.student_id = p_student and dv.type = 'disembarked' and dx.service_date = public.sp_today()))
      or exists (
           select 1
             from public.route_stops rs
             join public.route_executions ex on ex.route_id = rs.route_id
            where rs.student_id = p_student and ex.service_date = public.sp_today() and ex.status = 'in_progress'
              and (ex.leg is null or rs.kind = ex.leg));
$$;
revoke all on function public._student_in_transit_today(uuid) from public, anon, authenticated;

-- Rede de segurança dentro da própria anonimização (quem a chamar sem checar não derruba a G1).
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

-- Job diário: anonimiza o que venceu os 30 dias (pulando quem está em trânsito) e executa as exclusões adiadas.
create or replace function public.anonymize_due_students()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select student_id, reason, detail, requested_by from erasure_deferred order by requested_at loop
    if public._student_in_transit_today(r.student_id) then continue; end if;
    begin
      perform public._anonymize_student(r.student_id, r.reason, r.detail, r.requested_by);
      n := n + 1;
    exception when others then
      null; -- tenta de novo no próximo job
    end;
  end loop;
  for r in select id from students where purge_after is not null and purge_after < now() and anonymized_at is null loop
    if public._student_in_transit_today(r.id) then continue; end if;
    begin
      perform public._anonymize_student(r.id, 'retention_30d', null, null);
      n := n + 1;
    exception when others then
      null; -- ex.: rota rodando hoje (G2): tenta de novo amanhã
    end;
  end loop;
  return n;
end;
$$;
revoke all on function public.anonymize_due_students() from public, anon, authenticated;

create or replace function public.admin_erase_student(p_student_id uuid, p_detail text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  if public._student_in_transit_today(p_student_id) then
    insert into erasure_deferred (student_id, reason, detail, requested_by)
    values (p_student_id, 'admin', left(p_detail, 500), auth.uid())
    on conflict (student_id) do nothing;
    return json_build_object('ok', true, 'deferred', true,
      'message', 'Exclusão adiada até o fim do dia por segurança da criança.');
  end if;
  perform public._anonymize_student(p_student_id, 'admin', left(p_detail, 500), auth.uid());
  return json_build_object('ok', true, 'deferred', false);
end;
$$;

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
  update erasure_requests
     set status = case when p_grant then 'granted' else 'denied' end,
         decided_at = now(), decided_by = auth.uid(), decision_note = v_note
   where id = p_request_id;
  if v_deferred then
    return json_build_object('ok', true, 'granted', true, 'deferred', true,
      'message', 'Exclusão adiada até o fim do dia por segurança da criança.');
  end if;
  return json_build_object('ok', true, 'granted', p_grant, 'deferred', false);
end;
$$;

revoke all on function public.admin_decide_erasure(uuid, boolean, text), public.admin_erase_student(uuid, text) from public, anon;
grant execute on function public.admin_decide_erasure(uuid, boolean, text), public.admin_erase_student(uuid, text) to authenticated;
