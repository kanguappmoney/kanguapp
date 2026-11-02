-- Kangu — Marketplace, Frente E.1: "Solicitar vaga" por link de captação GENÉRICO e opt-in.
--
-- Reaproveita o mecanismo de captação inteiro (token, revogação, fila `pending`,
-- aprovação do motorista, consentimento LGPD) — sem tabela nova. O que muda:
--   * `capture_links.kind`: 'scoped' (o de sempre: um turno + uma escola, travados) ou
--     'generic' (sem turno/escola; o pai preenche). Um check garante a forma de cada tipo.
--   * No máximo UM link genérico ATIVO por motorista (índice parcial único). O "toggle" do
--     motorista é a existência desse link ativo: ligar cria um (token novo), desligar revoga.
--     Revogado nunca ressuscita — ligar de novo gera token novo (um token vazado não volta).
--   * `capture_submissions.child_school/child_shift`: o que o pai escolheu no link genérico
--     (nulo no link travado — ali o contexto vem do link e o pai NÃO o altera).
--   * `submit_capture` ganha `p_school`/`p_shift`: obrigatórios no genérico, IGNORADOS no travado.
--   * `approve_capture` usa o contexto do link e, se for genérico, o que o pai informou.
--   * `marketplace_listing` devolve `request_token` — o token do link genérico ATIVO, só no
--     modo perfil e só se existir. É a única forma de um token chegar a um anônimo, e é
--     opt-in explícito do motorista (toggle). Token de link travado NUNCA sai.
--   Não existe expiração em `capture_links` (só active/revoked); este tipo segue igual.

create type capture_link_kind as enum ('scoped', 'generic');

alter table capture_links
  add column if not exists kind capture_link_kind not null default 'scoped';

alter table capture_links alter column shift  drop not null;
alter table capture_links alter column school drop not null;

alter table capture_links drop constraint if exists capture_links_kind_shape;
alter table capture_links add constraint capture_links_kind_shape check (
  (kind = 'scoped'  and shift is not null and school is not null)
  or
  (kind = 'generic' and shift is null     and school is null)
);

create unique index if not exists capture_links_one_active_generic
  on capture_links (driver_id)
  where kind = 'generic' and status = 'active';

alter table capture_submissions
  add column if not exists child_school text,
  add column if not exists child_shift  student_shift;

-- Prévia pública: agora diz o tipo (o formulário decide travar ou liberar turno/escola).
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
  select cl.status, cl.kind, cl.shift, cl.school, cl.school_address,
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
    'kind', v.kind,
    'shift', v.shift,
    'school', v.school,
    'school_address', v.school_address,
    'entry_time', v.entry_time,
    'exit_time', v.exit_time,
    'driver_name', v.driver_name
  );
end;
$$;

-- Assinatura antiga sai (com as novas, a chamada com 10 argumentos ficaria ambígua).
drop function if exists submit_capture(
  text, text, date, text, boolean, text, text, text, double precision, double precision
);

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
  p_pickup_lng           double precision default null,
  p_school               text             default null,
  p_shift                student_shift    default null
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

  -- Link genérico: o pai informa turno e escola. Link travado: o contexto é do link e
  -- qualquer valor enviado aqui é descartado (o pai nunca troca a escola/turno do link).
  if v_link.kind = 'generic' then
    v_school := nullif(btrim(p_school), '');
    v_shift  := p_shift;
    if v_school is null then
      raise exception 'Informe a escola da criança.';
    end if;
    if v_shift is null then
      raise exception 'Informe o turno da criança.';
    end if;
  end if;

  insert into capture_submissions (
    link_id, driver_id, guardian_id,
    child_full_name, child_birth_date,
    pickup_address, pickup_lat, pickup_lng,
    dropoff_same, dropoff_address,
    responsible_phone, responsible_whatsapp,
    child_school, child_shift
  ) values (
    v_link.id, v_link.driver_id, v_uid,
    btrim(p_child_full_name), p_child_birth_date,
    p_pickup_address, p_pickup_lat, p_pickup_lng,
    coalesce(p_dropoff_same, true),
    case when coalesce(p_dropoff_same, true) then null else p_dropoff_address end,
    p_responsible_phone, p_responsible_whatsapp,
    v_school, v_shift
  )
  returning id into v_id;

  return json_build_object('submission_id', v_id);
end;
$$;

grant execute on function submit_capture(
  text, text, date, text, boolean, text, text, text,
  double precision, double precision, text, student_shift
) to authenticated;

-- Aprovação: igual à 022; escola/turno = o do link, ou (genérico) o informado pelo pai.
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

  select full_name into v_gname  from users      where id = v_sub.guardian_id;
  select email     into v_gemail from auth.users where id = v_sub.guardian_id;

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
    coalesce(v_link.school, v_sub.child_school), v_link.school_address,
    coalesce(v_link.shift, v_sub.child_shift),
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

-- Vitrine: agora devolve `request_token` (só no perfil, só do link GENÉRICO ATIVO).
drop function if exists public.marketplace_listing(
  text, text, text, integer, student_shift, integer, integer, uuid
);

create or replace function public.marketplace_listing(
  p_city          text          default null,
  p_neighborhood  text          default null,
  p_school        text          default null,
  p_child_age     integer       default null,
  p_shift         student_shift default null,
  p_limit         integer       default 12,
  p_offset        integer       default 0,
  p_public_id     uuid          default null
)
returns table (
  public_id             uuid,
  driver_name           text,
  van_photo_path        text,
  van_model             text,
  spots_available       integer,
  price_min_cents       integer,
  price_max_cents       integer,
  phone                 text,
  service_cities        text,
  service_neighborhoods text,
  service_schools       text,
  age_min               smallint,
  age_max               smallint,
  service_shifts        student_shift[],
  request_token         text,
  total_count           bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v.public_id,
    v.driver_name,
    v.van_photo_path,
    v.van_model,
    greatest(v.capacity - v.active_students, 0)::integer,
    v.price_min_cents,
    v.price_max_cents,
    -- Telefone e token só no modo perfil (um motorista por vez).
    case when p_public_id is not null then v.phone end,
    v.service_cities,
    v.service_neighborhoods,
    v.service_schools,
    v.age_min,
    v.age_max,
    v.service_shifts,
    case when p_public_id is not null then (
      select cl.token
        from public.capture_links cl
       where cl.driver_id = v.user_id and cl.kind = 'generic' and cl.status = 'active'
       limit 1
    ) end,
    count(*) over ()
  from public.marketplace_visible() v
  where (p_public_id is null or v.public_id = p_public_id)
    and (nullif(btrim(p_city), '') is null
         or public.marketplace_tokens(v.service_cities) @> array[lower(btrim(p_city))])
    and (nullif(btrim(p_neighborhood), '') is null
         or public.marketplace_tokens(v.service_neighborhoods) @> array[lower(btrim(p_neighborhood))])
    and (nullif(btrim(p_school), '') is null
         or public.marketplace_tokens(v.service_schools) @> array[lower(btrim(p_school))])
    and (p_child_age is null or p_child_age between v.age_min and v.age_max)
    and (p_shift is null or p_shift = any (v.service_shifts))
  order by v.driver_name, v.public_id
  limit  least(greatest(coalesce(p_limit, 12), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.marketplace_listing(text, text, text, integer, student_shift, integer, integer, uuid) from public;
grant execute on function public.marketplace_listing(text, text, text, integer, student_shift, integer, integer, uuid) to anon, authenticated;
