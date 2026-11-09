-- Teste das migrations 059–060 (consentimento específico, evidência, revogação, bloqueio por autorização).
-- Roda no SQL Editor com um motorista e um responsável de teste já existentes; sempre reverte no fim.
-- Resultado esperado: "RESULTADO: lgpd_consentimento PASSOU".
do $$
declare
  v_driver uuid; v_guard uuid; v_token text := 'TESTE-consent-' || gen_random_uuid();
  v_sub uuid; v_student uuid; v_route uuid; v_cons uuid; n integer; v_ok boolean; r json; v_cid uuid;
  c2 jsonb := jsonb_build_object('version', 't1', 'sha256', 'abc', 'snapshot', 'texto aceito', 'method', 'remote',
    'ip', '203.0.113.5', 'user_agent', 'ua-teste',
    'checks', jsonb_build_array(jsonb_build_object('text', 'a', 'checked', true), jsonb_build_object('text', 'b', 'checked', true)));
  c1 jsonb := jsonb_build_object('version', 't1', 'sha256', 'abc', 'snapshot', 'texto aceito', 'method', 'remote',
    'checks', jsonb_build_array(jsonb_build_object('text', 'a', 'checked', true)));
  cphoto jsonb := jsonb_build_object('version', 't1', 'sha256', 'def', 'snapshot', 'texto foto', 'method', 'remote', 'checks', '[]'::jsonb);
begin
  select user_id into v_driver from driver_profiles limit 1;
  select user_id into v_guard from guardians limit 1;
  if v_driver is null or v_guard is null then raise exception 'FALHOU 0: precisa de 1 motorista e 1 responsável de teste'; end if;
  insert into capture_links (driver_id, shift, school, token) values (v_driver, 'morning', 'Escola Teste', v_token);
  insert into routes (driver_id, name, direction, shift, weekdays) values (v_driver, 'TESTE rota consent', 'both', 'morning', '{1}') returning id into v_route;

  -- COMO RESPONSÁVEL
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);

  v_ok := false;
  begin perform submit_capture(v_token, 'Criança Teste', null, 'Rua X', true, null, '1', '1'); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 1: cadastro sem autorização deveria ser recusado'; end if;

  v_ok := false;
  begin perform submit_capture(v_token, 'Criança Teste', null, 'Rua X', true, null, '1', '1', p_consent => c1); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 2: autorização com só 1 declaração deveria ser recusada'; end if;

  select count(*) into n from capture_submissions where link_id = (select id from capture_links where token = v_token);
  if n <> 0 then raise exception 'FALHOU 3: tentativa recusada não podia deixar cadastro'; end if;

  r := submit_capture(v_token, 'Criança Teste', null, 'Rua X', true, null, '1', '1', p_consent => c2, p_photo => cphoto);
  v_sub := (r ->> 'submission_id')::uuid;
  select count(*) into n from consents where submission_id = v_sub and kind = 'child_data' and subject_user_id = v_guard and ip = '203.0.113.5' and text_snapshot = 'texto aceito';
  if n <> 1 then raise exception 'FALHOU 4: evidência da autorização da criança não gravada'; end if;
  select count(*) into n from consents where submission_id = v_sub and kind = 'child_photo';
  if n <> 1 then raise exception 'FALHOU 5: evidência da foto não gravada'; end if;

  -- COMO MOTORISTA
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  r := approve_capture(v_sub);
  v_student := (r ->> 'student_id')::uuid;
  select count(*) into n from students where id = v_student and consent_status = 'authorized';
  if n <> 1 then raise exception 'FALHOU 6: aluno aprovado deveria nascer autorizado'; end if;
  select count(*) into n from consents where student_id = v_student and kind in ('child_data', 'child_photo');
  if n <> 2 then raise exception 'FALHOU 7: evidências deveriam apontar para o aluno'; end if;

  set local role authenticated;
  v_ok := false;
  begin
    insert into students (driver_id, full_name) values (v_driver, 'Cadastro direto');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 8: motorista não podia cadastrar aluno direto'; end if;
  select count(*) into n from students where id = v_student;
  if n <> 1 then raise exception 'FALHOU 9: motorista deveria ver o aluno autorizado'; end if;
  reset role;

  -- COMO RESPONSÁVEL: a foto está autorizada e só o titular revoga
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  if not student_photo_allowed(v_student) then raise exception 'FALHOU 10: foto deveria estar permitida'; end if;
  insert into route_stops (route_id, student_id, position, kind) values (v_route, v_student, 1, 'pickup');
  select count(*) into n from route_stops where route_id = v_route and student_id = v_student;
  if n <> 1 then raise exception 'FALHOU 10b: aluno autorizado deveria entrar na rota'; end if;
  select id into v_cid from consents where student_id = v_student and kind = 'child_data' and revoked_at is null;
  r := revoke_consent(v_cid, '203.0.113.9');
  select count(*) into n from students where id = v_student and consent_status = 'suspended';
  if n <> 1 then raise exception 'FALHOU 11: revogar deveria suspender a criança'; end if;
  select count(*) into n from consents where id = v_cid and revoked_at is not null and revoke_ip = '203.0.113.9';
  if n <> 1 then raise exception 'FALHOU 12: revogação deveria gravar data e IP'; end if;
  if student_photo_allowed(v_student) then raise exception 'FALHOU 13: criança suspensa não podia ter foto permitida'; end if;

  -- motorista deixa de ver a criança suspensa; responsável continua vendo
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from students where id = v_student;
  if n <> 0 then raise exception 'FALHOU 14: motorista não podia ver criança suspensa'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from students where id = v_student;
  if n <> 1 then raise exception 'FALHOU 15: responsável deveria continuar vendo a criança'; end if;
  reset role;

  -- criança suspensa não entra em rota
  v_ok := false;
  begin
    insert into route_stops (route_id, student_id, position, kind) values (v_route, v_student, 1, 'dropoff');
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 16: criança suspensa não podia ser colocada em rota'; end if;

  -- reautorizar reativa
  perform reauthorize_child(v_student, c2);
  select count(*) into n from students where id = v_student and consent_status = 'authorized';
  if n <> 1 then raise exception 'FALHOU 17: reautorizar deveria reativar a criança'; end if;

  -- foto: autorizar e retirar
  perform accept_photo_consent(v_student, cphoto);
  if not student_photo_allowed(v_student) then raise exception 'FALHOU 18: foto autorizada deveria ser permitida'; end if;
  select id into v_cid from consents where student_id = v_student and kind = 'child_photo' and revoked_at is null;
  perform revoke_consent(v_cid);
  if student_photo_allowed(v_student) then raise exception 'FALHOU 19: foto retirada não podia ser permitida'; end if;

  -- só o titular revoga o próprio aceite
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  select id into v_cid from consents where student_id = v_student and kind = 'child_data' and revoked_at is null;
  v_ok := false;
  begin perform revoke_consent(v_cid); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 20: motorista não podia revogar aceite do responsável'; end if;

  -- vitrine do motorista: sem aceite não liga; com aceite liga; retirar desliga
  v_ok := false;
  begin update driver_profiles set marketplace_listed = true where user_id = v_driver; exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 21: vitrine não podia ligar sem aceite'; end if;
  perform accept_driver_consent('marketplace_listing', cphoto);
  update driver_profiles set marketplace_listed = true where user_id = v_driver;
  select id into v_cons from consents where subject_user_id = v_driver and kind = 'marketplace_listing' and revoked_at is null;
  perform revoke_consent(v_cons);
  select count(*) into n from driver_profiles where user_id = v_driver and marketplace_listed = false;
  if n <> 1 then raise exception 'FALHOU 22: retirar o aceite deveria desligar a vitrine'; end if;

  -- pedidos pela vitrine: link genérico só com aceite
  v_ok := false;
  begin insert into capture_links (driver_id, kind, token) values (v_driver, 'generic', 'TESTE-gen-' || gen_random_uuid()); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 23: link genérico não podia nascer sem aceite'; end if;
  perform accept_driver_consent('marketplace_requests', cphoto);
  insert into capture_links (driver_id, kind, token) values (v_driver, 'generic', 'TESTE-gen2-' || gen_random_uuid());

  raise exception 'RESULTADO: lgpd_consentimento PASSOU';
end $$;
