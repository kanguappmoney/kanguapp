-- Fatia E: a flag interna `kangu.consent_internal` não pode ser acionada por nenhum caminho exposto ao cliente.
-- A flag libera alterações em `consents` e em `students.consent_status` e só é ligada DENTRO de funções SECURITY DEFINER.
-- Prova: (1) a lista de funções do schema public que citam a flag E são executáveis por anon/authenticated é exatamente a
-- esperada (qualquer função nova que a ligue e seja exposta quebra o teste); (2) sem a flag, authenticated e anon NÃO
-- inserem, alteram nem apagam em `consents`; (3) sem a flag, o motorista dono e o responsável não conseguem mudar
-- `students.consent_status` por UPDATE direto (o valor é revertido ou a linha não é afetada); (4) as funções de
-- aprovação/reautorização exigem a autorização (não há atalho por parâmetro); (5) set_config e _insert_consent / _anonymize_student
-- não são funções chamáveis por RPC do cliente (sem EXECUTE para anon/authenticated).
-- A parte HTTP (PostgREST não expõe pg_catalog.set_config nem as funções internas) é provada no script do README da E.
-- Roda no SQL Editor com 1 motorista e 1 responsável já existentes; reverte no fim.
-- Resultado esperado: "RESULTADO: seguranca_flag_consentimento PASSOU".
do $$
declare
  v_d uuid; gA uuid; sA uuid := gen_random_uuid(); n integer; v_ok boolean; cid uuid; st text; exp text[]; got text[]; r record;
  chk jsonb := '{"version":"e6","sha256":"e6","snapshot":"e6","method":"remote","checks":[{"checked":true},{"checked":true}]}'::jsonb;
begin
  select user_id into v_d from driver_profiles order by user_id limit 1;
  select user_id into gA from guardians order by user_id limit 1;
  if v_d is null or gA is null then raise exception 'FALHOU 0: precisa de 1 motorista e 1 responsável'; end if;

  -- (1) lista de funções expostas que ligam a flag
  select array_agg(p.proname::text order by p.proname) into got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ilike '%kangu.consent_internal%'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  exp := array['approve_capture', 'reauthorize_child', 'revoke_consent', 'students_consent_guard'];
  if got is distinct from exp then raise exception 'FALHOU 1: funções expostas que ligam a flag: % (esperado %)', got, exp; end if;

  -- (5) funções internas não executáveis pelo cliente
  for r in select unnest(array['_insert_consent', '_anonymize_student', '_student_in_transit_today', 'anonymize_due_students', 'purge_stale_submissions']) as f loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = r.f
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
    if n <> 0 then raise exception 'FALHOU 5: a função interna % é executável pelo cliente', r.f; end if;
  end loop;

  perform set_config('kangu.consent_internal', '1', true);
  insert into students (id, driver_id, full_name, status) values (sA, v_d, 'FLAG-A', 'active');
  update students set consent_status = 'authorized' where id = sA;
  insert into guardian_student (guardian_id, student_id) values (gA, sA);
  cid := public._insert_consent('child_data', gA, sA, null, chk, 'e6');
  perform set_config('kangu.consent_internal', '', true);

  -- (2) sem a flag: consents é inviolável para o cliente
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false; begin update consents set revoked_at = null, text_snapshot = 'adulterado' where id = cid; get diagnostics n = row_count; if n = 0 then v_ok := true; end if; exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 2a: o titular alterou a própria evidência'; end if;
  v_ok := false; begin delete from consents where id = cid; get diagnostics n = row_count; if n = 0 then v_ok := true; end if; exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 2b: o titular apagou a evidência'; end if;
  v_ok := false; begin insert into consents (kind, subject_user_id, student_id, method, verification_method, text_version, text_sha256, text_snapshot, checkboxes) values ('child_data', gA, sA, 'remote', 'x', 'x', 'x', 'x', '[]'::jsonb); exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 2c: o cliente inseriu direto em consents'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_ok := false; begin update consents set revoked_at = null where id = cid; get diagnostics n = row_count; if n = 0 then v_ok := true; end if; exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 2d: anônimo alterou consents'; end if;
  select count(*) into n from consents where id = cid and text_snapshot = 'e6' and revoked_at is null;
  if n <> 1 then raise exception 'FALHOU 2e: a evidência foi alterada'; end if;

  -- (3) sem a flag: ninguém muda consent_status por UPDATE direto
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update students set consent_status = 'suspended' where id = sA; exception when others then null; end;
  reset role;
  select consent_status into st from students where id = sA;
  if st <> 'authorized' then raise exception 'FALHOU 3a: o motorista mudou consent_status por UPDATE direto (%)', st; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update students set consent_status = 'suspended' where id = sA; exception when others then null; end;
  reset role;
  select consent_status into st from students where id = sA;
  if st <> 'authorized' then raise exception 'FALHOU 3b: o responsável mudou consent_status por UPDATE direto (%)', st; end if;

  -- (4) aprovar/reautorizar não têm atalho: sem autorização, recusado
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false; begin perform reauthorize_child(sA, null); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 4a: reautorizar sem a autorização deveria ser recusado'; end if;

  -- as 3 portas legítimas (aprovar, reautorizar, revogar) recusam anônimo, mesmo tendo EXECUTE herdado do PUBLIC
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_ok := false; begin perform approve_capture(gen_random_uuid()); exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 4b: anônimo não podia chamar approve_capture'; end if;
  v_ok := false; begin perform reauthorize_child(sA, chk); exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 4c: anônimo não podia chamar reauthorize_child'; end if;
  v_ok := false; begin perform revoke_consent(cid, null); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 4d: anônimo não podia chamar revoke_consent'; end if;
  select count(*) into n from consents where id = cid and revoked_at is null;
  if n <> 1 then raise exception 'FALHOU 4e: a evidência não pode ter sido revogada pelo anônimo'; end if;

  raise exception 'RESULTADO: seguranca_flag_consentimento PASSOU';
end $$;
