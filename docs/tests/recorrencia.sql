-- ===========================================================================
-- Rotas 2.0 — RECORRÊNCIA (R1: fundação + guarda). Prova o modelo leve NO BANCO:
--   1) regra do dia da semana: route_runs_on segue routes.weekdays (Seg sim,
--      Sáb não, para uma rota Seg–Sex);
--   2) exceção 'skip' (feriado): força NÃO rodar num dia que rodaria;
--   3) exceção 'extra' (reposição): força RODAR num dia que não rodaria;
--   4) backfill: rota criada sem weekdays nasce Seg–Sex (default);
--   5) RLS: motorista B não lê nem grava exceção na rota de A (dono-only);
--   6) GUARDA (herda do 100m): recorrência MOSTRA, nunca BLOQUEIA — iniciar uma
--      execução num dia fora da agenda é sempre aceito (nenhum trigger/constraint
--      recusa por causa da recorrência).
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- APLICAR a migration 029 ANTES de rodar.
-- ===========================================================================

begin;

-- --- Pré-limpeza idempotente ---------------------------------------------------
delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000d0002'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001',
  '00000000-0000-0000-0000-0000000d0002'
);

-- --- Fixture: 2 motoristas -----------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driverA@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0002', 'authenticated', 'authenticated', 'driverB@teste.kangu', '{"role":"driver","full_name":"Motorista B"}'::jsonb, now(), now());

-- Rota A1: dias explícitos Seg–Sex. Rota A2: SEM weekdays (prova o backfill/default).
insert into routes (id, driver_id, name, direction, shift, weekdays) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000000d0001', 'Turma Manhã', 'both', 'morning', '{1,2,3,4,5}');
insert into routes (id, driver_id, name, direction, shift) values
  ('00000000-0000-0000-0000-0000007a0002', '00000000-0000-0000-0000-0000000d0001', 'Turma Backfill', 'both', 'morning');

-- Datas robustas: segunda desta semana (isodow 1) e derivados.
-- date_trunc('week') retorna a segunda-feira (semana ISO começa na segunda).
create or replace function _monday() returns date
language sql stable as $$ select date_trunc('week', current_date)::date $$;

-- Helper: entra na pele de um usuário autenticado (RLS enxerga auth.uid()).
create or replace function _become(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ===========================================================================
-- CHECK 1 — regra do dia da semana (Seg sim, Sáb não).
-- ===========================================================================
do $$
declare seg date := _monday(); sab date := _monday() + 5;
begin
  if not route_runs_on('00000000-0000-0000-0000-0000007a0001', seg) then
    raise exception 'FALHOU (1): rota Seg–Sex não rodou na segunda';
  end if;
  if route_runs_on('00000000-0000-0000-0000-0000007a0001', sab) then
    raise exception 'FALHOU (1): rota Seg–Sex rodou no sábado';
  end if;
  raise notice 'OK (1/6): regra do dia da semana (segunda sim, sábado não)';
end $$;

-- ===========================================================================
-- CHECK 2 — exceção 'skip' (feriado) força NÃO rodar numa segunda.
-- ===========================================================================
insert into route_exceptions (route_id, date, kind, reason) values
  ('00000000-0000-0000-0000-0000007a0001', _monday(), 'skip', 'Feriado');
do $$
begin
  if route_runs_on('00000000-0000-0000-0000-0000007a0001', _monday()) then
    raise exception 'FALHOU (2): skip não impediu a rota de rodar na segunda';
  end if;
  raise notice 'OK (2/6): skip (feriado) força não rodar num dia que rodaria';
end $$;

-- ===========================================================================
-- CHECK 3 — exceção 'extra' (reposição) força RODAR num sábado.
-- ===========================================================================
insert into route_exceptions (route_id, date, kind, reason) values
  ('00000000-0000-0000-0000-0000007a0001', _monday() + 5, 'extra', 'Reposição');
do $$
begin
  if not route_runs_on('00000000-0000-0000-0000-0000007a0001', _monday() + 5) then
    raise exception 'FALHOU (3): extra não fez a rota rodar no sábado';
  end if;
  raise notice 'OK (3/6): extra (reposição) força rodar num dia que não rodaria';
end $$;

-- ===========================================================================
-- CHECK 4 — backfill: rota sem weekdays nasce Seg–Sex.
-- ===========================================================================
do $$
declare wd smallint[]; seg date := _monday(); sab date := _monday() + 5;
begin
  select weekdays into wd from routes where id = '00000000-0000-0000-0000-0000007a0002';
  if wd is distinct from array[1,2,3,4,5]::smallint[] then
    raise exception 'FALHOU (4): backfill não deu Seg–Sex (veio %)', wd;
  end if;
  if not route_runs_on('00000000-0000-0000-0000-0000007a0002', seg)
     or route_runs_on('00000000-0000-0000-0000-0000007a0002', sab) then
    raise exception 'FALHOU (4): rota backfill não roda dias úteis corretamente';
  end if;
  raise notice 'OK (4/6): backfill — rota sem weekdays nasce Seg–Sex';
end $$;

-- ===========================================================================
-- CHECK 5 — RLS: B não lê nem grava exceção na rota de A.
-- ===========================================================================
do $$
declare n int; barrou boolean := false;
begin
  perform _become('00000000-0000-0000-0000-0000000d0002');  -- Motorista B

  -- (a) SELECT não enxerga as exceções de A (dono-only).
  select count(*) into n from route_exceptions
    where route_id = '00000000-0000-0000-0000-0000007a0001';
  -- (b) INSERT numa rota de A é recusado pela RLS (with check).
  begin
    insert into route_exceptions (route_id, date, kind)
    values ('00000000-0000-0000-0000-0000007a0001', _monday() + 1, 'skip');
  exception when others then barrou := true;
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);

  if n <> 0 then raise exception 'FALHOU (5): B enxergou exceções da rota de A (n=%)', n; end if;
  if not barrou then raise exception 'FALHOU (5): RLS deixou B gravar exceção na rota de A'; end if;
  raise notice 'OK (5/6): RLS — B não lê nem grava exceção da rota de A';
end $$;

-- ===========================================================================
-- CHECK 6 — GUARDA: recorrência mostra, nunca bloqueia. Execução num dia fora
-- da agenda (domingo, sem 'extra') é aceita — nada recusa por recorrência.
-- ===========================================================================
do $$
declare dom date := _monday() + 6; aceitou boolean := true;
begin
  -- Domingo não está em Seg–Sex e não tem 'extra' → route_runs_on = false…
  if route_runs_on('00000000-0000-0000-0000-0000007a0001', dom) then
    raise exception 'FALHOU (6): domingo não deveria ser dia agendado';
  end if;
  -- …mas iniciar a execução nesse dia TEM que ser possível (G1/G2: nunca bloqueia).
  begin
    insert into route_executions (route_id, service_date, leg, status, started_at)
    values ('00000000-0000-0000-0000-0000007a0001', dom, 'pickup', 'in_progress', now());
  exception when others then aceitou := false;
  end;
  if not aceitou then
    raise exception 'FALHOU (6): banco recusou execução em dia fora da agenda (violaria a guarda)';
  end if;
  raise notice 'OK (6/6): recorrência mostra, nunca bloqueia — execução em dia off é aceita';
end $$;

drop function if exists _become(uuid);
drop function if exists _monday();

do $$ begin raise notice '== RECORRÊNCIA (R1) PASSOU (6/6) =='; end $$;

rollback;
