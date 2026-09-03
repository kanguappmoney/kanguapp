-- Kangu v1 — Link de captação — Fatia 2: formulário do pai + fila (staging).
-- O pai abre /captacao/<token>, cria conta (guardian) ATRÁS do token válido —
-- não é cadastro público solto —, aceita os Termos (LGPD) e envia os dados do
-- próprio filho. A submissão cai numa fila `pending`. NADA vira aluno aqui: a
-- criança só entra na operação após o motorista aprovar (Fatia 4 — portão G5).
--
-- Tabela de STAGING (não `students`): mantém `students` só com aluno real/aprovado,
-- simplifica a G5 e não deixa aluno-fantasma. Rejeitado não polui nada.

create type capture_submission_status as enum ('pending', 'approved', 'rejected');

create table capture_submissions (
  id                  uuid primary key default gen_random_uuid(),
  link_id             uuid not null references capture_links (id) on delete cascade,
  -- desnormalizados p/ a RLS e a fila do motorista (evita joins nas policies):
  driver_id           uuid not null references driver_profiles (user_id) on delete cascade,
  guardian_id         uuid not null references guardians (user_id) on delete cascade,
  -- dados preenchidos pelo pai (a escola/turno/horários vêm do link, não aqui):
  child_full_name     text not null,
  child_birth_date    date,
  pickup_address      text,               -- endereço de casa (G5)
  pickup_lat          double precision,   -- preenchido no geocoding (Fatia 3)
  pickup_lng          double precision,
  dropoff_same        boolean not null default true,
  dropoff_address     text,               -- só quando dropoff_same = false
  responsible_phone   text,
  responsible_whatsapp text,
  status              capture_submission_status not null default 'pending',
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);
create index capture_submissions_driver_idx   on capture_submissions (driver_id, status);
create index capture_submissions_guardian_idx on capture_submissions (guardian_id);

alter table capture_submissions enable row level security;

-- O pai vê só a(s) própria(s) submissão(ões) — nunca as de outra família (G5).
create policy capture_submissions_guardian_select on capture_submissions
  for select using (guardian_id = auth.uid());

-- O motorista vê as submissões dos SEUS links (a fila de aprovação, Fatia 4).
create policy capture_submissions_driver_select on capture_submissions
  for select using (driver_id = auth.uid());

-- Inserção é só via submit_capture (SECURITY DEFINER); status muda só via as
-- funções de aprovação/rejeição (Fatia 4). Sem policies de insert/update aqui.

-- ---------------------------------------------------------------------------
-- Prévia pública do link: quem tem o token vê o contexto do tio (escola, turno,
-- horários, nome do motorista) e o status do link. NUNCA lista crianças nem
-- outros links (G5). O token é o segredo, entregue pelo motorista.
-- ---------------------------------------------------------------------------
create or replace function get_capture_link_preview(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
begin
  select cl.status, cl.shift, cl.school, cl.school_address,
         cl.entry_time, cl.exit_time, u.full_name as driver_name
    into v
  from capture_links cl
  join users u on u.id = cl.driver_id
  where cl.token = p_token;

  if not found then
    return null;
  end if;

  return json_build_object(
    'status', v.status,
    'shift', v.shift,
    'school', v.school,
    'school_address', v.school_address,
    'entry_time', v.entry_time,
    'exit_time', v.exit_time,
    'driver_name', v.driver_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Envio do cadastro pelo pai: valida papel (guardian) e link ativo, e insere a
-- submissão na fila `pending`. lat/lng são opcionais (entram no geocoding, Fatia 3).
-- ---------------------------------------------------------------------------
create or replace function submit_capture(
  p_token                text,
  p_child_full_name      text,
  p_child_birth_date     date,
  p_pickup_address       text,
  p_dropoff_same         boolean,
  p_dropoff_address      text,
  p_responsible_phone    text,
  p_responsible_whatsapp text,
  p_pickup_lat           double precision default null,
  p_pickup_lng           double precision default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_link capture_links;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;
  if not exists (select 1 from guardians where user_id = v_uid) then
    raise exception 'Apenas responsáveis podem enviar um cadastro.';
  end if;
  if p_child_full_name is null or btrim(p_child_full_name) = '' then
    raise exception 'Informe o nome da criança.';
  end if;

  select * into v_link from capture_links where token = p_token;
  if not found then
    raise exception 'Link inválido.';
  end if;
  if v_link.status <> 'active' then
    raise exception 'Este link foi revogado. Peça um novo ao motorista.';
  end if;

  insert into capture_submissions (
    link_id, driver_id, guardian_id,
    child_full_name, child_birth_date,
    pickup_address, pickup_lat, pickup_lng,
    dropoff_same, dropoff_address,
    responsible_phone, responsible_whatsapp
  ) values (
    v_link.id, v_link.driver_id, v_uid,
    btrim(p_child_full_name), p_child_birth_date,
    p_pickup_address, p_pickup_lat, p_pickup_lng,
    coalesce(p_dropoff_same, true),
    case when coalesce(p_dropoff_same, true) then null else p_dropoff_address end,
    p_responsible_phone, p_responsible_whatsapp
  )
  returning id into v_id;

  return json_build_object('submission_id', v_id);
end;
$$;

grant execute on function get_capture_link_preview(text) to anon, authenticated;
grant execute on function submit_capture(
  text, text, date, text, boolean, text, text, text, double precision, double precision
) to authenticated;
