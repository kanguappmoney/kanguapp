-- ===========================================================================
-- Captação — Fatia 4: fila de aprovação (portão G5).
-- Prova, no mesmo rigor dos outros blocos:
--   1) sem aprovar -> NADA entra (0 alunos, 0 vínculos, submissões pending);
--   2) RLS cruzada -> motorista B não aprova submissão de A, e nada entra;
--   3) rejeitado  -> submissão vira rejected e NENHUM aluno é criado;
--   4) aprovado   -> aluno active criado (campos do link + submissão) e o pai
--                    é vinculado; a submissão fica approved com student_id.
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002',
  '00000000-0000-0000-0000-0000000a0001'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002',
  '00000000-0000-0000-0000-0000000a0001'
);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driverA@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0002', 'authenticated', 'authenticated', 'driverB@teste.kangu', '{"role":"driver","full_name":"Motorista B"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0001', 'authenticated', 'authenticated', 'pai1@teste.kangu',    '{"role":"guardian","full_name":"Responsável 1"}'::jsonb, now(), now());

insert into capture_links (id, driver_id, shift, school, school_address, entry_time, exit_time, token, status)
values ('00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000d0001',
        'morning', 'Escola A', 'Av Escola, 100', '07:00', '12:00', 'tok-cap-a', 'active');

-- Responsável 1 envia duas crianças (uma p/ aprovar, outra p/ rejeitar).
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0001', 'role', 'authenticated')::text, true);
  perform submit_capture(
    p_token := 'tok-cap-a', p_child_full_name := 'Criança Um',
    p_child_birth_date := date '2018-05-10', p_pickup_address := 'Rua de Casa, 1',
    p_dropoff_same := true, p_dropoff_address := null,
    p_responsible_phone := '11999990000', p_responsible_whatsapp := '11999990000',
    p_pickup_lat := -23.6672, p_pickup_lng := -46.4614);
  perform submit_capture(
    p_token := 'tok-cap-a', p_child_full_name := 'Criança Dois',
    p_child_birth_date := null, p_pickup_address := 'Rua de Casa, 2',
    p_dropoff_same := true, p_dropoff_address := null,
    p_responsible_phone := null, p_responsible_whatsapp := null);
  reset role;
end $$;

-- ===========================================================================
-- CHECK 1 — sem aprovar, nada entra na operação.
-- ===========================================================================
do $$
declare n_students int; n_link int; n_pending int;
begin
  select count(*) into n_students from students where driver_id = '00000000-0000-0000-0000-0000000d0001';
  select count(*) into n_link    from guardian_student where guardian_id = '00000000-0000-0000-0000-0000000a0001';
  select count(*) into n_pending from capture_submissions where status = 'pending';
  if n_students <> 0 then raise exception 'FALHOU: aluno existe sem aprovação (n=%)', n_students; end if;
  if n_link <> 0 then raise exception 'FALHOU: vínculo existe sem aprovação (n=%)', n_link; end if;
  if n_pending <> 2 then raise exception 'FALHOU: esperava 2 submissões pending (n=%)', n_pending; end if;
  raise notice 'OK (1/4): sem aprovar, nada entra (0 alunos, 0 vínculos, 2 pending)';
end $$;

-- ===========================================================================
-- CHECK 2 — RLS cruzada: motorista B não aprova submissão de A; nada entra.
-- ===========================================================================
do $$
declare v_sub uuid; barrou boolean := false; n int;
begin
  select id into v_sub from capture_submissions where child_full_name = 'Criança Um';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0002', 'role', 'authenticated')::text, true);
  begin
    perform approve_capture(v_sub);
  exception when others then barrou := true;
  end;
  reset role;
  if not barrou then raise exception 'FALHOU: B aprovou submissão de A'; end if;
  select count(*) into n from students where driver_id = '00000000-0000-0000-0000-0000000d0001';
  if n <> 0 then raise exception 'FALHOU: aprovação indevida criou aluno (n=%)', n; end if;
  raise notice 'OK (2/4): B não aprova submissão de A e nada entra';
end $$;

-- ===========================================================================
-- CHECK 3 — rejeitado -> submissão rejected, nenhum aluno criado.
-- ===========================================================================
do $$
declare v_sub uuid; st capture_submission_status; n int;
begin
  select id into v_sub from capture_submissions where child_full_name = 'Criança Dois';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0001', 'role', 'authenticated')::text, true);
  perform reject_capture(v_sub);
  reset role;
  select status into st from capture_submissions where id = v_sub;
  select count(*) into n from students where driver_id = '00000000-0000-0000-0000-0000000d0001';
  if st <> 'rejected' then raise exception 'FALHOU: submissão não ficou rejected (st=%)', st; end if;
  if n <> 0 then raise exception 'FALHOU: rejeição criou aluno (n=%)', n; end if;
  raise notice 'OK (3/4): rejeitado -> sem aluno';
end $$;

-- ===========================================================================
-- CHECK 4 — aprovado -> aluno active (link + submissão) e pai vinculado.
-- ===========================================================================
do $$
declare v_sub uuid; v_student uuid; r students;
begin
  select id into v_sub from capture_submissions where child_full_name = 'Criança Um';
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0001', 'role', 'authenticated')::text, true);
  select (approve_capture(v_sub)->>'student_id')::uuid into v_student;
  reset role;

  select * into r from students where id = v_student;
  if r.full_name <> 'Criança Um' then raise exception 'FALHOU: nome da criança errado (%)', r.full_name; end if;
  if r.school <> 'Escola A' then raise exception 'FALHOU: escola não veio do link (%)', r.school; end if;
  if r.shift::text <> 'morning' then raise exception 'FALHOU: turno não veio do link (%)', r.shift; end if;
  if r.entry_time <> time '07:00' then raise exception 'FALHOU: horário não veio do link (%)', r.entry_time; end if;
  if r.pickup_lat is distinct from -23.6672 then raise exception 'FALHOU: coordenada não veio da submissão (%)', r.pickup_lat; end if;
  if r.responsible_name <> 'Responsável 1' then raise exception 'FALHOU: nome do responsável (%)', r.responsible_name; end if;
  if r.status::text <> 'active' then raise exception 'FALHOU: aluno não ficou active (%)', r.status; end if;

  if not exists (
    select 1 from guardian_student
    where student_id = v_student and guardian_id = '00000000-0000-0000-0000-0000000a0001'
  ) then raise exception 'FALHOU: pai não foi vinculado ao aluno'; end if;

  if not exists (
    select 1 from capture_submissions
    where id = v_sub and status = 'approved' and student_id = v_student
  ) then raise exception 'FALHOU: submissão não ficou approved com student_id'; end if;

  raise notice 'OK (4/4): aprovado -> aluno active (link+submissão) e pai vinculado';
end $$;

do $$ begin raise notice '== CAPTAÇÃO FATIA 4: portão de aprovação PASSOU (4/4) =='; end $$;

rollback;
