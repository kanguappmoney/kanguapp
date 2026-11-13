-- Teste da migration 068 (F3: foto da van privada, visível só com o motorista listado).
-- Prova (no nível da RLS de storage.objects, que é o que o createSignedUrl consulta): (1) bucket privado; (2) foto de motorista
-- NÃO listado: anônimo e outro motorista não leem, o dono e o admin leem; (3) motorista listado (toggle + consentimento):
-- anônimo e outro motorista leem; (4) desligar o toggle corta a leitura na hora; (5) só a foto ATUAL (van_photo_path) é lida:
-- a antiga some; (6) nomes estranhos não quebram nem liberam; (7) ninguém além do dono grava/altera/apaga em storage.objects;
-- (8) admin_remove_van_photo zera o caminho, enfileira o arquivo, corta a leitura pública e só admin chama.
-- Não prova: a emissão da URL assinada pela API de Storage nem a expiração dela (precisa de uma foto real; ver README da E).
-- Roda no SQL Editor com 2 motoristas existentes; cria dados de teste e reverte no fim.
-- Resultado esperado: "RESULTADO: foto_van_privada PASSOU".
do $$
declare
  v_other uuid; v_admin uuid := gen_random_uuid(); v_d uuid := gen_random_uuid();
  v_name text; v_old text; n integer; v_ok boolean; r json; pub boolean;
begin
  select user_id into v_other from driver_profiles order by user_id limit 1;
  if v_other is null then raise exception 'FALHOU 0: precisa de 1 motorista existente'; end if;
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    ('00000000-0000-0000-0000-000000000000', v_d, 'authenticated', 'authenticated', 'van-d@teste.kangu', '{"role":"driver","full_name":"Van D"}'::jsonb, now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'van-adm@teste.kangu', '{"role":"driver","full_name":"Van Adm"}'::jsonb, now(), now());
  insert into public.admin_users (user_id) values (v_admin);
  v_name := v_d::text || '/van-1'; v_old := v_d::text || '/van-0';
  update driver_profiles set van_photo_path = v_name where user_id = v_d;
  insert into storage.objects (bucket_id, name) values ('van-photos', v_name), ('van-photos', v_old);

  -- (1) bucket privado
  select public into pub from storage.buckets where id = 'van-photos';
  if pub is distinct from false then raise exception 'FALHOU 1: o bucket van-photos deveria ser privado'; end if;

  -- (2) não listado: anônimo e outro motorista não leem; dono e admin leem
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2a: anônimo leu foto de motorista não listado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 0 then raise exception 'FALHOU 2b: outro motorista leu foto de motorista não listado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 1 then raise exception 'FALHOU 2c: o dono deveria ler a própria foto'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name in (v_name, v_old);
  reset role;
  if n <> 2 then raise exception 'FALHOU 2d: o admin deveria ler as fotos para revisar (veio %)', n; end if;

  -- (3) listado (toggle + consentimento): anônimo e outro motorista leem a foto ATUAL
  perform public._insert_consent('marketplace_listing', v_d, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture');
  update driver_profiles set marketplace_listed = true where user_id = v_d;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 1 then raise exception 'FALHOU 3a: anônimo deveria ler a foto de motorista listado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 1 then raise exception 'FALHOU 3b: outro motorista logado deveria ler a foto de motorista listado'; end if;

  -- (5) só a foto atual: a antiga (outro objeto da mesma pasta) não é lida pelo público
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_old;
  reset role;
  if n <> 0 then raise exception 'FALHOU 5: a foto antiga (não é van_photo_path) não pode ser pública'; end if;

  -- (6) nomes estranhos não quebram nem liberam
  if public.van_photo_visible('') or public.van_photo_visible('abc') or public.van_photo_visible('nao-uuid/x') or public.van_photo_visible(null) then
    raise exception 'FALHOU 6: nome inválido não pode ser visível';
  end if;

  -- (7) ninguém além do dono grava/altera/apaga
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_ok := false;
  begin insert into storage.objects (bucket_id, name) values ('van-photos', v_d::text || '/van-x'); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 7a: anônimo gravou em van-photos'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin insert into storage.objects (bucket_id, name) values ('van-photos', v_d::text || '/van-y'); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 7b: outro motorista gravou na pasta de D'; end if;

  -- (4) desligar o toggle corta a leitura na hora
  update driver_profiles set marketplace_listed = false where user_id = v_d;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 0 then raise exception 'FALHOU 4a: com o toggle desligado a foto não pode ser pública'; end if;
  -- ligar de novo e retirar o consentimento também corta (revogar desliga a vitrine)
  update driver_profiles set marketplace_listed = true where user_id = v_d;
  perform set_config('kangu.consent_internal', '1', true);
  update consents set revoked_at = now() where subject_user_id = v_d and kind = 'marketplace_listing';
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 0 then raise exception 'FALHOU 4b: sem o consentimento a foto não pode ser pública'; end if;

  -- (8) remoção pelo admin
  perform public._insert_consent('marketplace_listing', v_d, null, null, '{"version":"t2","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture');
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform admin_remove_van_photo(v_d); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 8a: só admin remove foto'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_remove_van_photo(v_d);
  reset role;
  if (r ->> 'removed')::boolean is not true then raise exception 'FALHOU 8b: deveria remover (veio %)', r; end if;
  select count(*) into n from driver_profiles where user_id = v_d and van_photo_path is null;
  if n <> 1 then raise exception 'FALHOU 8c: van_photo_path deveria ficar nulo'; end if;
  select count(*) into n from storage_purge_queue where bucket = 'van-photos' and path = v_name and reason = 'admin_removed';
  if n <> 1 then raise exception 'FALHOU 8d: o arquivo deveria entrar na fila de remoção'; end if;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'van-photos' and name = v_name;
  reset role;
  if n <> 0 then raise exception 'FALHOU 8e: depois de removida a foto não pode ser pública'; end if;

  raise exception 'RESULTADO: foto_van_privada PASSOU';
end $$;
