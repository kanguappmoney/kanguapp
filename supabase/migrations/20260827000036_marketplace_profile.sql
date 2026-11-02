-- Kangu — Marketplace, Frente C: perfil público do motorista (só o DADO; a busca
-- pública e a leitura anônima são a frente seguinte).
--
-- Texto livre, sem normalizar (mesma decisão da R11 para escola): cidades, bairros
-- e escolas atendidas são o que o motorista digitou. A faixa de preço é PÚBLICA e
-- independente de students.monthly_fee_cents (o valor real cobrado por aluno).
-- Nada aqui é lido por anônimo: driver_profiles segue com RLS self/vinculado, então
-- o endereço residencial NUNCA vira público por este passo (seção 10 do progresso).
-- Tudo nullable/default: motoristas antigos seguem válidos; o toggle nasce desligado.
alter table driver_profiles
  add column if not exists service_cities         text,
  add column if not exists service_neighborhoods  text,
  add column if not exists service_schools        text,
  add column if not exists age_min                smallint,
  add column if not exists age_max                smallint,
  add column if not exists service_shifts         student_shift[] not null default '{}',
  add column if not exists price_min_cents        integer,
  add column if not exists price_max_cents        integer,
  add column if not exists marketplace_listed     boolean not null default false,
  add column if not exists van_photo_path         text;

alter table driver_profiles
  drop constraint if exists driver_profiles_marketplace_ranges;
alter table driver_profiles
  add constraint driver_profiles_marketplace_ranges check (
    (age_min is null or (age_min between 0 and 30))
    and (age_max is null or (age_max between 0 and 30))
    and (age_min is null or age_max is null or age_min <= age_max)
    and (price_min_cents is null or price_min_cents > 0)
    and (price_max_cents is null or price_max_cents > 0)
    and (price_min_cents is null or price_max_cents is null
         or price_min_cents <= price_max_cents)
  );

-- Foto da VAN: bucket PÚBLICO (distinto do privado 'driver-photos', que guarda a
-- foto da pessoa). Público = a URL é lida sem login (vitrine); escrever é dono-only.
-- Sem policy de SELECT para anon: o objeto sai pela URL pública, mas ninguém lista o
-- bucket. Só imagem, até 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'van-photos', 'van-photos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "van_photos_owner_all" on storage.objects;
create policy "van_photos_owner_all"
  on storage.objects for all
  using (
    bucket_id = 'van-photos'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'van-photos'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );
