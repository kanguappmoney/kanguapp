-- ===========================================================================
-- `capture_link_cities(token)` (migration 049): as cidades do dono de um link de captação ATIVO, para o seletor
-- de escola do formulário do pai (sem login). Prova: link ativo devolve as cidades de service_cities casadas com
-- `cities` (sem diferença de maiúsculas); link revogado, token desconhecido e motorista sem cidades → vazio;
-- anon executa. Rodar como role privilegiado (SQL Editor). APLICAR 044–049 antes.
-- Termina em exceção 'RESULTADO: ... PASSOU'.
-- ===========================================================================
begin;

delete from public.users where id = '00000000-0000-0000-0000-0000000e0095';
delete from auth.users   where id = '00000000-0000-0000-0000-0000000e0095';
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0095', 'authenticated', 'authenticated', 'cidade-mot@teste.kangu', '{"role":"driver","full_name":"Cidade Motorista"}'::jsonb, now(), now());

update public.driver_profiles set service_cities = 'mauá,  SANTO ANDRÉ, Cidade Inexistente' where user_id = '00000000-0000-0000-0000-0000000e0095';
insert into public.capture_links (driver_id, kind, shift, school, token, status)
  values ('00000000-0000-0000-0000-0000000e0095', 'generic', null, null, 'tok-cidades-teste-0095', 'active');

do $$
declare ids integer[]; n int;
begin
  set local role anon;
  perform set_config('request.jwt.claims', '', true);
  select array_agg(city_id order by city_id) into ids from public.capture_link_cities('tok-cidades-teste-0095');
  select count(*) into n from public.capture_link_cities('token-que-nao-existe');
  reset role;
  if ids is distinct from array[3529401, 3547809] then raise exception 'FALHOU (1): esperava {3529401,3547809}, veio %', ids; end if;
  if n <> 0 then raise exception 'FALHOU (1): token desconhecido deveria devolver vazio'; end if;
  raise notice 'OK (1/3): link ativo devolve só as cidades que casam (sem diferença de caixa/acento de caixa), anon executa';
end $$;

do $$
declare n int;
begin
  update public.capture_links set status = 'revoked' where token = 'tok-cidades-teste-0095';
  set local role anon;
  select count(*) into n from public.capture_link_cities('tok-cidades-teste-0095');
  reset role;
  if n <> 0 then raise exception 'FALHOU (2): link revogado deveria devolver vazio'; end if;
  raise notice 'OK (2/3): link revogado → vazio';
end $$;

do $$
declare n int;
begin
  update public.capture_links set status = 'active' where token = 'tok-cidades-teste-0095';
  update public.driver_profiles set service_cities = null where user_id = '00000000-0000-0000-0000-0000000e0095';
  set local role anon;
  select count(*) into n from public.capture_link_cities('tok-cidades-teste-0095');
  reset role;
  if n <> 0 then raise exception 'FALHOU (3): motorista sem cidades deveria devolver vazio'; end if;
  raise notice 'OK (3/3): motorista sem cidades → vazio (o seletor cai na busca geral, nunca bloqueia)';
end $$;

do $$ begin raise exception 'RESULTADO: CAPTURE LINK CITIES PASSOU (3/3)'; end $$;
rollback;
