-- Teste da migration 069: approve_capture, reauthorize_child e revoke_consent não são executáveis por anon.
-- Prova: (1) anônimo é recusado POR PERMISSÃO (sqlstate 42501), não pela validação interna; (2) o fluxo logado continua funcionando:
-- o motorista dono aprova uma submissão (aluno nasce autorizado), o responsável revoga (aluno suspenso) e reautoriza (volta a autorizado);
-- (3) quem não é o dono continua recusado (autenticado, mas sem direito): a trava de dentro da função segue valendo.
-- Roda no SQL Editor com 1 motorista, 1 segundo motorista e 1 responsável existentes; cria dados de teste e reverte no fim.
-- Resultado esperado: "RESULTADO: revogar_execute_anon PASSOU".
do $$
declare
  v_d uuid; v_o uuid; gA uuid; lnk uuid; sub uuid; sid uuid; cid uuid; code text; n integer; r json; st text;
  chk jsonb := '{"version":"p69","sha256":"p69","snapshot":"p69","method":"remote","checks":[{"checked":true},{"checked":true}]}'::jsonb;
begin
  select user_id into v_d from driver_profiles order by user_id limit 1;
  select user_id into v_o from driver_profiles where user_id <> v_d order by user_id limit 1;
  select user_id into gA from guardians order by user_id limit 1;
  if v_d is null or v_o is null or gA is null then raise exception 'FALHOU 0: precisa de 2 motoristas e 1 responsável'; end if;

  -- (1) anônimo: recusa por permissão
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin perform approve_capture(gen_random_uuid()); code := 'sem erro'; exception when others then code := sqlstate; end;
  if code <> '42501' then reset role; raise exception 'FALHOU 1a: approve_capture deveria dar 42501 para anon (veio %)', code; end if;
  begin perform reauthorize_child(gen_random_uuid(), chk); code := 'sem erro'; exception when others then code := sqlstate; end;
  if code <> '42501' then reset role; raise exception 'FALHOU 1b: reauthorize_child deveria dar 42501 para anon (veio %)', code; end if;
  begin perform revoke_consent(gen_random_uuid(), null); code := 'sem erro'; exception when others then code := sqlstate; end;
  reset role;
  if code <> '42501' then raise exception 'FALHOU 1c: revoke_consent deveria dar 42501 para anon (veio %)', code; end if;
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('approve_capture', 'reauthorize_child', 'revoke_consent')
     and grantee in ('PUBLIC', 'anon') and privilege_type = 'EXECUTE';
  if n <> 0 then raise exception 'FALHOU 1d: ainda há EXECUTE para PUBLIC/anon nas 3 funções (%)', n; end if;

  -- (2) fluxo logado: aprovar
  perform set_config('kangu.consent_internal', '1', true);
  insert into capture_links (driver_id, kind, shift, token) values (v_d, 'scoped', 'morning', 'tok-p69') returning id into lnk;
  insert into capture_submissions (link_id, driver_id, guardian_id, child_full_name, pickup_address) values (lnk, v_d, gA, 'P69-CRIANCA', 'Rua P 1') returning id into sub;
  perform public._insert_consent('child_data', gA, null, sub, chk, 'p69');
  perform set_config('kangu.consent_internal', '', true);

  -- (3) outro motorista autenticado é recusado pela regra interna (não por permissão)
  perform set_config('request.jwt.claims', json_build_object('sub', v_o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform approve_capture(sub); code := 'sem erro'; exception when others then code := sqlstate; end;
  reset role;
  if code in ('sem erro', '42501') then raise exception 'FALHOU 3: outro motorista deveria ser recusado pela validação interna (veio %)', code; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := approve_capture(sub);
  reset role;
  sid := (r ->> 'student_id')::uuid;
  select consent_status into st from students where id = sid;
  if st <> 'authorized' then raise exception 'FALHOU 2a: o aluno aprovado deveria nascer autorizado (veio %)', st; end if;

  -- revogar e reautorizar pelo responsável
  select id into cid from consents where student_id = sid and kind = 'child_data' and revoked_at is null;
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform revoke_consent(cid, null);
  reset role;
  select consent_status into st from students where id = sid;
  if st <> 'suspended' then raise exception 'FALHOU 2b: revogar deveria suspender (veio %)', st; end if;
  set local role authenticated;
  perform reauthorize_child(sid, chk);
  reset role;
  select consent_status into st from students where id = sid;
  if st <> 'authorized' then raise exception 'FALHOU 2c: reautorizar deveria reativar (veio %)', st; end if;

  raise exception 'RESULTADO: revogar_execute_anon PASSOU';
end $$;
