-- Kangu v1 — Link de captação — Fatia 4: fila de aprovação (portão G5).
-- O motorista confere o que o pai preencheu e aprova conscientemente. SÓ na
-- aprovação a criança vira um `students` real (active) e o pai é vinculado.
-- Rejeitar não cria nada. Isso evita cadastro-fantasma e preserva a G5: ninguém
-- entra na operação sem o toque do motorista.

-- Rastreio: qual aluno saiu de cada submissão aprovada (auditoria).
alter table capture_submissions
  add column student_id uuid references students (id) on delete set null;

-- ---------------------------------------------------------------------------
-- approve_capture — cria o aluno a partir da submissão + do contexto do link,
-- vincula o responsável e marca a submissão como aprovada. Só o motorista dono
-- da submissão pode aprovar (checado aqui, não só na RLS — a função é DEFINER).
-- ---------------------------------------------------------------------------
create or replace function approve_capture(p_submission_id uuid)
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
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_sub from capture_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submissão não encontrada.';
  end if;
  if v_sub.driver_id <> v_uid then
    raise exception 'Apenas o motorista dono do link pode aprovar.';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'Submissão já foi revisada.';
  end if;

  select * into v_link from capture_links where id = v_sub.link_id;

  -- Nome do responsável vem da conta dele (users); e-mail, de auth.users.
  select full_name into v_gname  from users      where id = v_sub.guardian_id;
  select email     into v_gemail from auth.users where id = v_sub.guardian_id;

  -- Desembarque: mesmo endereço => copia casa (inclui a coordenada geocodada).
  if v_sub.dropoff_same then
    v_drop_addr := v_sub.pickup_address;
    v_drop_lat  := v_sub.pickup_lat;
    v_drop_lng  := v_sub.pickup_lng;
  else
    v_drop_addr := v_sub.dropoff_address;
  end if;

  insert into students (
    driver_id, full_name, birth_date, school, school_address, shift,
    entry_time, exit_time,
    pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    responsible_name, responsible_phone, responsible_whatsapp, responsible_email,
    status
  ) values (
    v_sub.driver_id, v_sub.child_full_name, v_sub.child_birth_date,
    v_link.school, v_link.school_address, v_link.shift,
    v_link.entry_time, v_link.exit_time,
    v_sub.pickup_address, v_sub.pickup_lat, v_sub.pickup_lng,
    v_drop_addr, v_drop_lat, v_drop_lng,
    v_gname, v_sub.responsible_phone, v_sub.responsible_whatsapp, v_gemail,
    'active'
  )
  returning id into v_student_id;

  insert into guardian_student (guardian_id, student_id)
  values (v_sub.guardian_id, v_student_id)
  on conflict do nothing;

  update capture_submissions
     set status = 'approved', reviewed_at = now(), student_id = v_student_id
   where id = p_submission_id;

  return json_build_object('student_id', v_student_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_capture — recusa a submissão. NÃO cria aluno nem vínculo.
-- ---------------------------------------------------------------------------
create or replace function reject_capture(p_submission_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub capture_submissions;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_sub from capture_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submissão não encontrada.';
  end if;
  if v_sub.driver_id <> v_uid then
    raise exception 'Apenas o motorista dono do link pode rejeitar.';
  end if;
  if v_sub.status <> 'pending' then
    raise exception 'Submissão já foi revisada.';
  end if;

  update capture_submissions
     set status = 'rejected', reviewed_at = now()
   where id = p_submission_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function approve_capture(uuid) to authenticated;
grant execute on function reject_capture(uuid)  to authenticated;
