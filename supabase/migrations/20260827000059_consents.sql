-- Kangu v1 — LGPD, fatia C: consentimento específico (criança, foto, vitrine) com evidência e revogação.
--
-- Regras (aprovadas): o dado real da criança só entra DEPOIS da autorização do responsável (convite-primeiro: a criança
-- só passa a existir quando o responsável envia o cadastro COM o aceite e o motorista aprova); quatro consentimentos
-- distintos e independentes; revogação por qualquer responsável suspende a criança para todos até alguém reautorizar.
--
-- Evidência por aceite: quem autorizou, qual criança, método de verificação do vínculo, versão + hash + cópia do texto
-- mostrado, caixas marcadas, IP e dispositivo, data/hora e, se houver, a revogação. O texto literal vive no código
-- (src/lib/consent-texts.ts); aqui fica a cópia do que foi exibido a cada pessoa.

create table if not exists public.consents (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('child_data', 'child_photo', 'marketplace_listing', 'marketplace_requests')),
  subject_user_id     uuid not null,
  student_id          uuid references public.students (id) on delete restrict,
  submission_id       uuid references public.capture_submissions (id) on delete set null,
  method              text not null check (method in ('remote', 'assisted_in_person', 'driver_self')),
  verification_method text not null,
  text_version        text not null,
  text_sha256         text not null,
  text_snapshot       text not null,
  checkboxes          jsonb not null default '[]'::jsonb,
  ip                  inet,
  user_agent          text,
  accepted_at         timestamptz not null default now(),
  revoked_at          timestamptz,
  revoked_by          uuid,
  revoke_ip           inet,
  constraint consents_shape check (
    (kind in ('child_data', 'child_photo') and (student_id is not null or submission_id is not null))
    or (kind in ('marketplace_listing', 'marketplace_requests') and student_id is null and submission_id is null)
  )
);
create unique index if not exists consents_one_active
  on public.consents (kind, subject_user_id, (coalesce(student_id, submission_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where revoked_at is null;
create index if not exists consents_student_idx on public.consents (student_id) where student_id is not null;
alter table public.consents enable row level security;
revoke all on table public.consents from public, anon, authenticated;
grant select on table public.consents to authenticated;
drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents for select using (subject_user_id = auth.uid());

alter table public.students
  add column if not exists consent_status text not null default 'awaiting'
  check (consent_status in ('awaiting', 'authorized', 'suspended'));

-- O status só muda pelas funções de consentimento (que ligam a flag local abaixo); qualquer outro caminho é ignorado.
create or replace function public.students_consent_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('kangu.consent_internal', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.consent_status := 'awaiting';
    elsif new.consent_status is distinct from old.consent_status then
      new.consent_status := old.consent_status;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_students_consent_guard on public.students;
create trigger trg_students_consent_guard before insert or update on public.students
  for each row execute function public.students_consent_guard();

-- Interna: grava um aceite validando o formato. Não é chamável de fora.
create or replace function public._insert_consent(
  p_kind text, p_subject uuid, p_student uuid, p_submission uuid, p_consent jsonb, p_verification text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_checks jsonb := coalesce(p_consent -> 'checks', '[]'::jsonb);
  v_need  integer := case when p_kind = 'child_data' then 2 else 0 end;
  v_method text := coalesce(p_consent ->> 'method', 'remote');
  v_ip    inet;
begin
  if p_consent is null or coalesce(p_consent ->> 'version', '') = '' or coalesce(p_consent ->> 'sha256', '') = ''
     or coalesce(p_consent ->> 'snapshot', '') = '' then
    raise exception 'Autorização incompleta.';
  end if;
  if jsonb_typeof(v_checks) <> 'array' or jsonb_array_length(v_checks) <> v_need
     or exists (select 1 from jsonb_array_elements(v_checks) c where coalesce((c ->> 'checked')::boolean, false) is not true) then
    raise exception 'É necessário marcar todas as declarações desta autorização.';
  end if;
  if v_method not in ('remote', 'assisted_in_person', 'driver_self') then
    raise exception 'Método de verificação inválido.';
  end if;
  begin v_ip := nullif(btrim(p_consent ->> 'ip'), '')::inet; exception when others then v_ip := null; end;

  insert into public.consents
    (kind, subject_user_id, student_id, submission_id, method, verification_method,
     text_version, text_sha256, text_snapshot, checkboxes, ip, user_agent)
  values
    (p_kind, p_subject, p_student, p_submission, v_method, p_verification,
     p_consent ->> 'version', p_consent ->> 'sha256', p_consent ->> 'snapshot', v_checks, v_ip,
     left(p_consent ->> 'user_agent', 400))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public._insert_consent(text, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;

-- Cadastro enviado pelo responsável: AGORA exige a autorização da criança (e, se escolhida, a da foto).
drop function if exists public.submit_capture(
  text, text, date, text, boolean, text, text, text, double precision, double precision, text, student_shift
);
create or replace function public.submit_capture(
  p_token                text,
  p_child_full_name      text,
  p_child_birth_date     date,
  p_pickup_address       text,
  p_dropoff_same         boolean,
  p_dropoff_address      text,
  p_responsible_phone    text,
  p_responsible_whatsapp text,
  p_pickup_lat           double precision default null,
  p_pickup_lng           double precision default null,
  p_school               text             default null,
  p_shift                student_shift    default null,
  p_consent              jsonb            default null,
  p_photo                jsonb            default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_link   capture_links;
  v_id     uuid;
  v_school text;
  v_shift  student_shift;
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;
  if not exists (select 1 from guardians where user_id = v_uid) then
    raise exception 'Apenas responsáveis podem enviar um cadastro.';
  end if;
  if p_child_full_name is null or btrim(p_child_full_name) = '' then
    raise exception 'Informe o nome da criança.';
  end if;
  if p_consent is null then
    raise exception 'A autorização do responsável é obrigatória para cadastrar a criança.';
  end if;

  select * into v_link from capture_links where token = p_token;
  if not found then raise exception 'Link inválido.'; end if;
  if v_link.status <> 'active' then
    raise exception 'Este link foi revogado. Peça um novo ao motorista.';
  end if;

  if v_link.kind = 'generic' then
    v_school := nullif(btrim(p_school), '');
    v_shift  := p_shift;
    if v_school is null then raise exception 'Informe a escola da criança.'; end if;
    if v_shift is null then raise exception 'Informe o turno da criança.'; end if;
  end if;

  insert into capture_submissions (
    link_id, driver_id, guardian_id, child_full_name, child_birth_date,
    pickup_address, pickup_lat, pickup_lng, dropoff_same, dropoff_address,
    responsible_phone, responsible_whatsapp, child_school, child_shift
  ) values (
    v_link.id, v_link.driver_id, v_uid, btrim(p_child_full_name), p_child_birth_date,
    p_pickup_address, p_pickup_lat, p_pickup_lng,
    coalesce(p_dropoff_same, true),
    case when coalesce(p_dropoff_same, true) then null else p_dropoff_address end,
    p_responsible_phone, p_responsible_whatsapp, v_school, v_shift
  )
  returning id into v_id;

  perform public._insert_consent('child_data', v_uid, null, v_id, p_consent,
    'Declaração do responsável (vínculo e poderes) + conta autenticada');
  if p_photo is not null then
    perform public._insert_consent('child_photo', v_uid, null, v_id, p_photo,
      'Declaração do responsável (vínculo e poderes) + conta autenticada');
  end if;

  return json_build_object('submission_id', v_id);
end;
$$;
grant execute on function public.submit_capture(
  text, text, date, text, boolean, text, text, text, double precision, double precision, text, student_shift, jsonb, jsonb
) to authenticated;

-- Aprovação: só aprova cadastro que tenha a autorização ativa; o aluno nasce 'authorized' e as evidências passam a apontar para ele.
create or replace function public.approve_capture(p_submission_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_sub        capture_submissions;
  v_link       capture_links;
  v_gname      text;
  v_gemail     text;
  v_student_id uuid;
  v_drop_addr  text;
  v_drop_lat   double precision;
  v_drop_lng   double precision;
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;

  select * into v_sub from capture_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submissão não encontrada.'; end if;
  if v_sub.driver_id <> v_uid then raise exception 'Apenas o motorista dono do link pode aprovar.'; end if;
  if v_sub.status <> 'pending' then raise exception 'Submissão já foi revisada.'; end if;

  if not exists (
    select 1 from consents
     where submission_id = p_submission_id and kind = 'child_data' and revoked_at is null
  ) then
    raise exception 'Este cadastro não tem a autorização do responsável. Peça que ele envie de novo pelo link.';
  end if;

  select * into v_link from capture_links where id = v_sub.link_id;
  select full_name into v_gname  from users      where id = v_sub.guardian_id;
  select email     into v_gemail from auth.users where id = v_sub.guardian_id;

  if v_sub.dropoff_same then
    v_drop_addr := v_sub.pickup_address;
    v_drop_lat  := v_sub.pickup_lat;
    v_drop_lng  := v_sub.pickup_lng;
  else
    v_drop_addr := v_sub.dropoff_address;
  end if;

  perform set_config('kangu.consent_internal', '1', true);

  insert into students (
    driver_id, full_name, birth_date, school, school_address, shift,
    entry_time, exit_time,
    pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    responsible_name, responsible_phone, responsible_whatsapp, responsible_email,
    status, consent_status
  ) values (
    v_sub.driver_id, v_sub.child_full_name, v_sub.child_birth_date,
    coalesce(v_link.school, v_sub.child_school), v_link.school_address,
    coalesce(v_link.shift, v_sub.child_shift),
    v_link.entry_time, v_link.exit_time,
    v_sub.pickup_address, v_sub.pickup_lat, v_sub.pickup_lng,
    v_drop_addr, v_drop_lat, v_drop_lng,
    v_gname, v_sub.responsible_phone, v_sub.responsible_whatsapp, v_gemail,
    'active', 'authorized'
  )
  returning id into v_student_id;

  insert into guardian_student (guardian_id, student_id)
  values (v_sub.guardian_id, v_student_id)
  on conflict do nothing;

  update consents set student_id = v_student_id where submission_id = p_submission_id;

  update capture_submissions
     set status = 'approved', reviewed_at = now(), student_id = v_student_id
   where id = p_submission_id;

  return json_build_object('student_id', v_student_id);
end;
$$;

-- Revogação (qualquer responsável, ou o motorista nos seus). Efeitos: criança → suspensa para todos; foto → sai do
-- aluno (o app apaga o arquivo com o caminho devolvido); vitrine → desliga; pedidos → revoga o link genérico.
create or replace function public.revoke_consent(p_consent_id uuid, p_ip text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  c      consents;
  v_path text;
  v_ip   inet;
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;
  select * into c from consents where id = p_consent_id for update;
  if not found or c.subject_user_id <> v_uid then raise exception 'Autorização não encontrada.'; end if;
  if c.revoked_at is not null then return json_build_object('kind', c.kind, 'already', true); end if;
  begin v_ip := nullif(btrim(p_ip), '')::inet; exception when others then v_ip := null; end;

  perform set_config('kangu.consent_internal', '1', true);
  update consents set revoked_at = now(), revoked_by = v_uid, revoke_ip = v_ip where id = c.id;

  if c.kind = 'child_data' then
    update students set consent_status = 'suspended' where id = c.student_id;
  elsif c.kind = 'child_photo' then
    select photo_path into v_path from students where id = c.student_id;
    update students set photo_path = null where id = c.student_id;
  elsif c.kind = 'marketplace_listing' then
    update driver_profiles set marketplace_listed = false where user_id = c.subject_user_id;
  elsif c.kind = 'marketplace_requests' then
    update capture_links set status = 'revoked'
     where driver_id = c.subject_user_id and kind = 'generic' and status = 'active';
  end if;

  return json_build_object('kind', c.kind, 'photo_path', v_path);
end;
$$;
grant execute on function public.revoke_consent(uuid, text) to authenticated;

-- Reautorizar a criança (qualquer responsável vinculado): substitui o aceite anterior dele e reativa para todos.
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
  perform set_config('kangu.consent_internal', '1', true);
  update consents set revoked_at = now(), revoked_by = v_uid
   where kind = 'child_data' and student_id = p_student_id and subject_user_id = v_uid and revoked_at is null;
  v_id := public._insert_consent('child_data', v_uid, p_student_id, null, p_consent,
    'Declaração do responsável (vínculo e poderes) + conta autenticada');
  update students set consent_status = 'authorized' where id = p_student_id;
  return json_build_object('consent_id', v_id);
end;
$$;
grant execute on function public.reauthorize_child(uuid, jsonb) to authenticated;

-- Foto (opcional, separada): só o responsável vinculado, com criança já autorizada.
create or replace function public.accept_photo_consent(p_student_id uuid, p_consent jsonb)
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
  update consents set revoked_at = now(), revoked_by = v_uid
   where kind = 'child_photo' and student_id = p_student_id and subject_user_id = v_uid and revoked_at is null;
  v_id := public._insert_consent('child_photo', v_uid, p_student_id, null, p_consent,
    'Declaração do responsável (vínculo e poderes) + conta autenticada');
  return json_build_object('consent_id', v_id);
end;
$$;
grant execute on function public.accept_photo_consent(uuid, jsonb) to authenticated;

-- Vitrine do motorista: aceite próprio (o titular é o motorista).
create or replace function public.accept_driver_consent(p_kind text, p_consent jsonb)
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
  if p_kind not in ('marketplace_listing', 'marketplace_requests') then raise exception 'Tipo inválido.'; end if;
  if not exists (select 1 from driver_profiles where user_id = v_uid) then
    raise exception 'Apenas motoristas.';
  end if;
  update consents set revoked_at = now(), revoked_by = v_uid
   where kind = p_kind and subject_user_id = v_uid and revoked_at is null;
  v_id := public._insert_consent(p_kind, v_uid, null, null, p_consent,
    'Aceite do próprio motorista (conta autenticada)');
  return json_build_object('consent_id', v_id);
end;
$$;
grant execute on function public.accept_driver_consent(text, jsonb) to authenticated;

-- Trava no banco: só liga a vitrine / cria o link de pedidos com o aceite ativo.
create or replace function public.require_marketplace_consent()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'driver_profiles' then
    if new.marketplace_listed is true and (tg_op = 'INSERT' or old.marketplace_listed is distinct from true) then
      if not exists (select 1 from public.consents where kind = 'marketplace_listing'
                       and subject_user_id = new.user_id and revoked_at is null) then
        raise exception 'consent_required: marketplace_listing';
      end if;
    end if;
  elsif tg_table_name = 'capture_links' then
    if new.kind = 'generic' and new.status = 'active' then
      if not exists (select 1 from public.consents where kind = 'marketplace_requests'
                       and subject_user_id = new.driver_id and revoked_at is null) then
        raise exception 'consent_required: marketplace_requests';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_require_listing_consent on public.driver_profiles;
create trigger trg_require_listing_consent before insert or update of marketplace_listed on public.driver_profiles
  for each row execute function public.require_marketplace_consent();
drop trigger if exists trg_require_requests_consent on public.capture_links;
create trigger trg_require_requests_consent before insert on public.capture_links
  for each row execute function public.require_marketplace_consent();
