-- Kangu v1 — LGPD, fatia C (2/2): o consentimento passa a mandar no acesso.
--
--  1. Cadastro direto pelo motorista deixa de existir NO BANCO: sem policy de insert em `students`, o aluno só nasce
--     em `approve_capture` (que exige a autorização do responsável). Convite-primeiro é regra, não só interface.
--  2. O motorista só enxerga aluno com consent_status = 'authorized'. Criança aguardando ou suspensa (um responsável
--     revogou) some para ele na hora; o responsável vinculado continua vendo (precisa para reautorizar).
--  3. Rota só aceita parada de aluno autorizado.
--  4. Foto: o motorista só envia foto se houver autorização de foto ativa; o responsável pode apagar o arquivo ao revogar.

drop policy if exists students_insert_owner on public.students;

drop policy if exists students_select_owner on public.students;
create policy students_select_owner on public.students
  for select using (driver_id = auth.uid() and consent_status = 'authorized');

drop policy if exists students_update_owner on public.students;
create policy students_update_owner on public.students
  for update using (driver_id = auth.uid() and consent_status = 'authorized')
  with check (driver_id = auth.uid() and consent_status = 'authorized');

create or replace function public.enforce_route_stop_consent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.students where id = new.student_id and consent_status = 'authorized') then
    raise exception 'Este aluno ainda não tem a autorização do responsável.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_route_stop_consent on public.route_stops;
create trigger trg_route_stop_consent before insert or update of student_id on public.route_stops
  for each row execute function public.enforce_route_stop_consent();

create or replace function public.student_photo_allowed(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.consents c
      join public.students s on s.id = c.student_id
     where c.student_id = p_student_id and c.kind = 'child_photo' and c.revoked_at is null
       and s.consent_status = 'authorized'
  );
$$;
revoke all on function public.student_photo_allowed(uuid) from public, anon;
grant execute on function public.student_photo_allowed(uuid) to authenticated;

drop policy if exists "student_photos_driver_all" on storage.objects;
create policy "student_photos_driver_write" on storage.objects
  for insert with check (
    bucket_id = 'student-photos'
    and public.is_driver_of_student((split_part(name, '/', 1))::uuid)
    and public.student_photo_allowed((split_part(name, '/', 1))::uuid)
  );
create policy "student_photos_driver_update" on storage.objects
  for update using (
    bucket_id = 'student-photos'
    and public.is_driver_of_student((split_part(name, '/', 1))::uuid)
    and public.student_photo_allowed((split_part(name, '/', 1))::uuid)
  ) with check (
    bucket_id = 'student-photos'
    and public.is_driver_of_student((split_part(name, '/', 1))::uuid)
    and public.student_photo_allowed((split_part(name, '/', 1))::uuid)
  );
create policy "student_photos_driver_read" on storage.objects
  for select using (
    bucket_id = 'student-photos'
    and public.is_driver_of_student((split_part(name, '/', 1))::uuid)
  );
create policy "student_photos_driver_delete" on storage.objects
  for delete using (
    bucket_id = 'student-photos'
    and public.is_driver_of_student((split_part(name, '/', 1))::uuid)
  );
create policy "student_photos_guardian_delete" on storage.objects
  for delete using (
    bucket_id = 'student-photos'
    and public.is_guardian_of_student((split_part(name, '/', 1))::uuid)
  );
