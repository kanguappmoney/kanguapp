-- ===========================================================================
-- Captação — Fatia 1: RLS de capture_links (owner-only).
-- Prova que um motorista só vê/gera seus próprios links de captação e não
-- consegue forjar um link em nome de outro (policy with check). É o análogo de
-- G5 no nível do motorista: link de um tio nunca vaza para outro.
--
-- Rodar como role privilegiado (postgres/service_role), no SQL Editor ou psql.
-- Transacional com ROLLBACK: não deixa resíduo. Cada checagem imprime "OK ...";
-- falha aborta com RAISE EXCEPTION.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente (só os ids sintéticos deste teste) -----------------
delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000d0002'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000d0002'
);

-- --- Fixture: 2 motoristas (o gatilho de signup cria users + driver_profiles) ---
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driverA@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0002', 'authenticated', 'authenticated', 'driverB@teste.kangu', '{"role":"driver","full_name":"Motorista B"}'::jsonb, now(), now());

-- ===========================================================================
-- CHECK 1 — motorista A cria um link (as authenticated) e vê SÓ o dele.
-- ===========================================================================
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0001', 'role', 'authenticated')::text, true);
  insert into capture_links (driver_id, shift, school, token)
    values ('00000000-0000-0000-0000-0000000d0001', 'morning', 'Escola A', 'tok-a-1');
  select count(*) into n from capture_links;   -- RLS restringe aos de A
  reset role;
  if n <> 1 then raise exception 'FALHOU: A não vê o próprio link (n=%)', n; end if;
  raise notice 'OK (1/3): motorista A cria e vê o próprio link';
end $$;

-- ===========================================================================
-- CHECK 2 — motorista B não enxerga nenhum link de A.
-- ===========================================================================
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0002', 'role', 'authenticated')::text, true);
  select count(*) into n from capture_links;
  reset role;
  if n <> 0 then raise exception 'FALHOU: B viu link de outro motorista (n=%)', n; end if;
  raise notice 'OK (2/3): motorista B não vê links de A';
end $$;

-- ===========================================================================
-- CHECK 3 — motorista B não consegue forjar um link com o driver_id de A.
-- ===========================================================================
do $$
declare barrou boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0002', 'role', 'authenticated')::text, true);
  begin
    insert into capture_links (driver_id, shift, school, token)
      values ('00000000-0000-0000-0000-0000000d0001', 'morning', 'Escola A', 'tok-forjado');
  exception when others then
    barrou := true;   -- policy with check recusou
  end;
  reset role;
  if not barrou then raise exception 'FALHOU: B forjou link em nome de A'; end if;
  raise notice 'OK (3/3): B não forja link em nome de A (with check)';
end $$;

do $$ begin raise notice '== CAPTAÇÃO FATIA 1: RLS owner-only PASSOU =='; end $$;

rollback;  -- não deixa resíduo
