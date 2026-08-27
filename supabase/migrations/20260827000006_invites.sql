-- Kangu v1 — Convite de responsável (por aluno) + consentimento LGPD
-- Decisão: convite POR ALUNO (não código genérico). Motivo: G5 — um código
-- genérico exigiria o pai escolher numa lista, expondo nomes de outras crianças.
-- O convite por aluno já vincula à criança certa e nunca mostra outras.
--
-- O pai NUNCA lê student_invites direto (sem policy de select p/ guardian).
-- Toda a redenção passa por funções SECURITY DEFINER controladas.

create type invite_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table student_invites (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students (id) on delete cascade,
  driver_id    uuid not null references driver_profiles (user_id) on delete cascade,
  token        text not null unique,           -- segredo do link /convite/<token>
  status       invite_status not null default 'pending',
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references guardians (user_id) on delete set null,
  created_at   timestamptz not null default now()
);
create index student_invites_student_idx on student_invites (student_id);
create index student_invites_token_idx on student_invites (token);

alter table student_invites enable row level security;

-- Só o motorista dono do aluno gerencia os convites. Sem policy p/ guardian:
-- o pai chega pela função de redenção, não lendo a tabela.
create policy student_invites_owner on student_invites
  for all
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid() and is_driver_of_student(student_id));

-- Consentimento LGPD no perfil (aceite de Termos + Política). Importante p/ o piloto.
alter table users add column terms_accepted_at timestamptz;
alter table users add column terms_version    text;

-- ---------------------------------------------------------------------------
-- Prévia pública do convite: quem tem o token vê SÓ o nome da criança daquele
-- vínculo + o nome do motorista. Nunca lista outras crianças (G5). O token é o
-- segredo — foi entregue pelo motorista àquele pai especificamente.
-- ---------------------------------------------------------------------------
create or replace function get_invite_preview(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
begin
  select si.status,
         (si.expires_at < now()) as expired,
         s.full_name as student_name,
         u.full_name as driver_name
    into v
  from student_invites si
  join students s on s.id = si.student_id
  join users u    on u.id = si.driver_id
  where si.token = p_token;

  if not found then
    return null;
  end if;

  return json_build_object(
    'status', v.status,
    'expired', v.expired,
    'student_name', v.student_name,
    'driver_name', v.driver_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Redenção do convite: o responsável logado se vincula à criança do token.
-- Uso único (pending -> accepted). Valida papel, expiração e status.
-- ---------------------------------------------------------------------------
create or replace function accept_student_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_invite  student_invites;
  v_student students;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  if not exists (select 1 from guardians where user_id = v_uid) then
    raise exception 'Apenas responsáveis podem aceitar convites.';
  end if;

  select * into v_invite
  from student_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Convite inválido.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Convite já utilizado ou cancelado.';
  end if;

  if v_invite.expires_at < now() then
    update student_invites set status = 'expired' where id = v_invite.id;
    raise exception 'Convite expirado. Peça um novo ao motorista.';
  end if;

  insert into guardian_student (guardian_id, student_id)
  values (v_uid, v_invite.student_id)
  on conflict do nothing;

  update student_invites
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  select * into v_student from students where id = v_invite.student_id;

  return json_build_object(
    'student_id', v_student.id,
    'student_name', v_student.full_name
  );
end;
$$;

-- Quem pode chamar cada função:
grant execute on function get_invite_preview(text)   to anon, authenticated;
grant execute on function accept_student_invite(text) to authenticated;
