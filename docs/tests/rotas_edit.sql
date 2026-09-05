-- ===========================================================================
-- Rotas 2.0 — EDITAR rota 'both'. Prova as guardas da edição NO BANCO:
--   1) DONO edita rota PARADA: renomeia + reescreve as duas listas (delete +
--      reinsert), sob RLS, como o próprio motorista — passa;
--   2) RLS: motorista B NÃO edita a rota de A (update não pega linha; delete não
--      apaga nada; insert é recusado pela RLS) — a rota de A fica intacta;
--   3) G2 no banco: com uma perna in_progress HOJE, o trigger recusa mexer nas
--      paradas (delete E insert falham com check_violation) — nada é removido no
--      meio de uma execução em andamento;
--   4) numeração por perna segue 1..N após a reinserção (unique route_id,kind,
--      position intacto; cada lista contígua a partir de 1).
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente (só ids sintéticos deste fixture) ------------------
delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001',  -- Motorista A (dono)
  '00000000-0000-0000-0000-0000000d0002'   -- Motorista B (intruso)
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000d0002'
);

-- --- Fixture: 2 motoristas, 3 alunos (manhã) -----------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driverA@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0002', 'authenticated', 'authenticated', 'driverB@teste.kangu', '{"role":"driver","full_name":"Motorista B"}'::jsonb, now(), now());

insert into students (id, driver_id, full_name, shift, status) values
  ('00000000-0000-0000-0000-0000005c0001', '00000000-0000-0000-0000-0000000d0001', 'Aluno Um',   'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0002', '00000000-0000-0000-0000-0000000d0001', 'Aluno Dois', 'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0003', '00000000-0000-0000-0000-0000000d0001', 'Aluno Três', 'morning', 'active');

-- Rota 'both' do Motorista A. Ida: Um(1),Dois(2). Volta: Dois(1),Três(2).
insert into routes (id, driver_id, name, direction, shift) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000000d0001', 'Turma Manhã', 'both', 'morning');
insert into route_stops (route_id, student_id, position, kind) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 2, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 1, 'dropoff'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0003', 2, 'dropoff');

-- Helper: entra na pele de um usuário autenticado (RLS enxerga auth.uid()).
create or replace function _become(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ===========================================================================
-- CHECK 1 — DONO edita rota PARADA (sem execução hoje). É o que updateRoute faz
-- no banco: renomeia + apaga as paradas + reinsere as duas listas renumeradas.
-- Novas listas: ida = [Três(1), Um(2)]; volta = [Um(1)].
-- ===========================================================================
do $$
declare n int;
begin
  perform _become('00000000-0000-0000-0000-0000000d0001');  -- Motorista A (dono)

  update routes set name = 'Turma Manhã (editada)', shift = 'morning'
    where id = '00000000-0000-0000-0000-0000007a0001';

  delete from route_stops where route_id = '00000000-0000-0000-0000-0000007a0001';

  insert into route_stops (route_id, student_id, position, kind) values
    ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0003', 1, 'pickup'),
    ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 2, 'pickup'),
    ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'dropoff');

  reset role;
  perform set_config('request.jwt.claims', null, true);

  -- Confere que a edição pegou.
  select count(*) into n from route_stops
    where route_id = '00000000-0000-0000-0000-0000007a0001';
  if n <> 3 then raise exception 'FALHOU (1): esperava 3 paradas após edição, veio %', n; end if;

  if (select name from routes where id = '00000000-0000-0000-0000-0000007a0001')
     <> 'Turma Manhã (editada)' then
    raise exception 'FALHOU (1): nome não foi atualizado';
  end if;
  raise notice 'OK (1/4): dono edita rota parada (renomeia + reescreve as duas listas)';
end $$;

-- ===========================================================================
-- CHECK 2 — RLS: Motorista B não edita a rota de A.
-- ===========================================================================
do $$
declare n_before int; n_after int; nome_before text; nome_after text; barrou boolean := false;
begin
  select count(*), max(name) into n_before, nome_before
    from route_stops rs join routes r on r.id = rs.route_id
    where rs.route_id = '00000000-0000-0000-0000-0000007a0001';
  select name into nome_before from routes where id = '00000000-0000-0000-0000-0000007a0001';

  perform _become('00000000-0000-0000-0000-0000000d0002');  -- Motorista B (intruso)

  -- (a) UPDATE não pega linha (using driver_id = B → 0 linhas, sem erro).
  update routes set name = 'INVADIDA' where id = '00000000-0000-0000-0000-0000007a0001';
  -- (b) DELETE não apaga nada (using is_driver_of_route → falso p/ B).
  delete from route_stops where route_id = '00000000-0000-0000-0000-0000007a0001';
  -- (c) INSERT é recusado pela RLS (with check is_driver_of_route → falso).
  begin
    insert into route_stops (route_id, student_id, position, kind)
    values ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 9, 'pickup');
  exception when others then barrou := true;
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);

  if not barrou then raise exception 'FALHOU (2): RLS deixou B inserir parada na rota de A'; end if;

  select count(*) into n_after from route_stops
    where route_id = '00000000-0000-0000-0000-0000007a0001';
  select name into nome_after from routes where id = '00000000-0000-0000-0000-0000007a0001';

  if n_after <> 3 then raise exception 'FALHOU (2): B alterou as paradas de A (antes 3, agora %)', n_after; end if;
  if nome_after = 'INVADIDA' then raise exception 'FALHOU (2): B renomeou a rota de A'; end if;
  raise notice 'OK (2/4): RLS — B não edita a rota de A (update/delete/insert sem efeito)';
end $$;

-- ===========================================================================
-- CHECK 3 — G2 no banco: perna in_progress HOJE congela as paradas.
-- ===========================================================================
insert into route_executions (route_id, service_date, leg, status, started_at) values
  ('00000000-0000-0000-0000-0000007a0001', current_date, 'pickup', 'in_progress', now());

do $$
declare del_barrou boolean := false; ins_barrou boolean := false; n int;
begin
  perform _become('00000000-0000-0000-0000-0000000d0001');  -- dono (RLS não é o ponto aqui)

  -- DELETE de parada com perna rodando → trigger recusa.
  begin
    delete from route_stops
      where route_id = '00000000-0000-0000-0000-0000007a0001' and kind = 'dropoff';
  exception when check_violation then del_barrou := true;
  end;

  -- INSERT de parada com perna rodando → trigger recusa.
  begin
    insert into route_stops (route_id, student_id, position, kind)
    values ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 3, 'pickup');
  exception when check_violation then ins_barrou := true;
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);

  if not del_barrou then raise exception 'FALHOU (3): trigger deixou APAGAR parada com perna in_progress'; end if;
  if not ins_barrou then raise exception 'FALHOU (3): trigger deixou INSERIR parada com perna in_progress'; end if;

  -- Nada foi removido no meio da execução (continua 3).
  select count(*) into n from route_stops
    where route_id = '00000000-0000-0000-0000-0000007a0001';
  if n <> 3 then raise exception 'FALHOU (3): paradas mudaram durante execução (agora %)', n; end if;
  raise notice 'OK (3/4): G2 — perna in_progress hoje congela as paradas (delete e insert recusados)';
end $$;

-- ===========================================================================
-- CHECK 4 — numeração por perna 1..N após a reinserção do CHECK 1.
-- ===========================================================================
do $$
declare pk int[]; dp int[];
begin
  select array_agg(position order by position) into pk from route_stops
    where route_id = '00000000-0000-0000-0000-0000007a0001' and kind = 'pickup';
  select array_agg(position order by position) into dp from route_stops
    where route_id = '00000000-0000-0000-0000-0000007a0001' and kind = 'dropoff';

  -- Ida reescrita com 2 paradas → posições exatamente {1,2}. Volta com 1 → {1}.
  if pk is distinct from array[1,2] then raise exception 'FALHOU (4): ida não é 1..N contígua (%)', pk; end if;
  if dp is distinct from array[1]   then raise exception 'FALHOU (4): volta não é 1..N contígua (%)', dp; end if;
  raise notice 'OK (4/4): numeração por perna segue 1..N após reinserção (ida=%, volta=%)', pk, dp;
end $$;

drop function if exists _become(uuid);

do $$ begin raise notice '== ROTAS 2.0 (editar rota) PASSOU (4/4) =='; end $$;

rollback;
