-- Kangu — Escola só da lista do motorista + endereço em campos separados (rua, número, bairro, cidade).
--
-- 1) O link deixa de trazer a escola pré-selecionada: o responsável escolhe, e o banco só aceita escola que o
--    motorista dono do link atende (`driver_schools`). Sem escola cadastrada pelo motorista, o cadastro é recusado.
--    O link por turno passa a exigir só o turno (a escola deixa de fazer parte do link).
-- 2) Endereço de embarque e desembarque em 4 campos obrigatórios; `pickup_address`/`dropoff_address` continuam
--    como texto composto (o resto do app lê esse texto), agora montado SEMPRE no banco a partir das partes.

alter table public.students
  add column if not exists pickup_street text, add column if not exists pickup_number text,
  add column if not exists pickup_neighborhood text, add column if not exists pickup_city text,
  add column if not exists dropoff_street text, add column if not exists dropoff_number text,
  add column if not exists dropoff_neighborhood text, add column if not exists dropoff_city text;

alter table public.capture_submissions
  add column if not exists pickup_street text, add column if not exists pickup_number text,
  add column if not exists pickup_neighborhood text, add column if not exists pickup_city text,
  add column if not exists dropoff_street text, add column if not exists dropoff_number text,
  add column if not exists dropoff_neighborhood text, add column if not exists dropoff_city text;

alter table public.capture_links drop constraint if exists capture_links_kind_shape;
alter table public.capture_links add constraint capture_links_kind_shape check (
  (kind = 'scoped'  and shift is not null)
  or
  (kind = 'generic' and shift is null and school is null)
);

create or replace function public._school_key(p text)
returns text language sql immutable as $$
  select lower(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[,;\r\n]+', ' ', 'g'), '\s+', ' ', 'g')))
$$;

create or replace function public._driver_serves_school(p_driver uuid, p_school text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.driver_schools ds
      join public.schools s on s.inep_code = ds.inep_code
     where ds.driver_id = p_driver
       and public._school_key(p_school) <> ''
       and public._school_key(coalesce(s.display_name, s.name)) = public._school_key(p_school)
  )
$$;
revoke all on function public._driver_serves_school(uuid, text) from public, anon, authenticated;

-- Valida e normaliza as 4 partes; devolve jsonb limpo ou levanta erro com o rótulo ("Embarque"/"Desembarque").
create or replace function public._address_parts(p jsonb, p_label text)
returns jsonb language plpgsql immutable as $$
declare
  v_street text := nullif(btrim(p->>'street'), '');
  v_number text := nullif(btrim(p->>'number'), '');
  v_neigh  text := nullif(btrim(p->>'neighborhood'), '');
  v_city   text := nullif(btrim(p->>'city'), '');
begin
  if v_street is null then raise exception '% — informe a rua.', p_label; end if;
  if v_number is null then raise exception '% — informe o número (use S/N se não houver).', p_label; end if;
  if v_neigh  is null then raise exception '% — informe o bairro.', p_label; end if;
  if v_city   is null then raise exception '% — informe a cidade.', p_label; end if;
  return jsonb_build_object('street', v_street, 'number', v_number, 'neighborhood', v_neigh, 'city', v_city);
end;
$$;

create or replace function public._compose_address(p jsonb)
returns text language sql immutable as $$
  select (p->>'street') || ', ' || (p->>'number') || ' - ' || (p->>'neighborhood') || ', ' || (p->>'city')
$$;

-- Prévia pública: a escola do link deixa de ser exibida/usada (links antigos continuam válidos).
create or replace function public.get_capture_link_preview(p_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  select cl.status, cl.kind, cl.shift, cl.entry_time, cl.exit_time, u.full_name as driver_name
    into v
    from capture_links cl join users u on u.id = cl.driver_id
   where cl.token = p_token;
  if not found then return null; end if;
  return json_build_object(
    'status', v.status, 'kind', v.kind, 'shift', v.shift,
    'school', null, 'school_address', null,
    'entry_time', v.entry_time, 'exit_time', v.exit_time, 'driver_name', v.driver_name
  );
end;
$$;

drop function if exists public.submit_capture(
  text, text, date, text, boolean, text, text, text, double precision, double precision, text, student_shift, jsonb, jsonb
);
create or replace function public.submit_capture(
  p_token                text,
  p_child_full_name      text,
  p_child_birth_date     date,
  p_pickup               jsonb,
  p_dropoff_same         boolean,
  p_dropoff              jsonb,
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
  v_school text := nullif(btrim(p_school), '');
  v_shift  student_shift;
  v_pick   jsonb;
  v_drop   jsonb;
  v_same   boolean := coalesce(p_dropoff_same, true);
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

  if v_school is null then raise exception 'Informe a escola da criança.'; end if;
  if not public._driver_serves_school(v_link.driver_id, v_school) then
    raise exception 'Escolha uma das escolas que este motorista atende.';
  end if;

  if v_link.kind = 'generic' then
    v_shift := p_shift;
    if v_shift is null then raise exception 'Informe o turno da criança.'; end if;
  end if;

  v_pick := public._address_parts(p_pickup, 'Embarque');
  if not v_same then v_drop := public._address_parts(p_dropoff, 'Desembarque'); end if;

  insert into capture_submissions (
    link_id, driver_id, guardian_id, child_full_name, child_birth_date,
    pickup_address, pickup_lat, pickup_lng, dropoff_same, dropoff_address,
    pickup_street, pickup_number, pickup_neighborhood, pickup_city,
    dropoff_street, dropoff_number, dropoff_neighborhood, dropoff_city,
    responsible_phone, responsible_whatsapp, child_school, child_shift
  ) values (
    v_link.id, v_link.driver_id, v_uid, btrim(p_child_full_name), p_child_birth_date,
    public._compose_address(v_pick), p_pickup_lat, p_pickup_lng, v_same,
    case when v_same then null else public._compose_address(v_drop) end,
    v_pick->>'street', v_pick->>'number', v_pick->>'neighborhood', v_pick->>'city',
    v_drop->>'street', v_drop->>'number', v_drop->>'neighborhood', v_drop->>'city',
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
  text, text, date, jsonb, boolean, jsonb, text, text, double precision, double precision, text, student_shift, jsonb, jsonb
) to authenticated;

-- Aprovação: escola vem da escolha do responsável; endereço leva as partes.
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
    pickup_street, pickup_number, pickup_neighborhood, pickup_city,
    dropoff_street, dropoff_number, dropoff_neighborhood, dropoff_city,
    responsible_name, responsible_phone, responsible_whatsapp, responsible_email,
    status, consent_status
  ) values (
    v_sub.driver_id, v_sub.child_full_name, v_sub.child_birth_date,
    coalesce(v_sub.child_school, v_link.school),
    case when v_sub.child_school is null or public._school_key(v_sub.child_school) = public._school_key(v_link.school)
         then v_link.school_address end,
    coalesce(v_link.shift, v_sub.child_shift),
    v_link.entry_time, v_link.exit_time,
    v_sub.pickup_address, v_sub.pickup_lat, v_sub.pickup_lng,
    v_drop_addr, v_drop_lat, v_drop_lng,
    v_sub.pickup_street, v_sub.pickup_number, v_sub.pickup_neighborhood, v_sub.pickup_city,
    case when v_sub.dropoff_same then v_sub.pickup_street else v_sub.dropoff_street end,
    case when v_sub.dropoff_same then v_sub.pickup_number else v_sub.dropoff_number end,
    case when v_sub.dropoff_same then v_sub.pickup_neighborhood else v_sub.dropoff_neighborhood end,
    case when v_sub.dropoff_same then v_sub.pickup_city else v_sub.dropoff_city end,
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

-- Anonimização passa a zerar também as partes do endereço (LGPD).
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
    pickup_street = null, pickup_number = null, pickup_neighborhood = null, pickup_city = null,
    dropoff_street = null, dropoff_number = null, dropoff_neighborhood = null, dropoff_city = null,
    pickup_lat = null, pickup_lng = null, dropoff_address = null, dropoff_lat = null, dropoff_lng = null,
    responsible_name = null, responsible_phone = null, responsible_whatsapp = null, responsible_email = null,
    photo_path = null, status = 'archived', consent_status = 'suspended', purge_after = null, anonymized_at = now()
  where id = p_student;

  insert into erasure_ledger (student_id, driver_id, reason, detail, executed_by)
  values (p_student, s.driver_id, p_reason, p_detail, p_actor);
end;
$$;
