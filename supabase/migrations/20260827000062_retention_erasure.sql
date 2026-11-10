-- Kangu v1 — LGPD, fatia D: retenção e exclusão.
--
--  • Anonimização: `_anonymize_student` apaga os dados pessoais da criança e tudo que a liga a pessoas, mantendo só o
--    esqueleto financeiro (id, motorista, valores, vencimento, situação de pagamento) e as evidências de consentimento
--    (exceções de retenção a confirmar com o jurídico). Faturas ficam (invoices.student_id é RESTRICT por desenho).
--  • Retenção de 30 dias: ao perder o vínculo (aluno arquivado) ou ao ser suspenso por revogação, começa o relógio
--    (`purge_after = agora + 30 dias`); reautorizar/desarquivar zera. Job diário anonimiza o que venceu.
--  • Exclusão procedente não espera: o responsável PEDE (`request_erasure`), o admin decide (`admin_decide_erasure`) ou
--    executa direto (`admin_erase_student`) — anonimiza na hora.
--  • Cadastro rejeitado não deixa nada: `reject_capture` apaga a submissão e a autorização dela; submissões paradas há
--    mais de 30 dias também são apagadas pelo job.
--  • Livro-razão de exclusões (`erasure_ledger`): só ids + data + motivo, sem nome. É a lista para reaplicar exclusões se um
--    backup for restaurado (restaurar volta o banco ao estado do snapshot e "desfaz" exclusões posteriores).
--  • Fotos: o armazenamento não aceita DELETE direto por SQL, então os caminhos vão para `storage_purge_queue` e são
--    removidos pela API (script/admin). Foto também é apagada na hora quando o responsável retira a autorização.

alter table public.students
  add column if not exists purge_after   timestamptz,
  add column if not exists anonymized_at timestamptz;

create table if not exists public.erasure_ledger (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null,
  driver_id   uuid not null,
  reason      text not null check (reason in ('retention_30d', 'subject_request', 'admin')),
  detail      text,
  executed_at timestamptz not null default now(),
  executed_by uuid
);
create table if not exists public.storage_purge_queue (
  id        bigint generated always as identity primary key,
  bucket    text not null,
  path      text not null,
  reason    text,
  queued_at timestamptz not null default now()
);
create table if not exists public.erasure_requests (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null,
  requested_by  uuid not null,
  note          text,
  status        text not null default 'pending' check (status in ('pending', 'granted', 'denied')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid,
  decision_note text
);
create unique index if not exists erasure_requests_one_pending
  on public.erasure_requests (student_id, requested_by) where status = 'pending';
alter table public.erasure_ledger enable row level security;
alter table public.storage_purge_queue enable row level security;
alter table public.erasure_requests enable row level security;
revoke all on table public.erasure_ledger, public.storage_purge_queue, public.erasure_requests from public, anon, authenticated;
grant select on table public.erasure_requests to authenticated;
drop policy if exists erasure_requests_own on public.erasure_requests;
create policy erasure_requests_own on public.erasure_requests for select using (requested_by = auth.uid());

-- Relógio dos 30 dias (roda depois da trava de consentimento, que muda consent_status).
create or replace function public.students_retention_timer()
returns trigger
language plpgsql
as $$
begin
  if new.anonymized_at is not null then return new; end if;
  if (new.status = 'archived' and old.status is distinct from 'archived')
     or (new.consent_status = 'suspended' and old.consent_status is distinct from 'suspended') then
    new.purge_after := coalesce(new.purge_after, now() + interval '30 days');
  elsif new.status = 'active' and new.consent_status = 'authorized' then
    new.purge_after := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_students_retention on public.students;
create trigger trg_students_retention before update on public.students
  for each row execute function public.students_retention_timer();

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
    pickup_lat = null, pickup_lng = null, dropoff_address = null, dropoff_lat = null, dropoff_lng = null,
    responsible_name = null, responsible_phone = null, responsible_whatsapp = null, responsible_email = null,
    photo_path = null, status = 'archived', consent_status = 'suspended', purge_after = null, anonymized_at = now()
  where id = p_student;

  insert into erasure_ledger (student_id, driver_id, reason, detail, executed_by)
  values (p_student, s.driver_id, p_reason, p_detail, p_actor);
end;
$$;
revoke all on function public._anonymize_student(uuid, text, text, uuid) from public, anon, authenticated;

-- Job diário: anonimiza o que venceu os 30 dias e apaga cadastros rejeitados / parados há mais de 30 dias.
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
  for r in select id from students where purge_after is not null and purge_after < now() and anonymized_at is null loop
    begin
      perform public._anonymize_student(r.id, 'retention_30d', null, null);
      n := n + 1;
    exception when others then
      -- ex.: rota rodando hoje (G2): tenta de novo amanhã
      null;
    end;
  end loop;
  return n;
end;
$$;
revoke all on function public.anonymize_due_students() from public, anon, authenticated;

create or replace function public.purge_stale_submissions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  delete from consents
   where student_id is null
     and submission_id in (
       select id from capture_submissions
        where status = 'rejected' or (status = 'pending' and created_at < now() - interval '30 days')
     );
  delete from capture_submissions
   where status = 'rejected' or (status = 'pending' and created_at < now() - interval '30 days');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_stale_submissions() from public, anon, authenticated;

-- Rejeitar apaga: a submissão (nome, endereço, contato da criança) e a autorização dela somem na hora.
create or replace function public.reject_capture(p_submission_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub capture_submissions;
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;
  select * into v_sub from capture_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submissão não encontrada.'; end if;
  if v_sub.driver_id <> v_uid then raise exception 'Apenas o motorista dono do link pode rejeitar.'; end if;
  if v_sub.status <> 'pending' then raise exception 'Submissão já foi revisada.'; end if;
  delete from consents where submission_id = p_submission_id and student_id is null;
  delete from capture_submissions where id = p_submission_id;
  return json_build_object('ok', true);
end;
$$;

-- Reautorizar não ressuscita criança já removida.
create or replace function public.reauthorize_child(p_student_id uuid, p_consent jsonb)
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
  if exists (select 1 from students where id = p_student_id and anonymized_at is not null) then
    raise exception 'Os dados desta criança já foram removidos.';
  end if;
  perform set_config('kangu.consent_internal', '1', true);
  update consents set revoked_at = now(), revoked_by = v_uid
   where kind = 'child_data' and student_id = p_student_id and subject_user_id = v_uid and revoked_at is null;
  v_id := public._insert_consent('child_data', v_uid, p_student_id, null, p_consent,
    'Declaração do responsável (vínculo e poderes) + conta autenticada');
  update students set consent_status = 'authorized' where id = p_student_id;
  return json_build_object('consent_id', v_id);
end;
$$;

-- Pedido de exclusão (responsável vinculado). A decisão é do admin.
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
  values (p_student_id, v_uid, left(nullif(btrim(p_note), ''), 500))
  on conflict (student_id, requested_by) where status = 'pending' do nothing
  returning id into v_id;
  return json_build_object('request_id', v_id);
end;
$$;
grant execute on function public.request_erasure(uuid, text) to authenticated;

create or replace function public.admin_list_erasure_requests()
returns setof public.erasure_requests
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query select * from public.erasure_requests order by (status = 'pending') desc, created_at desc limit 200;
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
begin
  perform public.admin_assert();
  select * into r from erasure_requests where id = p_request_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if r.status <> 'pending' then raise exception 'Pedido já decidido.'; end if;
  if p_grant then
    perform public._anonymize_student(r.student_id, 'subject_request', left(p_note, 500), auth.uid());
  end if;
  update erasure_requests
     set status = case when p_grant then 'granted' else 'denied' end,
         decided_at = now(), decided_by = auth.uid(), decision_note = left(p_note, 500)
   where id = p_request_id;
  return json_build_object('ok', true, 'granted', p_grant);
end;
$$;

create or replace function public.admin_erase_student(p_student_id uuid, p_detail text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  perform public._anonymize_student(p_student_id, 'admin', left(p_detail, 500), auth.uid());
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_erasure_ledger()
returns setof public.erasure_ledger
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query select * from public.erasure_ledger order by executed_at desc limit 500;
end;
$$;

revoke all on function public.admin_list_erasure_requests(), public.admin_erasure_ledger() from public, anon;
revoke all on function public.admin_decide_erasure(uuid, boolean, text), public.admin_erase_student(uuid, text) from public, anon;
grant execute on function public.admin_list_erasure_requests(), public.admin_erasure_ledger() to authenticated;
grant execute on function public.admin_decide_erasure(uuid, boolean, text), public.admin_erase_student(uuid, text) to authenticated;

-- Limpeza única: cadastros rejeitados que já existiam.
delete from public.consents
 where student_id is null
   and submission_id in (select id from public.capture_submissions where status = 'rejected');
delete from public.capture_submissions where status = 'rejected';

select cron.schedule(
  'kangu_retention_daily',
  '41 3 * * *',
  $cron$select public.anonymize_due_students(), public.purge_stale_submissions()$cron$
);
