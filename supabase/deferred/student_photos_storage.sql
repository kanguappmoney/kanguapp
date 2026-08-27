-- DEFERIDO — NÃO está em migrations/ de propósito (o db push não aplica isto).
-- Este é o passo dedicado da FOTO do aluno. Quando for a hora:
--   1) mover para supabase/migrations/ com timestamp novo;
--   2) db push;
--   3) rodar o teste isolado: pai vinculado LÊ a foto; pai NÃO vinculado é
--      RECUSADO; motorista dono tem acesso total (igual validamos G4/G5).
--
-- Foto de criança = dado sensível (LGPD). Bucket PRIVADO + RLS por vínculo (G5),
-- reaproveitando as funções SECURITY DEFINER já existentes.

-- Ponteiro da foto no aluno (caminho no bucket, não URL pública).
alter table students add column photo_path text;

-- Bucket privado para fotos de aluno.
-- Caminho dos objetos: '<student_id>/<arquivo>' — o student_id no path é o que
-- as políticas usam para checar vínculo.
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', false)
on conflict (id) do nothing;

-- Motorista dono do aluno: acesso total à foto (upload/ler/trocar/apagar).
create policy "student_photos_driver_all"
  on storage.objects for all
  using (
    bucket_id = 'student-photos'
    and is_driver_of_student((split_part(name, '/', 1))::uuid)
  )
  with check (
    bucket_id = 'student-photos'
    and is_driver_of_student((split_part(name, '/', 1))::uuid)
  );

-- Responsável VINCULADO: só leitura da foto do próprio filho (G5).
create policy "student_photos_guardian_read"
  on storage.objects for select
  using (
    bucket_id = 'student-photos'
    and is_guardian_of_student((split_part(name, '/', 1))::uuid)
  );
