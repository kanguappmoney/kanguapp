-- Kangu v1 — Link de captação (motorista) — Fatia 1.
-- Inverte o fluxo de cadastro: o motorista gera um link REUTILIZÁVEL por
-- (turno + escola) e compartilha (ex.: grupo de WhatsApp daquele turno). O pai
-- preenche o próprio filho depois; a criança só entra na operação após aprovação
-- do motorista (Fatia 4 — portão G5). Esta fatia é só o lado do motorista.
--
-- Diferente de student_invites (uso único, expira em 14 dias): o link de captação
-- DURA, serve pra vários pais, e é revogável/regenerável (se vazar ou no fim do
-- ano). O contexto do tio (escola, endereço, turno, horários-base) vive no link e
-- será travado no formulário do pai.

create type capture_link_status as enum ('active', 'revoked');

create table capture_links (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references driver_profiles (user_id) on delete cascade,
  shift          student_shift not null,
  school         text not null,
  school_address text,
  entry_time     time,                -- horário-base de entrada daquele turno
  exit_time      time,                -- horário-base de saída
  token          text not null unique,          -- segredo do link /captacao/<token>
  status         capture_link_status not null default 'active',
  created_at     timestamptz not null default now()
);
create index capture_links_driver_idx on capture_links (driver_id);
create index capture_links_token_idx  on capture_links (token);

alter table capture_links enable row level security;

-- Só o motorista dono gerencia e lê seus links. O pai NÃO lê esta tabela direto:
-- na Fatia 2 ele chega por uma função SECURITY DEFINER de prévia pública (que
-- nunca expõe outros links nem crianças — G5). Sem policy p/ guardian aqui.
create policy capture_links_owner on capture_links
  for all
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());
