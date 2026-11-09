-- Kangu v1 — LGPD, registro de exceções de retenção.
-- Casos que precisam ficar ALÉM do prazo padrão (30 dias após perder o vínculo): cada um precisa de categoria,
-- titular (descrição do grupo, nunca nome), justificativa, base legal, prazo e responsável. Só o admin lê e escreve.
-- Nasce com duas linhas marcadas 'a_confirmar': a redação final de base legal e prazo é do jurídico (não inventada aqui).

create table if not exists public.retention_exceptions (
  id               uuid primary key default gen_random_uuid(),
  category         text not null,
  data_subject     text not null,
  justification    text not null,
  legal_basis      text not null,
  retention_period text not null,
  retain_until     date,
  responsible      text not null,
  status           text not null default 'a_confirmar' check (status in ('a_confirmar', 'vigente', 'encerrada')),
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz
);
alter table public.retention_exceptions enable row level security;
revoke all on table public.retention_exceptions from public, anon, authenticated;

create or replace function public.admin_list_retention_exceptions()
returns setof public.retention_exceptions
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query select * from public.retention_exceptions order by status, created_at;
end;
$$;

create or replace function public.admin_save_retention_exception(
  p_id               uuid,
  p_category         text,
  p_data_subject     text,
  p_justification    text,
  p_legal_basis      text,
  p_retention_period text,
  p_retain_until     date,
  p_responsible      text,
  p_status           text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.admin_assert();
  if p_id is null then
    insert into public.retention_exceptions
      (category, data_subject, justification, legal_basis, retention_period, retain_until, responsible, status)
    values
      (p_category, p_data_subject, p_justification, p_legal_basis, p_retention_period, p_retain_until, p_responsible,
       coalesce(p_status, 'a_confirmar'))
    returning id into v_id;
  else
    update public.retention_exceptions
       set category = p_category, data_subject = p_data_subject, justification = p_justification,
           legal_basis = p_legal_basis, retention_period = p_retention_period, retain_until = p_retain_until,
           responsible = p_responsible, status = coalesce(p_status, status), reviewed_at = now()
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.admin_list_retention_exceptions() from public, anon;
revoke all on function public.admin_save_retention_exception(uuid, text, text, text, text, text, date, text, text) from public, anon;
grant execute on function public.admin_list_retention_exceptions() to authenticated;
grant execute on function public.admin_save_retention_exception(uuid, text, text, text, text, text, date, text, text) to authenticated;

insert into public.retention_exceptions (category, data_subject, justification, legal_basis, retention_period, responsible, status)
select * from (values
  ('Financeiro: faturas e comprovantes',
   'Responsável e aluno com fatura emitida (o aluno é anonimizado; valores, datas e situação ficam)',
   'Fatura e comprovante de cobrança precisam ser guardados depois da saída do aluno, para prova de cobrança e obrigações fiscais e contábeis.',
   'A confirmar pelo jurídico', 'A definir pelo jurídico', 'A definir', 'a_confirmar'),
  ('Evidência de consentimento',
   'Responsável que autorizou o tratamento de dados da criança (e o motorista que autorizou a vitrine)',
   'Comprovar, se questionado, que o consentimento existiu, quando, com qual texto e se foi revogado.',
   'A confirmar pelo jurídico', 'A definir pelo jurídico', 'A definir', 'a_confirmar')
) as v(category, data_subject, justification, legal_basis, retention_period, responsible, status)
where not exists (select 1 from public.retention_exceptions);
