-- Kangu v1 — Storage da FOTO do aluno (passo dedicado).
-- Foto de criança = dado sensível (LGPD). Bucket PRIVADO + RLS por vínculo (G5),
-- reaproveitando as funções SECURITY DEFINER já existentes. Esta migration é só
-- a INFRA (bucket + RLS + coluna); a lógica de upload é código (server action +
-- componente), separada de propósito.
--
-- Regra (espelha G5): motorista dono do aluno = acesso total; responsável
-- VINCULADO = só leitura; ninguém mais lê — nem por URL direta (bucket privado).

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
