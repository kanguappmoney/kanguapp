-- Fatia E (E1 + E2): G5 entre famílias e foto privada da criança.
-- Prova: com duas famílias (A e B) preenchidas em TODAS as tabelas que guardam dado de criança ou do responsável, o responsável
-- A só lê o que é dele; o responsável B idem; um motorista que NÃO é dono e o anônimo não leem nada; o motorista dono lê os
-- alunos autorizados dele. Tabelas: students, guardian_student, student_invites, capture_submissions, route_stops, route_events,
-- route_executions, absences, invoices, consents, notifications, erasure_requests, e get_active_journey (sem paradas/nomes
-- de outra família). E2: objetos do bucket student-photos (privado): só o responsável vinculado e o motorista dono leem.
-- Cada contagem "do outro" vem acompanhada da contagem "do próprio" (> 0) para o teste não ser vazio.
-- Roda no SQL Editor com 1 motorista, 1 segundo motorista e 2 responsáveis já existentes; cria dados de teste e reverte no fim.
-- Resultado esperado: "RESULTADO: seguranca_g5_familias PASSOU".
create function pg_temp.cnt(p_role text, p_uid uuid, p_sql text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  begin
    execute p_sql into n;
  exception when insufficient_privilege then
    n := 0; -- acesso negado por privilégio conta como "não leu nada"
  end;
  reset role;
  return n;
end $$;

do $$
declare
  v_d uuid; v_o uuid; gA uuid; gB uuid; sA uuid := gen_random_uuid(); sB uuid := gen_random_uuid();
  lnk uuid; t1 text; t2 text; rA uuid; rB uuid; eA uuid; eB uuid; j json; n integer; m integer; t text; r record;
  chk jsonb := '{"version":"e1","sha256":"e1","snapshot":"e1","method":"remote","checks":[{"checked":true},{"checked":true}]}'::jsonb;
begin
  select user_id into v_d from driver_profiles order by user_id limit 1;
  select user_id into v_o from driver_profiles where user_id <> v_d order by user_id limit 1;
  select user_id into gA from guardians order by user_id limit 1;
  select user_id into gB from guardians where user_id <> gA order by user_id limit 1;
  if v_d is null or v_o is null or gA is null or gB is null then raise exception 'FALHOU 0: precisa de 2 motoristas e 2 responsáveis'; end if;

  perform set_config('kangu.consent_internal', '1', true);
  insert into students (id, driver_id, full_name, status) values (sA, v_d, 'FAMILIA-A-CRIANCA', 'active'), (sB, v_d, 'FAMILIA-B-CRIANCA', 'active');
  update students set consent_status = 'authorized' where id in (sA, sB);
  insert into guardian_student (guardian_id, student_id) values (gA, sA), (gB, sB);
  insert into student_invites (student_id, driver_id, token) values (sA, v_d, 'tok-e1-a'), (sB, v_d, 'tok-e1-b');
  insert into capture_links (driver_id, kind, shift, token) values (v_d, 'scoped', 'morning', 'tok-e1-link') returning id into lnk;
  insert into capture_submissions (link_id, driver_id, guardian_id, child_full_name, pickup_address) values
    (lnk, v_d, gA, 'FAMILIA-A-SUB', 'Rua A 1'), (lnk, v_d, gB, 'FAMILIA-B-SUB', 'Rua B 1');
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_d, 'TESTE E1 A', 'both', 'morning', '{1}') returning id into rA;
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_d, 'TESTE E1 B', 'both', 'morning', '{1}') returning id into rB;
  insert into route_stops (route_id, student_id, position, kind) values (rA, sA, 1, 'pickup'), (rB, sB, 1, 'pickup');
  insert into route_executions (route_id, service_date, leg, status, started_at) values (rA, sp_today(), 'pickup', 'in_progress', now() + interval '1 minute') returning id into eA;
  insert into route_executions (route_id, service_date, leg, status, started_at) values (rB, sp_today(), 'pickup', 'in_progress', now()) returning id into eB;
  insert into route_events (execution_id, student_id, type) values (eA, sA, 'embarked'), (eB, sB, 'embarked');
  insert into absences (student_id, service_date, leg) values (sA, sp_today() + 1, 'both'), (sB, sp_today() + 1, 'both');
  insert into invoices (student_id, guardian_id, driver_id, billing_period, amount_cents, due_date) values
    (sA, gA, v_d, date_trunc('month', sp_today())::date, 10000, sp_today() + 5), (sB, gB, v_d, date_trunc('month', sp_today())::date, 10000, sp_today() + 5);
  perform public._insert_consent('child_data', gA, sA, null, chk, 'e1');
  perform public._insert_consent('child_data', gB, sB, null, chk, 'e1');
  insert into notifications (user_id, title, body, channel) values (gA, 'FAMILIA-A', 'x', 'in_app'), (gB, 'FAMILIA-B', 'x', 'in_app');
  insert into erasure_requests (student_id, requested_by, note) values (sA, gA, 'A'), (sB, gB, 'B');
  insert into storage.objects (bucket_id, name) values ('student-photos', sA::text || '/foto.jpg'), ('student-photos', sB::text || '/foto.jpg');

  -- Para cada tabela: (rótulo, SQL do que é da família B, SQL do que é da família A)
  for r in
    select * from (values
      ('students',            'select count(*) from students where id = ''%B%''',                            'select count(*) from students where id = ''%A%'''),
      ('guardian_student',    'select count(*) from guardian_student where student_id = ''%B%''',            'select count(*) from guardian_student where student_id = ''%A%'''),
      ('capture_submissions', 'select count(*) from capture_submissions where guardian_id = ''%gB%''',       'select count(*) from capture_submissions where guardian_id = ''%gA%'''),
      ('route_stops',         'select count(*) from route_stops where student_id = ''%B%''',                 'select count(*) from route_stops where student_id = ''%A%'''),
      ('route_events',        'select count(*) from route_events where student_id = ''%B%''',                'select count(*) from route_events where student_id = ''%A%'''),
      ('route_executions',    'select count(*) from route_executions where id = ''%eB%''',                   'select count(*) from route_executions where id = ''%eA%'''),
      ('absences',            'select count(*) from absences where student_id = ''%B%''',                    'select count(*) from absences where student_id = ''%A%'''),
      ('invoices',            'select count(*) from invoices where student_id = ''%B%''',                    'select count(*) from invoices where student_id = ''%A%'''),
      ('consents',            'select count(*) from consents where subject_user_id = ''%gB%''',              'select count(*) from consents where subject_user_id = ''%gA%'''),
      ('notifications',       'select count(*) from notifications where user_id = ''%gB%''',                 'select count(*) from notifications where user_id = ''%gA%'''),
      ('erasure_requests',    'select count(*) from erasure_requests where requested_by = ''%gB%''',        'select count(*) from erasure_requests where requested_by = ''%gA%'''),
      ('storage student-photos', 'select count(*) from storage.objects where bucket_id = ''student-photos'' and name like ''%B%/%''', 'select count(*) from storage.objects where bucket_id = ''student-photos'' and name like ''%A%/%''')
    ) v(tabela, do_outro, do_proprio)
  loop
    -- A olhando B; B olhando A: nada. Cada um olhando o próprio: algo (teste não vazio).
    -- (substituições dos marcadores)
    t1 := replace(replace(replace(replace(replace(replace(r.do_outro, '%B%', sB::text), '%gB%', gB::text), '%eB%', eB::text), '%A%', sA::text), '%gA%', gA::text), '%eA%', eA::text);
    t2 := replace(replace(replace(replace(replace(replace(r.do_proprio, '%B%', sB::text), '%gB%', gB::text), '%eB%', eB::text), '%A%', sA::text), '%gA%', gA::text), '%eA%', eA::text);
    -- A vê B?
    n := pg_temp.cnt('authenticated', gA, t1);
    if n <> 0 then raise exception 'FALHOU E1 (%): o responsável A leu % linha(s) da família B', r.tabela, n; end if;
    -- A vê o próprio?
    if r.tabela <> 'student_invites' then
      m := pg_temp.cnt('authenticated', gA, t2);
      if m < 1 then raise exception 'FALHOU E1 (%): o responsável A deveria ler o que é dele (teste vazio?)', r.tabela; end if;
    end if;
    -- B vê A? (espelho: o "outro" de B é o "próprio" de A)
    n := pg_temp.cnt('authenticated', gB, t2);
    if n <> 0 then raise exception 'FALHOU E1 (%): o responsável B leu % linha(s) da família A', r.tabela, n; end if;
    -- outro motorista (não dono) e anônimo: nada de nenhuma das duas famílias
    n := pg_temp.cnt('authenticated', v_o, t1) + pg_temp.cnt('authenticated', v_o, t2);
    if n <> 0 then raise exception 'FALHOU E1 (%): motorista que não é dono leu % linha(s)', r.tabela, n; end if;
    n := pg_temp.cnt('anon', null, t1) + pg_temp.cnt('anon', null, t2);
    if n <> 0 then raise exception 'FALHOU E1 (%): anônimo leu % linha(s)', r.tabela, n; end if;
  end loop;

  -- convites: nenhum responsável lê student_invites, nem o próprio convite; o motorista dono lê
  n := pg_temp.cnt('authenticated', gA, 'select count(*) from student_invites where token like ''tok-e1-%''') + pg_temp.cnt('authenticated', gB, 'select count(*) from student_invites where token like ''tok-e1-%''');
  if n <> 0 then raise exception 'FALHOU E1 (student_invites): responsável leu convites (% linhas)', n; end if;
  n := pg_temp.cnt('anon', null, 'select count(*) from student_invites where token like ''tok-e1-%''') + pg_temp.cnt('authenticated', v_o, 'select count(*) from student_invites where token like ''tok-e1-%''');
  if n <> 0 then raise exception 'FALHOU E1 (student_invites): anônimo/outro motorista leu convites (% linhas)', n; end if;
  n := pg_temp.cnt('authenticated', v_d, 'select count(*) from student_invites where token like ''tok-e1-%''');
  if n <> 2 then raise exception 'FALHOU E1 (student_invites): o motorista dono deveria ler os 2 convites (veio %)', n; end if;

  -- motorista dono: lê os alunos autorizados e as fotos dos próprios alunos
  n := pg_temp.cnt('authenticated', v_d, 'select count(*) from students where id in (''' || sA || ''',''' || sB || ''')');
  if n <> 2 then raise exception 'FALHOU E1: o motorista dono deveria ler os 2 alunos (veio %)', n; end if;
  n := pg_temp.cnt('authenticated', v_d, 'select count(*) from storage.objects where bucket_id = ''student-photos'' and name in (''' || sA || '/foto.jpg'',''' || sB || '/foto.jpg'')');
  if n <> 2 then raise exception 'FALHOU E2: o motorista dono deveria ler as 2 fotos (veio %)', n; end if;

  -- E2: o bucket é privado e as fotos só saem por URL assinada (sem leitura pública)
  select 1 into n from storage.buckets where id = 'student-photos' and public is false;
  if n is null then raise exception 'FALHOU E2: o bucket student-photos deveria ser privado'; end if;

  -- get_active_journey: cada responsável vê só a própria jornada (execuções diferentes; A começou depois, B antes)
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated; j := get_active_journey(); reset role;
  t := j::text;
  if j is null or t like '%FAMILIA-B%' or (j ->> 'execution_id')::uuid <> eA then raise exception 'FALHOU E1 (jornada A): %', t; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gB, 'role', 'authenticated')::text, true);
  set local role authenticated; j := get_active_journey(); reset role;
  t := j::text;
  if j is null or t like '%FAMILIA-A%' or (j ->> 'execution_id')::uuid <> eB then raise exception 'FALHOU E1 (jornada B): %', t; end if;
  if (j ->> 'total_stops')::int <> 1 or json_array_length(j -> 'children') <> 1 then raise exception 'FALHOU E1 (jornada B): recorte errado: %', t; end if;

  raise exception 'RESULTADO: seguranca_g5_familias PASSOU';
end $$;
