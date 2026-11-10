-- Kangu v1 — LGPD, fatia C (segundo responsável): quem aceita o convite também dá o PRÓPRIO aceite da criança.
-- O vínculo sozinho não autoriza o tratamento: cada responsável que se vincula grava a sua autorização (as duas
-- declarações, com versão, hash, cópia do texto, IP e dispositivo). O aceite do convite NÃO reativa uma criança
-- suspensa — isso continua sendo só da reautorização explícita (reauthorize_child). A função antiga (sem aceite)
-- é removida para não haver caminho de vínculo sem autorização.

drop function if exists public.accept_student_invite(text);

create or replace function public.accept_student_invite(p_token text, p_consent jsonb default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_invite  student_invites;
  v_student students;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;
  if not exists (select 1 from guardians where user_id = v_uid) then
    raise exception 'Apenas responsáveis podem aceitar convites.';
  end if;
  if p_consent is null then
    raise exception 'A autorização do responsável é obrigatória para acompanhar a criança.';
  end if;

  select * into v_invite from student_invites where token = p_token for update;
  if not found then raise exception 'Convite inválido.'; end if;
  if v_invite.status <> 'pending' then raise exception 'Convite já utilizado ou cancelado.'; end if;
  if v_invite.expires_at < now() then
    update student_invites set status = 'expired' where id = v_invite.id;
    raise exception 'Convite expirado. Peça um novo ao motorista.';
  end if;

  -- Aceite próprio deste responsável (valida as duas declarações; um aceite ativo por pessoa e criança).
  if not exists (
    select 1 from consents
     where kind = 'child_data' and student_id = v_invite.student_id and subject_user_id = v_uid and revoked_at is null
  ) then
    perform public._insert_consent('child_data', v_uid, v_invite.student_id, null, p_consent,
      'Declaração do responsável (vínculo e poderes) + conta autenticada + convite do motorista');
  end if;

  insert into guardian_student (guardian_id, student_id)
  values (v_uid, v_invite.student_id)
  on conflict do nothing;

  update student_invites
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  select * into v_student from students where id = v_invite.student_id;

  return json_build_object('student_id', v_student.id, 'student_name', v_student.full_name);
end;
$$;

grant execute on function public.accept_student_invite(text, jsonb) to authenticated;
