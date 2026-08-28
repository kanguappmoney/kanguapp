-- Kangu v1 — Storage da FOTO do motorista. Bucket PRIVADO, dono-only.
-- Path dos objetos: '<driver_user_id>/avatar' — o id no path é o próprio dono.
-- Coerente com a foto do aluno (um só mecanismo de storage privado + RLS).
-- Só o próprio motorista lê/escreve sua foto. (Se no futuro os pais vinculados
-- precisarem ver, adiciona-se uma policy de leitura por vínculo — como no aluno.)

insert into storage.buckets (id, name, public)
values ('driver-photos', 'driver-photos', false)
on conflict (id) do nothing;

-- Dono: acesso total à própria foto (path começa com o próprio user id).
create policy "driver_photos_owner_all"
  on storage.objects for all
  using (
    bucket_id = 'driver-photos'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'driver-photos'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );
