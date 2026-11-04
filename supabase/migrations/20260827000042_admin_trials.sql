-- Kangu — Admin, Assinaturas a acompanhar (parte 2): motoristas em TRIAL, do mais antigo ao
-- mais novo, para a decisão manual de cobrança (a assinatura é cobrada fora do app no piloto).
--
-- ATENÇÃO ao critério: o banco NÃO guarda o histórico de mudança de `subscription_status`
-- (só o valor atual). "Há quanto tempo sem virar active" é, portanto, medido desde o
-- CADASTRO do motorista (`users.created_at`) — o melhor proxy disponível. Um motorista que
-- foi pausado e voltou a trial aparece com a idade do cadastro, não da volta. Quando houver
-- Asaas/webhook, vale registrar a data da transição.
--
-- Função admin_*: SECURITY DEFINER, `admin_assert()` (42501 'Acesso negado.'), sem execute
-- para anon. Devolve contato para o admin cobrar (nome, e-mail, telefone) — dados do
-- próprio motorista (cliente pagante), nunca de aluno/responsável.

create or replace function public.admin_list_trials()
returns table (
  user_id                uuid,
  full_name              text,
  email                  text,
  phone                  text,
  created_at             timestamptz,
  days_as_trial          integer,
  profile_complete       boolean,
  active_students        integer,
  visible_on_marketplace boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query
  select
    dp.user_id,
    u.full_name,
    au.email::text,
    u.phone,
    u.created_at,
    greatest(floor(extract(epoch from (now() - u.created_at)) / 86400)::integer, 0),
    (nullif(btrim(v.prefix), '') is not null and nullif(btrim(v.plate), '') is not null
       and nullif(btrim(v.model), '') is not null and nullif(btrim(v.color), '') is not null),
    (select count(*)::integer from public.students s where s.driver_id = dp.user_id and s.status = 'active'),
    exists (select 1 from public.marketplace_visible() mv where mv.user_id = dp.user_id)
  from public.driver_profiles dp
  join public.users u on u.id = dp.user_id
  join auth.users au on au.id = dp.user_id
  left join lateral (
    select vv.prefix, vv.plate, vv.model, vv.color
      from public.vehicles vv
     where vv.driver_id = dp.user_id
     order by vv.created_at, vv.id
     limit 1
  ) v on true
  where dp.subscription_status = 'trial'
  order by u.created_at asc, dp.user_id;
end;
$$;

revoke all on function public.admin_list_trials() from public, anon;
grant execute on function public.admin_list_trials() to authenticated;
