-- Kangu v1 — Fatia F3: foto da van deixa de ser pública.
--
-- Antes: bucket `van-photos` PÚBLICO (migration 036): qualquer pessoa com a URL lia o arquivo, listado ou não, e desligar o
-- toggle "Aparecer no marketplace" não cortava o acesso (só tirava o caminho das buscas).
-- Agora:
--   • bucket privado;
--   • leitura por RLS de storage.objects só do (a) motorista dono (política já existente), (b) qualquer pessoa, inclusive
--     anônima, SOMENTE enquanto o motorista dono está listado na vitrine (toggle ligado + consentimento da vitrine ativo)
--     e o objeto é a foto ATUAL dele (`van_photo_path`), (c) admin (revisão/remoção);
--   • a vitrine passa a receber URL assinada de curta duração (<= 1 h), gerada no SERVIDOR com a sessão de quem visita
--     (createSignedUrl sob RLS); NENHUMA chave de serviço entra na Vercel;
--   • desligar o toggle (ou retirar o aceite) corta a criação de novas URLs na hora. Limite do mecanismo: uma URL assinada
--     já emitida vale até expirar (no máximo 1 h);
--   • admin ganha `admin_remove_van_photo`: zera `van_photo_path` e enfileira o arquivo em `storage_purge_queue`
--     (o armazenamento não aceita DELETE direto por SQL; a remoção do arquivo é pela API, como as fotos de crianças).
-- Fotos existentes: nenhuma (0 objetos e 0 motoristas com foto na data desta migration), então nada a migrar.

update storage.buckets set public = false where id = 'van-photos';

create or replace function public.van_photo_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_name ~ '^[0-9a-fA-F-]{36}/' then exists (
      select 1
        from public.driver_profiles dp
       where dp.user_id = (split_part(p_name, '/', 1))::uuid
         and dp.marketplace_listed is true
         and dp.van_photo_path = p_name
         and exists (select 1 from public.consents c
                      where c.subject_user_id = dp.user_id and c.kind = 'marketplace_listing' and c.revoked_at is null))
    else false
  end
$$;
revoke all on function public.van_photo_visible(text) from public;
grant execute on function public.van_photo_visible(text) to anon, authenticated;

drop policy if exists "van_photos_listed_read" on storage.objects;
create policy "van_photos_listed_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'van-photos' and public.van_photo_visible(name));

drop policy if exists "van_photos_admin_read" on storage.objects;
create policy "van_photos_admin_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'van-photos' and public.is_admin());

create or replace function public.admin_remove_van_photo(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  perform public.admin_assert();
  select van_photo_path into v_path from public.driver_profiles where user_id = p_user_id;
  if v_path is null or btrim(v_path) = '' then
    return json_build_object('ok', true, 'removed', false);
  end if;
  insert into public.storage_purge_queue (bucket, path, reason) values ('van-photos', v_path, 'admin_removed');
  update public.driver_profiles set van_photo_path = null where user_id = p_user_id;
  return json_build_object('ok', true, 'removed', true);
end;
$$;
revoke all on function public.admin_remove_van_photo(uuid) from public, anon;
grant execute on function public.admin_remove_van_photo(uuid) to authenticated;
