-- ===========================================================================
-- `my_marketplace_status()` (migration 052): o status de vitrine do PRÓPRIO motorista usa a mesma regra do banco.
-- Prova: (1) anon e responsável recusados; (2) perfil completo + toggle ligado → visible=true, missing=[];
-- (3) para cada requisito que falta (toggle, foto, veículo, cidades, idades, turnos, preço, telefone, assinatura
-- pausada): visible=false e o código certo em missing; restaurar → visible=true e missing=[] — e `visible` sempre
-- igual ao que a vitrine pública mostra (consulta anon por public_id). Rodar como role privilegiado (SQL Editor).
-- APLICAR a migration 052 antes. Termina em exceção 'RESULTADO: ... PASSOU'.
-- ===========================================================================
begin;

delete from public.users where id in ('00000000-0000-0000-0000-0000000e00c1', '00000000-0000-0000-0000-0000000a00c1');
delete from auth.users   where id in ('00000000-0000-0000-0000-0000000e00c1', '00000000-0000-0000-0000-0000000a00c1');
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e00c1', 'authenticated', 'authenticated', 'status-mot@teste.kangu', '{"role":"driver","full_name":"Status Motorista"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a00c1', 'authenticated', 'authenticated', 'status-pai@teste.kangu', '{"role":"guardian","full_name":"Status Pai"}'::jsonb, now(), now());
-- Fixture (migration 059): o motorista de teste concede o consentimento da vitrine/pedidos que a trava exige. Nenhuma asserção foi alterada.
select public._insert_consent(k, u.id, null, null, '{"version":"t1","sha256":"fixture","snapshot":"fixture","method":"remote","checks":[]}'::jsonb, 'fixture')
  from auth.users u cross join unnest(array['marketplace_listing','marketplace_requests']) k
 where u.raw_user_meta_data ->> 'role' = 'driver' and u.email ~ '(teste\.kangu|\.teste)$'
   and not exists (select 1 from public.consents c where c.subject_user_id = u.id and c.kind = k and c.revoked_at is null);

update public.users set phone = '11999990111' where id = '00000000-0000-0000-0000-0000000e00c1';
update public.driver_profiles set service_cities = 'Mauá', age_min = 4, age_max = 15, service_shifts = '{morning}',
  price_min_cents = 25000, price_max_cents = 40000, van_photo_path = '00000000-0000-0000-0000-0000000e00c1/van-1',
  marketplace_listed = true
where user_id = '00000000-0000-0000-0000-0000000e00c1';
insert into public.vehicles (driver_id, label, plate, capacity, model, year, color, prefix)
values ('00000000-0000-0000-0000-0000000e00c1', 'Van S', 'ST1A234', 10, 'Van S', 2022, 'Branca', 'PFX-S');

create function pg_temp.status() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e00c1', 'role', 'authenticated')::text, true);
  select public.my_marketplace_status() into r;
  reset role;
  return r;
end $$;

create function pg_temp.public_visible() returns boolean
language plpgsql as $$
declare pid uuid; n int;
begin
  select public_id into pid from public.driver_profiles where user_id = '00000000-0000-0000-0000-0000000e00c1';
  set local role anon;
  select count(*) into n from public.marketplace_listing(p_public_id => pid);
  reset role;
  return n > 0;
end $$;

do $$
declare r1 text; r2 text;
begin
  begin
    set local role anon; perform public.my_marketplace_status(); reset role; r1 := 'ok';
  exception when others then reset role; r1 := sqlstate; end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000a00c1', 'role', 'authenticated')::text, true);
    perform public.my_marketplace_status(); reset role; r2 := 'ok';
  exception when others then reset role; r2 := sqlstate || ':' || sqlerrm; end;
  if r1 <> '42501' then raise exception 'FALHOU (1): anon deveria ser negado: %', r1; end if;
  if r2 not like '42501:Apenas motoristas%' then raise exception 'FALHOU (1): responsável deveria ser recusado: %', r2; end if;
  raise notice 'OK (1/3)';
end $$;

do $$
declare s jsonb;
begin
  s := pg_temp.status();
  if (s->>'visible')::boolean is not true or s->'missing' <> '[]'::jsonb or (s->>'listed')::boolean is not true then
    raise exception 'FALHOU (2): perfil completo deveria estar visível e sem pendências: %', s;
  end if;
  if pg_temp.public_visible() is not true then raise exception 'FALHOU (2): a vitrine pública não mostra o motorista completo'; end if;
  raise notice 'OK (2/3)';
end $$;

create temp table cases (code text, break_sql text, fix_sql text);
insert into cases values
  ('toggle',     $q$update public.driver_profiles set marketplace_listed = false where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.driver_profiles set marketplace_listed = true where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('foto',       $q$update public.driver_profiles set van_photo_path = null where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.driver_profiles set van_photo_path = '00000000-0000-0000-0000-0000000e00c1/van-1' where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('veiculo',    $q$update public.vehicles set color = ' ' where driver_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.vehicles set color = 'Branca' where driver_id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('cidades',    $q$update public.driver_profiles set service_cities = null where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.driver_profiles set service_cities = 'Mauá' where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('idades',     $q$update public.driver_profiles set age_max = null where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.driver_profiles set age_max = 15 where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('turnos',     $q$update public.driver_profiles set service_shifts = '{}' where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.driver_profiles set service_shifts = '{morning}' where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('preco',      $q$update public.driver_profiles set price_min_cents = null where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.driver_profiles set price_min_cents = 25000 where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('telefone',   $q$update public.users set phone = null where id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.users set phone = '11999990111' where id = '00000000-0000-0000-0000-0000000e00c1'$q$),
  ('assinatura', $q$update public.driver_profiles set subscription_status = 'paused' where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$,
                 $q$update public.driver_profiles set subscription_status = 'active' where user_id = '00000000-0000-0000-0000-0000000e00c1'$q$);

do $$
declare c record; s jsonb; n int := 0;
begin
  for c in select * from cases loop
    execute c.break_sql;
    s := pg_temp.status();
    if (s->>'visible')::boolean is not false or not (s->'missing' ? c.code) then
      raise exception 'FALHOU (3): sem "%" deveria estar invisível com missing contendo o código: %', c.code, s;
    end if;
    if (s->>'visible')::boolean is distinct from pg_temp.public_visible() then
      raise exception 'FALHOU (3): status diverge da vitrine pública em "%": %', c.code, s;
    end if;
    execute c.fix_sql;
    s := pg_temp.status();
    if (s->>'visible')::boolean is not true or s->'missing' <> '[]'::jsonb then
      raise exception 'FALHOU (3): restaurar "%" não limpou o status: %', c.code, s;
    end if;
    n := n + 1;
  end loop;
  raise notice 'OK (3/3): % requisitos: invisível + código certo + igual à vitrine pública; restaurar limpa', n;
end $$;

do $$ begin raise exception 'RESULTADO: MY MARKETPLACE STATUS PASSOU (3/3)'; end $$;
rollback;
