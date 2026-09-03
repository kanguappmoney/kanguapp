-- ===========================================================================
-- Captação — Fatia 2: submit_capture + RLS de capture_submissions.
-- Prova:
--   1) guardian envia num link ativo -> submissão pending, visível só p/ ele;
--   2) G5: outro responsável não vê a submissão;
--   3) o motorista dono do link vê a fila; outro motorista não;
--   4) link revogado -> submit recusado;
--   5) só responsável envia (motorista é barrado).
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente (ids sintéticos deste teste) -----------------------
delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002',
  '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0002'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002',
  '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a0002'
);

-- --- Fixture (o gatilho de signup cria users + driver_profiles/guardians) --------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driverA@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0002', 'authenticated', 'authenticated', 'driverB@teste.kangu', '{"role":"driver","full_name":"Motorista B"}'::jsonb,   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0001', 'authenticated', 'authenticated', 'pai1@teste.kangu',    '{"role":"guardian","full_name":"Responsável 1"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000a0002', 'authenticated', 'authenticated', 'pai2@teste.kangu',    '{"role":"guardian","full_name":"Responsável 2"}'::jsonb, now(), now());

-- Link de captação do motorista A (inserido como owner/postgres, RLS não se aplica).
insert into capture_links (id, driver_id, shift, school, token, status)
values ('00000000-0000-0000-0000-0000000c1001', '00000000-0000-0000-0000-0000000d0001', 'morning', 'Escola A', 'tok-cap-a', 'active');

-- ===========================================================================
-- CHECK 1 — Responsável 1 envia no link ativo -> vê a própria submissão pending.
-- ===========================================================================
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0001', 'role', 'authenticated')::text, true);
  perform submit_capture(
    p_token := 'tok-cap-a', p_child_full_name := 'Criança Um',
    p_child_birth_date := null, p_pickup_address := 'Rua de Casa, 1',
    p_dropoff_same := true, p_dropoff_address := null,
    p_responsible_phone := null, p_responsible_whatsapp := null);
  select count(*) into n from capture_submissions where status = 'pending';
  reset role;
  if n <> 1 then raise exception 'FALHOU: P1 não vê a própria submissão (n=%)', n; end if;
  raise notice 'OK (1/5): P1 envia e vê a própria submissão pending';
end $$;

-- ===========================================================================
-- CHECK 2 — G5: Responsável 2 não vê a submissão de P1.
-- ===========================================================================
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0002', 'role', 'authenticated')::text, true);
  select count(*) into n from capture_submissions;
  reset role;
  if n <> 0 then raise exception 'G5 FALHOU: P2 viu submissão de outra família (n=%)', n; end if;
  raise notice 'OK (2/5): P2 não vê a submissão de P1 (G5)';
end $$;

-- ===========================================================================
-- CHECK 3 — Fila: motorista A (dono do link) vê a submissão; motorista B não.
-- ===========================================================================
do $$
declare n_a int; n_b int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0001', 'role', 'authenticated')::text, true);
  select count(*) into n_a from capture_submissions;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0002', 'role', 'authenticated')::text, true);
  select count(*) into n_b from capture_submissions;
  reset role;

  if n_a <> 1 then raise exception 'FALHOU: motorista A não vê a fila do próprio link (n=%)', n_a; end if;
  if n_b <> 0 then raise exception 'FALHOU: motorista B viu submissão de link alheio (n=%)', n_b; end if;
  raise notice 'OK (3/5): A vê a fila do próprio link; B não vê';
end $$;

-- ===========================================================================
-- CHECK 4 — Link revogado -> submit recusado.
-- ===========================================================================
update capture_links set status = 'revoked' where token = 'tok-cap-a';
do $$
declare barrou boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000a0002', 'role', 'authenticated')::text, true);
  begin
    perform submit_capture(
      p_token := 'tok-cap-a', p_child_full_name := 'Criança Dois',
      p_child_birth_date := null, p_pickup_address := null,
      p_dropoff_same := true, p_dropoff_address := null,
      p_responsible_phone := null, p_responsible_whatsapp := null);
  exception when others then barrou := true;
  end;
  reset role;
  if not barrou then raise exception 'FALHOU: submit aceitou link revogado'; end if;
  raise notice 'OK (4/5): link revogado recusa o envio';
end $$;

-- ===========================================================================
-- CHECK 5 — Só responsável envia: o motorista é barrado.
-- ===========================================================================
update capture_links set status = 'active' where token = 'tok-cap-a';
do $$
declare barrou boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0001', 'role', 'authenticated')::text, true);
  begin
    perform submit_capture(
      p_token := 'tok-cap-a', p_child_full_name := 'Não deveria',
      p_child_birth_date := null, p_pickup_address := null,
      p_dropoff_same := true, p_dropoff_address := null,
      p_responsible_phone := null, p_responsible_whatsapp := null);
  exception when others then barrou := true;
  end;
  reset role;
  if not barrou then raise exception 'FALHOU: motorista conseguiu enviar cadastro'; end if;
  raise notice 'OK (5/5): motorista é barrado (só responsável envia)';
end $$;

do $$ begin raise notice '== CAPTAÇÃO FATIA 2: submit + RLS PASSOU (5/5) =='; end $$;

rollback;
