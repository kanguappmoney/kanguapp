-- ===========================================================================
-- Rotas 2.0 — criação encorpada: modelo de rota 'both' com duas listas.
-- Prova:
--   1) uma rota 'both' guarda ida (pickup) e volta (dropoff) com posições
--      INDEPENDENTES (pos 1 coexiste nas duas pernas — o constraint antigo
--      unique(route_id,position) rejeitaria isto);
--   2) aluno em ambas as listas aparece nas duas (em posições distintas);
--   3) só-ida fica só na ida; só-volta, só na volta;
--   4) dentro de uma perna a posição continua única (não duplica);
--   5) RLS owner-only: outro motorista não vê a rota nem as paradas.
--
-- Rodar como role privilegiado (SQL Editor / psql). Transacional c/ ROLLBACK.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002'
);
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002'
);

-- Motoristas A e B (gatilho cria users + driver_profiles).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0001', 'authenticated', 'authenticated', 'driverA@teste.kangu', '{"role":"driver","full_name":"Motorista A"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000d0002', 'authenticated', 'authenticated', 'driverB@teste.kangu', '{"role":"driver","full_name":"Motorista B"}'::jsonb, now(), now());

-- Alunos do motorista A (inseridos como owner; RLS não se aplica ao setup).
insert into students (id, driver_id, full_name, shift, status) values
  ('00000000-0000-0000-0000-0000005c0001', '00000000-0000-0000-0000-0000000d0001', 'Aluno Um',   'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0002', '00000000-0000-0000-0000-0000000d0001', 'Aluno Dois', 'morning', 'active'),
  ('00000000-0000-0000-0000-0000005c0003', '00000000-0000-0000-0000-0000000d0001', 'Aluno Três', 'morning', 'active');

-- Rota encorpada 'both' do motorista A.
insert into routes (id, driver_id, name, direction, shift) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000000d0001', 'Turma Manhã', 'both', 'morning');

-- Ida: Um(1), Dois(2). Volta: Dois(1), Três(2).
-- => Um = só-ida; Três = só-volta; Dois = ambas (posições diferentes).
insert into route_stops (route_id, student_id, position, kind) values
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0001', 1, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 2, 'pickup'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0002', 1, 'dropoff'),
  ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0003', 2, 'dropoff');

-- ===========================================================================
-- CHECK 1/2/3 — estrutura das duas listas.
-- ===========================================================================
do $$
declare
  v_pickup uuid[];
  v_dropoff uuid[];
begin
  select array_agg(student_id order by position) into v_pickup
    from route_stops where route_id = '00000000-0000-0000-0000-0000007a0001' and kind = 'pickup';
  select array_agg(student_id order by position) into v_dropoff
    from route_stops where route_id = '00000000-0000-0000-0000-0000007a0001' and kind = 'dropoff';

  if v_pickup <> array['00000000-0000-0000-0000-0000005c0001','00000000-0000-0000-0000-0000005c0002']::uuid[] then
    raise exception 'FALHOU: ida na ordem errada (%)', v_pickup;
  end if;
  if v_dropoff <> array['00000000-0000-0000-0000-0000005c0002','00000000-0000-0000-0000-0000005c0003']::uuid[] then
    raise exception 'FALHOU: volta na ordem errada (%)', v_dropoff;
  end if;
  raise notice 'OK (1/5): ida e volta com posições independentes (pos 1 nas duas pernas)';

  -- Aluno Dois aparece nas duas listas.
  if (select count(*) from route_stops
        where route_id = '00000000-0000-0000-0000-0000007a0001'
          and student_id = '00000000-0000-0000-0000-0000005c0002') <> 2 then
    raise exception 'FALHOU: aluno em ambas não aparece nas duas listas';
  end if;
  raise notice 'OK (2/5): aluno em ambas aparece na ida e na volta';

  -- Um = só-ida; Três = só-volta.
  if exists (select 1 from route_stops where route_id='00000000-0000-0000-0000-0000007a0001'
               and student_id='00000000-0000-0000-0000-0000005c0001' and kind='dropoff') then
    raise exception 'FALHOU: só-ida apareceu na volta';
  end if;
  if exists (select 1 from route_stops where route_id='00000000-0000-0000-0000-0000007a0001'
               and student_id='00000000-0000-0000-0000-0000005c0003' and kind='pickup') then
    raise exception 'FALHOU: só-volta apareceu na ida';
  end if;
  raise notice 'OK (3/5): só-ida fica só na ida; só-volta fica só na volta';
end $$;

-- ===========================================================================
-- CHECK 4 — dentro de uma perna, posição continua única (não duplica).
-- ===========================================================================
do $$
declare barrou boolean := false;
begin
  begin
    insert into route_stops (route_id, student_id, position, kind)
    values ('00000000-0000-0000-0000-0000007a0001', '00000000-0000-0000-0000-0000005c0003', 1, 'pickup');
  exception when unique_violation then barrou := true;
  end;
  if not barrou then raise exception 'FALHOU: aceitou duas paradas na mesma posição da ida'; end if;
  raise notice 'OK (4/5): posição única por perna (ida pos 1 não duplica)';
end $$;

-- ===========================================================================
-- CHECK 5 — RLS owner-only: motorista B não vê a rota nem as paradas de A.
-- ===========================================================================
do $$
declare n_routes int; n_stops int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000d0002', 'role', 'authenticated')::text, true);
  select count(*) into n_routes from routes       where id = '00000000-0000-0000-0000-0000007a0001';
  select count(*) into n_stops  from route_stops  where route_id = '00000000-0000-0000-0000-0000007a0001';
  reset role;
  if n_routes <> 0 then raise exception 'RLS FALHOU: B viu rota de A (n=%)', n_routes; end if;
  if n_stops <> 0 then raise exception 'RLS FALHOU: B viu paradas de A (n=%)', n_stops; end if;
  raise notice 'OK (5/5): RLS owner-only — B não vê rota nem paradas de A';
end $$;

do $$ begin raise notice '== ROTAS 2.0 (criação encorpada): modelo two-legs PASSOU (5/5) =='; end $$;

rollback;
