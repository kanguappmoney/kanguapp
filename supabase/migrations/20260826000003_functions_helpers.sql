-- Kangu v1 — Funções auxiliares e gatilho de signup
-- As funções de vínculo são SECURITY DEFINER para não recair em RLS quando
-- chamadas de dentro de uma policy (evita recursão infinita). search_path fixo.

-- ---------------------------------------------------------------------------
-- Papel do usuário logado.
-- ---------------------------------------------------------------------------
create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- O usuário logado é o motorista dono deste aluno?
-- ---------------------------------------------------------------------------
create or replace function is_driver_of_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.driver_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- O usuário logado é responsável VINCULADO a este aluno? (define G4/G5)
-- ---------------------------------------------------------------------------
create or replace function is_guardian_of_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guardian_student gs
    where gs.student_id = p_student_id
      and gs.guardian_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- O usuário logado é o motorista dono desta rota?
-- ---------------------------------------------------------------------------
create or replace function is_driver_of_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.routes r
    where r.id = p_route_id
      and r.driver_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- O usuário logado é o motorista dono desta execução?
-- ---------------------------------------------------------------------------
create or replace function is_driver_of_execution(p_execution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_executions e
    join public.routes r on r.id = e.route_id
    where e.id = p_execution_id
      and r.driver_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- O responsável logado tem filho nesta execução? (algum route_stop da rota)
-- ---------------------------------------------------------------------------
create or replace function is_guardian_of_execution(p_execution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_executions e
    join public.route_stops rs on rs.route_id = e.route_id
    join public.guardian_student gs on gs.student_id = rs.student_id
    where e.id = p_execution_id
      and gs.guardian_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- NÚCLEO de G4 + G6: o responsável logado PODE ver a posição ao vivo desta
-- execução?  Precisa de TODAS as condições:
--   (a) é responsável vinculado a um aluno da rota;
--   (b) a execução está in_progress (G4 — só na janela do trajeto);
--   (c) o motorista dessa rota está em parent_tracking_mode = 'map' (G6).
-- Se o modo é 'timeline', retorna false SEMPRE — o banco nunca entrega GPS.
-- ---------------------------------------------------------------------------
create or replace function guardian_can_see_live_position(p_execution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_executions e
    join public.routes r         on r.id = e.route_id
    join public.driver_profiles d on d.user_id = r.driver_id
    join public.route_stops rs   on rs.route_id = r.id
    join public.guardian_student gs on gs.student_id = rs.student_id
    where e.id = p_execution_id
      and gs.guardian_id = auth.uid()
      and e.status = 'in_progress'          -- G4
      and d.parent_tracking_mode = 'map'    -- G6
  );
$$;

-- ---------------------------------------------------------------------------
-- Gatilho de signup: cria o perfil em public.users + a linha do papel.
-- O papel vem do metadata do signup: raw_user_meta_data->>'role'.
-- Motorista = cliente pagante; responsável = convidado.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_name text;
begin
  v_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'guardian');
  v_name := coalesce(new.raw_user_meta_data->>'full_name', new.email);

  insert into public.users (id, role, full_name)
  values (new.id, v_role, v_name);

  if v_role = 'driver' then
    insert into public.driver_profiles (user_id) values (new.id);
  else
    insert into public.guardians (user_id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
