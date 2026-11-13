-- Fatia E (E3): convites do responsável.
-- Prova: (1) aceitar exige responsável logado e a autorização da criança; anônimo e motorista são recusados; (2) o aceite vincula
-- SÓ a criança do convite (o convite de A não liga a B); (3) convite usado, revogado, expirado ou inexistente é recusado, e o
-- expirado vira 'expired'; (4) a pré-visualização pública devolve só 4 campos e nunca lista outras crianças; (5) ninguém além
-- do motorista dono lê student_invites.
-- LIMITE (registrado no README da E): o convite é um segredo ao portador (token no link). Quem tiver o link e uma conta de
-- responsável consegue aceitá-lo; não há vínculo com e-mail. O que protege é o uso único, a validade de 14 dias e a revogação.
-- Roda no SQL Editor com 1 motorista e 2 responsáveis já existentes; reverte no fim.
-- Resultado esperado: "RESULTADO: seguranca_convites PASSOU".
do $$
declare
  v_d uuid; v_o uuid; gA uuid; gB uuid; sA uuid := gen_random_uuid(); sB uuid := gen_random_uuid(); r json; n integer; v_ok boolean; pv json;
  chk jsonb := '{"version":"e3","sha256":"e3","snapshot":"e3","method":"remote","checks":[{"checked":true},{"checked":true}]}'::jsonb;
begin
  select user_id into v_d from driver_profiles order by user_id limit 1;
  select user_id into v_o from driver_profiles where user_id <> v_d order by user_id limit 1;
  select user_id into gA from guardians order by user_id limit 1;
  select user_id into gB from guardians where user_id <> gA order by user_id limit 1;
  if v_d is null or v_o is null or gA is null or gB is null then raise exception 'FALHOU 0: precisa de 2 motoristas e 2 responsáveis'; end if;
  perform set_config('kangu.consent_internal', '1', true);
  insert into students (id, driver_id, full_name, status) values (sA, v_d, 'CONVITE-A', 'active'), (sB, v_d, 'CONVITE-B', 'active');
  update students set consent_status = 'authorized' where id in (sA, sB);
  insert into student_invites (student_id, driver_id, token, status, expires_at) values
    (sA, v_d, 'tok-e3-ok', 'pending', now() + interval '1 day'),
    (sB, v_d, 'tok-e3-b', 'pending', now() + interval '1 day'),
    (sA, v_d, 'tok-e3-revoked', 'revoked', now() + interval '1 day'),
    (sA, v_d, 'tok-e3-expired', 'pending', now() - interval '1 day');

  -- (1) anônimo e motorista recusados; sem autorização recusado
  perform set_config('request.jwt.claims', '', true);
  set local role anon; v_ok := false;
  begin perform accept_student_invite('tok-e3-ok', chk); exception when others then v_ok := true; end; reset role;
  if not v_ok then raise exception 'FALHOU 1a: anônimo não podia aceitar convite'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated; v_ok := false;
  begin perform accept_student_invite('tok-e3-ok', chk); exception when others then v_ok := true; end; reset role;
  if not v_ok then raise exception 'FALHOU 1b: motorista não podia aceitar convite'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated; v_ok := false;
  begin perform accept_student_invite('tok-e3-ok', null); exception when others then v_ok := true; end; reset role;
  if not v_ok then raise exception 'FALHOU 1c: aceitar sem a autorização da criança deveria ser recusado'; end if;
  select count(*) into n from guardian_student where student_id in (sA, sB) and guardian_id = gA;
  if n <> 0 then raise exception 'FALHOU 1d: tentativa recusada não podia vincular'; end if;

  -- (4) pré-visualização pública: só 4 campos
  set local role anon;
  pv := get_invite_preview('tok-e3-ok');
  reset role;
  if (select array_agg(k order by k) from json_object_keys(pv) k) is distinct from array['driver_name','expired','status','student_name'] then
    raise exception 'FALHOU 4a: a prévia deveria ter só status, expired, student_name e driver_name: %', pv;
  end if;
  if pv::text like '%CONVITE-B%' then raise exception 'FALHOU 4b: a prévia vazou outra criança'; end if;
  set local role anon;
  if get_invite_preview('token-que-nao-existe') is not null then reset role; raise exception 'FALHOU 4c: token inexistente deveria dar nulo'; end if;
  reset role;

  -- (2) aceite válido vincula só a criança do convite
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := accept_student_invite('tok-e3-ok', chk);
  reset role;
  select count(*) into n from guardian_student where guardian_id = gA and student_id = sA;
  if n <> 1 then raise exception 'FALHOU 2a: o aceite deveria vincular A à criança do convite'; end if;
  select count(*) into n from guardian_student where guardian_id = gA and student_id = sB;
  if n <> 0 then raise exception 'FALHOU 2b: o convite de A não podia ligar à criança B'; end if;
  select count(*) into n from consents where subject_user_id = gA and student_id = sA and kind = 'child_data' and revoked_at is null;
  if n <> 1 then raise exception 'FALHOU 2c: o aceite deveria gravar a autorização própria do responsável'; end if;

  -- (3) usado, revogado, expirado, inexistente
  perform set_config('request.jwt.claims', json_build_object('sub', gB, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ok := false; begin perform accept_student_invite('tok-e3-ok', chk); exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 3a: convite já usado deveria ser recusado'; end if;
  v_ok := false; begin perform accept_student_invite('tok-e3-revoked', chk); exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 3b: convite revogado deveria ser recusado'; end if;
  v_ok := false; begin perform accept_student_invite('tok-e3-expired', chk); exception when others then v_ok := true; end;
  if not v_ok then reset role; raise exception 'FALHOU 3c: convite expirado deveria ser recusado'; end if;
  v_ok := false; begin perform accept_student_invite('token-que-nao-existe', chk); exception when others then v_ok := true; end;
  reset role;
  if not v_ok then raise exception 'FALHOU 3d: token inexistente deveria ser recusado'; end if;
  select count(*) into n from guardian_student where guardian_id = gB and student_id in (sA, sB);
  if n <> 0 then raise exception 'FALHOU 3e: as tentativas recusadas não podiam vincular B'; end if;

  -- (5) só o motorista dono lê student_invites
  perform set_config('request.jwt.claims', json_build_object('sub', gA, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into n from student_invites where token like 'tok-e3-%'; reset role;
  if n <> 0 then raise exception 'FALHOU 5a: responsável não lê convites (% linhas)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_o, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into n from student_invites where token like 'tok-e3-%'; reset role;
  if n <> 0 then raise exception 'FALHOU 5b: motorista que não é dono não lê convites (% linhas)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated; select count(*) into n from student_invites where token like 'tok-e3-%'; reset role;
  if n <> 4 then raise exception 'FALHOU 5c: o motorista dono deveria ler os 4 convites (veio %)', n; end if;

  raise exception 'RESULTADO: seguranca_convites PASSOU';
end $$;
