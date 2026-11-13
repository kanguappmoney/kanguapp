-- ===========================================================================
-- Admin, Moderação (parte 3) — migration 043.
--   (1) anon e não-admin recusados em `admin_list_van_photos` e `admin_search_ips`;
--   (2) fotos: só quem TEM foto (nula e vazia ficam de fora), colunas exatas, data do upload
--       no storage;
--   (3) IP no log de IP (migration 056): gravado só como ENDEREÇO de host válido ('unknown', lixo e CIDR
--       não viram IP);
--   (4) ranking de IPs (admin_search_ips): por volume, período 7 × 30 dias, Top limitado, totais do período;
--   (5) só o admin lê o IP: `marketplace_search_ip_log` e `marketplace_search_log` fechados a anon e a
--       motorista; a coluna `ip` NÃO existe no log de buscas; o log de IP só tem IP + hora; a leitura
--       admin (admin_list_search_log) não devolve IP.
--   (a retenção de 30 dias do IP é provada em lgpd_retencao.sql, testes 9 e 10)
-- Rodar como role privilegiado (SQL Editor). Termina em exceção 'RESULTADO: ... PASSOU'.
-- APLICAR as migrations 037–043 e 056 ANTES de rodar.
-- ===========================================================================

begin;

delete from public.users where id in (
  '00000000-0000-0000-0000-0000000e0061', '00000000-0000-0000-0000-0000000e0062',
  '00000000-0000-0000-0000-0000000e0063', '00000000-0000-0000-0000-0000000e0064');
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000e0061', '00000000-0000-0000-0000-0000000e0062',
  '00000000-0000-0000-0000-0000000e0063', '00000000-0000-0000-0000-0000000e0064');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0061', 'authenticated', 'authenticated', 'adm-mo@teste.kangu', '{"role":"driver","full_name":"Mo Admin"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0062', 'authenticated', 'authenticated', 'mo-foto@teste.kangu', '{"role":"driver","full_name":"Mo Com Foto"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0063', 'authenticated', 'authenticated', 'mo-vazia@teste.kangu', '{"role":"driver","full_name":"Mo Foto Vazia"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000e0064', 'authenticated', 'authenticated', 'mo-sem@teste.kangu', '{"role":"driver","full_name":"Mo Sem Foto"}'::jsonb, now(), now());
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000e0061');

update public.driver_profiles set van_photo_path = '00000000-0000-0000-0000-0000000e0062/van-777' where user_id = '00000000-0000-0000-0000-0000000e0062';
update public.driver_profiles set van_photo_path = '   ' where user_id = '00000000-0000-0000-0000-0000000e0063';
-- objeto no storage com data própria (2 dias atrás) — a lista deve usar ESSA data.
insert into storage.objects (bucket_id, name, created_at)
values ('van-photos', '00000000-0000-0000-0000-0000000e0062/van-777', now() - interval '2 days');

create function pg_temp.try_as(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  begin execute p_sql; r := 'ok';
  exception when others then r := sqlstate || ':' || sqlerrm; end;
  reset role;
  return r;
end $$;

create function pg_temp.rows_admin(p_sql text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000e0061', 'role', 'authenticated')::text, true);
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s) t', p_sql) into r;
  reset role;
  return r;
end $$;

-- ---------------------------------------------------------------------------
do $$
declare s text; r text; n int := 0;
begin
  foreach s in array array['select * from public.admin_list_van_photos()', 'select * from public.admin_search_ips(7)'] loop
    r := pg_temp.try_as('anon', null, s);
    if r not like '42501:%' then raise exception 'FALHOU (1): anon não negado em [%]: %', s, r; end if;
    r := pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0062', s);
    if r <> '42501:Acesso negado.' then raise exception 'FALHOU (1): não-admin sem "Acesso negado." em [%]: %', s, r; end if;
    n := n + 2;
  end loop;
  raise notice 'OK (1/6): anon e não-admin negados (% chamadas)', n;
end $$;

-- ---------------------------------------------------------------------------
do $$
declare t jsonb := pg_temp.rows_admin('select * from public.admin_list_van_photos()'); a jsonb; txt text;
begin
  if (select count(*) from jsonb_array_elements(t) x where x->>'full_name' in ('Mo Foto Vazia', 'Mo Sem Foto', 'Mo Admin')) <> 0 then
    raise exception 'FALHOU (2): motorista sem foto (nula/vazia) apareceu na lista de fotos';
  end if;
  select x into a from jsonb_array_elements(t) x where x->>'full_name' = 'Mo Com Foto';
  if a is null then raise exception 'FALHOU (2): motorista com foto ausente'; end if;
  if a->>'van_photo_path' <> '00000000-0000-0000-0000-0000000e0062/van-777' then raise exception 'FALHOU (2): caminho errado: %', a; end if;
  if (a->>'photo_at')::timestamptz > now() - interval '47 hours' or (a->>'photo_at')::timestamptz < now() - interval '49 hours' then
    raise exception 'FALHOU (2): photo_at deveria ser a do upload no storage (~48h atrás), veio %', a->>'photo_at';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(a) k) is distinct from
     array['email','full_name','marketplace_listed','photo_at','user_id','van_photo_path','visible_on_marketplace'] then
    raise exception 'FALHOU (2): colunas de admin_list_van_photos mudaram';
  end if;
  txt := t::text;
  if position('Rua ' in txt) > 0 or position('document' in txt) > 0 then raise exception 'FALHOU (2): dado inesperado na lista de fotos'; end if;
  raise notice 'OK (2/6): fotos — só quem tem foto, colunas exatas, data do upload';
end $$;


-- ---------------------------------------------------------------------------
-- (3) Buscas com IP (como anon), incluindo entradas inválidas. O IP vai SÓ para marketplace_search_ip_log.
do $$
declare i int; r text; n0 int; n1 int; bad int;
begin
  for i in 1..4 loop
    r := pg_temp.try_as('anon', null, 'select public.log_marketplace_search(''Mauá'', null, null, null, null, ''203.0.113.7'')');
    if r <> 'ok' then raise exception 'FALHOU (3): anon não registrou com IP: %', r; end if;
  end loop;
  for i in 1..2 loop
    r := pg_temp.try_as('anon', null, 'select public.log_marketplace_search(''Diadema'', null, null, null, null, ''2001:db8::1'')');
    if r <> 'ok' then raise exception 'FALHOU (3): anon não registrou com IPv6: %', r; end if;
  end loop;
  select count(*) into n0 from public.marketplace_search_ip_log;
  perform pg_temp.try_as('anon', null, 'select public.log_marketplace_search(''Lixo'', null, null, null, null, ''unknown'')');
  perform pg_temp.try_as('anon', null, 'select public.log_marketplace_search(''Cidr'', null, null, null, null, ''10.0.0.0/8'')');
  perform pg_temp.try_as('anon', null, 'select public.log_marketplace_search(''Vazio'', null, null, null, null, ''   '')');
  select count(*) into n1 from public.marketplace_search_ip_log;
  if n1 <> n0 then raise exception 'FALHOU (3): IP inválido/CIDR/vazio não podia virar linha no log de IP (% -> %)', n0, n1; end if;
  if (select count(*) from public.marketplace_search_log where city in ('Lixo', 'Cidr', 'Vazio')) <> 3 then
    raise exception 'FALHOU (3): a busca (filtros) deveria ser registrada mesmo sem IP válido';
  end if;
  if (select count(*) from public.marketplace_search_ip_log where ip = '203.0.113.7') < 4 then
    raise exception 'FALHOU (3): IPv4 não foi gravado como host';
  end if;
  if (select count(*) from public.marketplace_search_ip_log where ip = '2001:db8::1') < 2 then
    raise exception 'FALHOU (3): IPv6 não foi gravado';
  end if;
  select count(*) into bad from public.marketplace_search_ip_log
   where masklen(ip) <> (case when family(ip) = 4 then 32 else 128 end);
  if bad <> 0 then raise exception 'FALHOU (3): há IP que não é endereço de host (% linhas)', bad; end if;
  raise notice 'OK (3/5): IP gravado só como endereço de host (IPv4/IPv6); lixo, CIDR e vazio não viram IP';
end $$;

-- ---------------------------------------------------------------------------
-- (4) Ranking. Antigos (privilegiado): 5 buscas do IP 203.0.113.99 há 10 dias (entra em 30, não em 7).
insert into public.marketplace_search_ip_log (ip, created_at)
select '203.0.113.99'::inet, now() - interval '10 days' from generate_series(1, 5);

do $$
declare w7 jsonb := pg_temp.rows_admin('select * from public.admin_search_ips(7)');
        w30 jsonb := pg_temp.rows_admin('select * from public.admin_search_ips(30)');
        a jsonb; txt text;
begin
  select x into a from jsonb_array_elements(w7) x where x->>'ip' = '203.0.113.7';
  if a is null or (a->>'searches')::int < 4 then raise exception 'FALHOU (4): 203.0.113.7 deveria ter >= 4 buscas em 7 dias: %', a; end if;
  if (select (x->>'searches')::int from jsonb_array_elements(w7) x where x->>'ip' = '2001:db8::1') < 2 then
    raise exception 'FALHOU (4): IPv6 deveria ter >= 2 buscas';
  end if;
  if exists (select 1 from jsonb_array_elements(w7) with ordinality as p(x, i) join jsonb_array_elements(w7) with ordinality as q(y, j) on j = i + 1
              where (p.x->>'searches')::int < (q.y->>'searches')::int) then
    raise exception 'FALHOU (4): ranking de IPs fora de ordem por volume';
  end if;
  if exists (select 1 from jsonb_array_elements(w7) x where x->>'ip' = '203.0.113.99') then raise exception 'FALHOU (4): IP de 10 dias atrás apareceu no período de 7'; end if;
  if (select (x->>'searches')::int from jsonb_array_elements(w30) x where x->>'ip' = '203.0.113.99') <> 5 then
    raise exception 'FALHOU (4): IP de 10 dias deveria ter 5 buscas no período de 30';
  end if;
  if jsonb_array_length(w7) > 20 or jsonb_array_length(w30) > 20 then raise exception 'FALHOU (4): ranking passou de 20 linhas'; end if;
  if (a->>'total_with_ip')::int > (a->>'total_in_period')::int then raise exception 'FALHOU (4): total_with_ip > total_in_period'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(a) k) is distinct from
     array['first_at','ip','last_at','searches','total_in_period','total_with_ip'] then
    raise exception 'FALHOU (4): colunas de admin_search_ips mudaram';
  end if;
  txt := w30::text;
  if position('Mauá' in txt) > 0 or position('Antiga' in txt) > 0 then raise exception 'FALHOU (4): filtros vazaram na lista de IPs'; end if;
  raise notice 'OK (4/5): ranking de IPs por volume, período 7 × 30, Top 20, totais, colunas exatas';
end $$;

-- ---------------------------------------------------------------------------
-- (5) Só o admin lê o IP.
do $$
declare s text; r text; n int := 0; l jsonb; cols text[]; t text;
begin
  foreach t in array array['public.marketplace_search_ip_log', 'public.marketplace_search_log'] loop
    foreach s in array array['select * from ' || t, 'delete from ' || t, 'update ' || t || ' set created_at = now()'] loop
      foreach r in array array[pg_temp.try_as('anon', null, s), pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0062', s)] loop
        if r not like '42501:%' then raise exception 'FALHOU (5): acesso direto não negado em [%]: %', s, r; end if;
        n := n + 1;
      end loop;
    end loop;
  end loop;
  foreach r in array array[
      pg_temp.try_as('anon', null, 'insert into public.marketplace_search_ip_log (ip) values (''1.1.1.1'')'),
      pg_temp.try_as('authenticated', '00000000-0000-0000-0000-0000000e0062', 'insert into public.marketplace_search_ip_log (ip) values (''1.1.1.1'')')] loop
    if r not like '42501:%' then raise exception 'FALHOU (5): insert direto no log de IP não negado: %', r; end if;
    n := n + 1;
  end loop;
  l := pg_temp.rows_admin('select * from public.admin_list_search_log(5)');
  if jsonb_array_length(l) = 0 or (l -> 0) ? 'ip' then raise exception 'FALHOU (5): admin_list_search_log devolveu o IP (deveria só o admin_search_ips)'; end if;
  select array_agg(column_name::text order by column_name) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'marketplace_search_log';
  if cols is distinct from array['child_age','city','created_at','id','neighborhood','school','shift'] then
    raise exception 'FALHOU (5): colunas do log de buscas inesperadas (a coluna ip não pode existir): %', cols;
  end if;
  select array_agg(column_name::text order by column_name) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'marketplace_search_ip_log';
  if cols is distinct from array['created_at','id','ip'] then
    raise exception 'FALHOU (5): o log de IP deveria ter só id, ip e hora: %', cols;
  end if;
  raise notice 'OK (5/5): log de IP e de buscas fechados a anon e a motorista (% tentativas); só admin_search_ips entrega o IP', n;
end $$;

do $$ begin raise exception 'RESULTADO: ADMIN MODERACAO PASSOU (5/5)'; end $$;

rollback;
