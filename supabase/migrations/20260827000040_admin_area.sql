-- Kangu — Marketplace, Frente F: área /admin (só leitura) + log de buscas da vitrine.
--
-- ALLOWLIST: tabela `admin_users` por UUID — não por e-mail. Motivo: o projeto está com a
-- confirmação de e-mail DESLIGADA, então "e-mail = house@domhub.co" sozinho deixaria qualquer
-- pessoa virar admin cadastrando esse e-mail antes do dono. O uuid é semeado à mão (SQL Editor)
-- a partir da conta real. A tabela é FECHADA: RLS sem policy + sem grant para anon/authenticated
-- — ninguém se promove por API. Sem UI de convite de admin (decisão desta frente).
--
-- LEITURA ADMIN: só por funções SECURITY DEFINER `admin_*` que começam com `admin_assert()`
-- (recusa com 42501 'Acesso negado.' quem não está na allowlist). A tela também confere, mas a
-- barreira de verdade é esta: mesmo contornando o app, o banco não entrega nada.
-- Cada função devolve colunas EXPLÍCITAS e mínimas; nenhuma devolve endereço, data de nascimento
-- ou telefone de criança/responsável nem CNH/documento (a fila de captação mostra só o nome da
-- criança, a escola/turno e o status).
--
-- LOG DE BUSCAS: `marketplace_search_log` guarda SÓ os filtros usados + a hora (sem IP, sem
-- usuário, sem cadastro de quem buscou). Insert-only: a única porta de escrita é
-- `log_marketplace_search()` (anon pode chamar); ninguém além da leitura admin lê, e ninguém
-- atualiza ou apaga por API.

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

create or replace function public.admin_assert()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
end;
$$;

-- Motoristas: perfil completo (portão da Frente A: prefixo+placa+modelo+cor), assinatura,
-- toggle do marketplace, se aparece MESMO na vitrine, alunos ativos e link de pedidos aberto.
create or replace function public.admin_list_drivers()
returns table (
  user_id               uuid,
  full_name             text,
  email                 text,
  phone                 text,
  created_at            timestamptz,
  profile_complete      boolean,
  missing_fields        text,
  subscription_status   text,
  marketplace_listed    boolean,
  visible_on_marketplace boolean,
  active_students       integer,
  open_requests         boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query
  select
    dp.user_id,
    u.full_name,
    au.email::text,
    u.phone,
    u.created_at,
    (nullif(btrim(v.prefix), '') is not null and nullif(btrim(v.plate), '') is not null
       and nullif(btrim(v.model), '') is not null and nullif(btrim(v.color), '') is not null),
    nullif(concat_ws(', ',
      case when nullif(btrim(v.prefix), '') is null then 'Prefixo' end,
      case when nullif(btrim(v.plate), '')  is null then 'Placa' end,
      case when nullif(btrim(v.model), '')  is null then 'Modelo' end,
      case when nullif(btrim(v.color), '')  is null then 'Cor' end), ''),
    dp.subscription_status::text,
    dp.marketplace_listed,
    exists (select 1 from public.marketplace_visible() mv where mv.user_id = dp.user_id),
    (select count(*)::integer from public.students s where s.driver_id = dp.user_id and s.status = 'active'),
    exists (select 1 from public.capture_links cl
             where cl.driver_id = dp.user_id and cl.kind = 'generic' and cl.status = 'active')
  from public.driver_profiles dp
  join public.users u on u.id = dp.user_id
  join auth.users au on au.id = dp.user_id
  left join lateral (
    select vv.prefix, vv.plate, vv.model, vv.color
      from public.vehicles vv
     where vv.driver_id = dp.user_id
     order by vv.created_at, vv.id
     limit 1
  ) v on true
  order by u.created_at desc, dp.user_id;
end;
$$;

-- Responsáveis cadastrados.
create or replace function public.admin_list_guardians()
returns table (
  user_id           uuid,
  full_name         text,
  email             text,
  phone             text,
  created_at        timestamptz,
  terms_accepted_at timestamptz,
  linked_students   integer,
  pending_requests  integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query
  select
    g.user_id,
    u.full_name,
    au.email::text,
    u.phone,
    u.created_at,
    u.terms_accepted_at,
    (select count(*)::integer from public.guardian_student gs where gs.guardian_id = g.user_id),
    (select count(*)::integer from public.capture_submissions cs
      where cs.guardian_id = g.user_id and cs.status = 'pending')
  from public.guardians g
  join public.users u on u.id = g.user_id
  join auth.users au on au.id = g.user_id
  order by u.created_at desc, g.user_id;
end;
$$;

-- Fila de captação de TODOS os motoristas. Só leitura (aprovar/recusar continua sendo do
-- motorista, nas funções approve_capture/reject_capture, que checam o dono). Sem endereço,
-- nascimento nem telefone: nome da criança, escola/turno e status bastam para acompanhar.
create or replace function public.admin_list_submissions(
  p_status capture_submission_status default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id            uuid,
  created_at    timestamptz,
  reviewed_at   timestamptz,
  status        text,
  link_kind     text,
  driver_name   text,
  guardian_name text,
  guardian_email text,
  child_name    text,
  school        text,
  shift         text,
  total_count   bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query
  select
    cs.id,
    cs.created_at,
    cs.reviewed_at,
    cs.status::text,
    cl.kind::text,
    du.full_name,
    gu.full_name,
    ga.email::text,
    cs.child_full_name,
    coalesce(cl.school, cs.child_school),
    coalesce(cl.shift, cs.child_shift)::text,
    count(*) over ()
  from public.capture_submissions cs
  join public.capture_links cl on cl.id = cs.link_id
  join public.users du on du.id = cs.driver_id
  join public.users gu on gu.id = cs.guardian_id
  join auth.users ga on ga.id = cs.guardian_id
  where p_status is null or cs.status = p_status
  order by cs.created_at desc, cs.id
  limit  least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Log de buscas: só filtros + hora.
create table if not exists public.marketplace_search_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  city         text check (char_length(city) <= 80),
  neighborhood text check (char_length(neighborhood) <= 80),
  school       text check (char_length(school) <= 80),
  child_age    smallint check (child_age between 0 and 30),
  shift        student_shift
);
create index if not exists marketplace_search_log_created_idx
  on public.marketplace_search_log (created_at desc);
alter table public.marketplace_search_log enable row level security;
revoke all on table public.marketplace_search_log from public, anon, authenticated;

create or replace function public.log_marketplace_search(
  p_city         text          default null,
  p_neighborhood text          default null,
  p_school       text          default null,
  p_child_age    integer       default null,
  p_shift        student_shift default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.marketplace_search_log (city, neighborhood, school, child_age, shift)
  values (
    left(nullif(btrim(p_city), ''), 80),
    left(nullif(btrim(p_neighborhood), ''), 80),
    left(nullif(btrim(p_school), ''), 80),
    case when p_child_age between 0 and 30 then p_child_age::smallint end,
    p_shift
  );
$$;

create or replace function public.admin_list_search_log(
  p_limit  integer default 100,
  p_offset integer default 0
)
returns table (
  created_at   timestamptz,
  city         text,
  neighborhood text,
  school       text,
  child_age    smallint,
  shift        text,
  total_count  bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query
  select l.created_at, l.city, l.neighborhood, l.school, l.child_age, l.shift::text, count(*) over ()
    from public.marketplace_search_log l
   order by l.created_at desc, l.id desc
   limit  least(greatest(coalesce(p_limit, 100), 1), 500)
   offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Privilégios: os defaults do Supabase concedem execute a anon/authenticated; fechamos tudo e
-- abrimos só o necessário. As admin_* ficam para `authenticated` (recusam quem não é admin);
-- anon nem chega nelas.
revoke all on function public.admin_assert()          from public, anon, authenticated;
revoke all on function public.admin_list_drivers()    from public, anon;
revoke all on function public.admin_list_guardians()  from public, anon;
revoke all on function public.admin_list_submissions(capture_submission_status, integer, integer) from public, anon;
revoke all on function public.admin_list_search_log(integer, integer) from public, anon;
grant execute on function public.admin_list_drivers()    to authenticated;
grant execute on function public.admin_list_guardians()  to authenticated;
grant execute on function public.admin_list_submissions(capture_submission_status, integer, integer) to authenticated;
grant execute on function public.admin_list_search_log(integer, integer) to authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

revoke all on function public.log_marketplace_search(text, text, text, integer, student_shift) from public;
grant execute on function public.log_marketplace_search(text, text, text, integer, student_shift) to anon, authenticated;

-- Semente da allowlist: SEMPRE à mão (SQL Editor), com o uuid da conta real, ex.:
--   insert into public.admin_users (user_id)
--   select id from auth.users where email = 'house@domhub.co' on conflict do nothing;
