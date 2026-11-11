-- Teste da migration 063 (link sem escola pré-selecionada + endereço em partes).
-- Prova: (1) o preview do link não revela escola; (2) o responsável só consegue enviar escola que o motorista
-- atende (driver_schools), no link por turno e no genérico; (3) motorista sem escolas = recusa; (4) número,
-- bairro, cidade e rua são obrigatórios no embarque e, se diferente, no desembarque; (5) o texto do endereço é
-- composto no banco; (6) a aprovação leva escola e partes ao aluno; (7) a anonimização apaga as partes.
-- Roda no SQL Editor com 1 motorista e 1 responsável de teste já existentes; sempre reverte no fim.
-- Resultado esperado: "RESULTADO: escola_endereco_partes PASSOU".
do $$
declare
  v_driver uuid; v_guard uuid; v_tok_s text := 'TESTE-esc-s-' || gen_random_uuid(); v_tok_g text := 'TESTE-esc-g-' || gen_random_uuid();
  v_in integer; v_out integer; v_name_in text; v_name_out text;
  v_sub uuid; v_student uuid; v_ok boolean; r json; n integer; v_txt text; prev json;
  c jsonb := jsonb_build_object('version', 't1', 'sha256', 'abc', 'snapshot', 'texto aceito', 'method', 'remote',
    'checks', jsonb_build_array(jsonb_build_object('text', 'a', 'checked', true), jsonb_build_object('text', 'b', 'checked', true)));
  ok jsonb := jsonb_build_object('street', 'Rua das Flores', 'number', '123', 'neighborhood', 'Centro', 'city', 'Mauá');
begin
  select user_id into v_driver from driver_profiles limit 1;
  select user_id into v_guard from guardians limit 1;
  if v_driver is null or v_guard is null then raise exception 'FALHOU 0: precisa de 1 motorista e 1 responsável de teste'; end if;

  select inep_code, coalesce(display_name, name) into v_in, v_name_in from schools order by inep_code limit 1;
  select inep_code, coalesce(display_name, name) into v_out, v_name_out from schools where inep_code <> v_in order by inep_code limit 1;

  delete from driver_schools where driver_id = v_driver;
  insert into capture_links (driver_id, kind, shift, token) values (v_driver, 'scoped', 'morning', v_tok_s);
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform accept_driver_consent('marketplace_requests', jsonb_build_object('version', 't1', 'sha256', 'def', 'snapshot', 'texto', 'method', 'remote', 'checks', '[]'::jsonb));
  reset role;
  insert into capture_links (driver_id, kind, token) values (v_driver, 'generic', v_tok_g);

  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1) preview não mostra escola
  prev := get_capture_link_preview(v_tok_s);
  if prev ->> 'school' is not null then raise exception 'FALHOU 1: preview do link não pode revelar escola'; end if;

  -- 3) motorista sem escolas cadastradas: recusa
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok, true, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 3: motorista sem escolas não pode receber cadastro'; end if;

  reset role;
  insert into driver_schools (driver_id, inep_code) values (v_driver, v_in);
  perform set_config('request.jwt.claims', json_build_object('sub', v_guard, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 2) escola fora da lista: recusa (link por turno e genérico); escola vazia: recusa
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok, true, null, '1', '1', null, null, v_name_out, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 2a: escola fora da lista do motorista deveria ser recusada (link por turno)'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_g, 'Criança', null, ok, true, null, '1', '1', null, null, v_name_out, 'morning', c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 2b: escola fora da lista deveria ser recusada (link genérico)'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok, true, null, '1', '1', null, null, null, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 2c: sem escola deveria ser recusado'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_g, 'Criança', null, ok, true, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 2d: link genérico sem turno deveria ser recusado'; end if;

  -- 4) partes obrigatórias (embarque)
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok - 'number', true, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 4a: embarque sem número deveria ser recusado'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, jsonb_set(ok, '{number}', '"  "'), true, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 4b: número em branco deveria ser recusado'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok - 'neighborhood', true, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 4c: embarque sem bairro deveria ser recusado'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok - 'city', true, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 4d: embarque sem cidade deveria ser recusado'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok - 'street', true, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 4e: embarque sem rua deveria ser recusado'; end if;
  -- desembarque diferente: partes também obrigatórias
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok, false, ok - 'number', '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 4f: desembarque sem número deveria ser recusado'; end if;
  v_ok := false;
  begin perform submit_capture(v_tok_s, 'Criança', null, ok, false, null, '1', '1', null, null, v_name_in, null, c); exception when others then v_ok := true; end;
  if not v_ok then raise exception 'FALHOU 4g: desembarque diferente sem endereço deveria ser recusado'; end if;

  select count(*) into n from capture_submissions where driver_id = v_driver and link_id in (select id from capture_links where token in (v_tok_s, v_tok_g));
  if n <> 0 then raise exception 'FALHOU 4h: tentativas recusadas não podem deixar cadastro (achou %)', n; end if;

  -- 5) caminho feliz (link por turno): escola da lista, texto composto no banco
  r := submit_capture(v_tok_s, 'Criança Teste', null, ok, true, null, '1', '1', null, null, v_name_in, null, c);
  v_sub := (r ->> 'submission_id')::uuid;
  select pickup_address into v_txt from capture_submissions where id = v_sub;
  if v_txt <> 'Rua das Flores, 123 - Centro, Mauá' then raise exception 'FALHOU 5a: texto composto errado: %', v_txt; end if;
  select count(*) into n from capture_submissions where id = v_sub and child_school = v_name_in and pickup_number = '123' and pickup_neighborhood = 'Centro' and pickup_city = 'Mauá';
  if n <> 1 then raise exception 'FALHOU 5b: escola/partes não gravadas na solicitação'; end if;
  -- caminho feliz (genérico) com desembarque diferente
  r := submit_capture(v_tok_g, 'Criança Dois', null, ok, false, jsonb_build_object('street','Av Brasil','number','S/N','neighborhood','Vila','city','Santo André'), '1', '1', null, null, v_name_in, 'afternoon', c);
  select dropoff_address into v_txt from capture_submissions where id = (r ->> 'submission_id')::uuid;
  if v_txt <> 'Av Brasil, S/N - Vila, Santo André' then raise exception 'FALHOU 5c: desembarque composto errado: %', v_txt; end if;

  -- 6) aprovação leva escola e partes ao aluno (como o motorista)
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  r := approve_capture(v_sub);
  v_student := (r ->> 'student_id')::uuid;
  select count(*) into n from students where id = v_student and school = v_name_in and pickup_street = 'Rua das Flores' and pickup_number = '123'
    and dropoff_number = '123' and dropoff_city = 'Mauá';
  if n <> 1 then raise exception 'FALHOU 6: aluno aprovado sem escola/partes de endereço'; end if;

  -- 7) anonimização apaga as partes
  reset role;
  perform _anonymize_student(v_student, 'admin', 'teste 063', null);
  select count(*) into n from students where id = v_student
    and pickup_street is null and pickup_number is null and pickup_neighborhood is null and pickup_city is null
    and dropoff_street is null and dropoff_number is null and dropoff_neighborhood is null and dropoff_city is null;
  if n <> 1 then raise exception 'FALHOU 7: anonimização deixou partes do endereço'; end if;

  raise exception 'RESULTADO: escola_endereco_partes PASSOU';
end $$;
