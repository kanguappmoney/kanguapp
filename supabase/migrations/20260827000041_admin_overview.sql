-- Kangu — Admin, Visão Geral (parte 1): UMA função de leitura agregada, só para a allowlist.
--
-- `admin_overview(p_days)` devolve um jsonb com os números da landing do /admin. Como toda
-- função admin_*: SECURITY DEFINER, começa por `admin_assert()` (42501 'Acesso negado.' para
-- quem não está em admin_users), sem execute para anon. Só agregados — nenhuma linha de
-- pessoa, endereço ou telefone sai daqui.
--
-- Chaves: drivers_total, drivers_by_status{trial,active,paused}, profile_complete (perfil
-- completo = prefixo+placa+modelo+cor, o mesmo portão da Frente A), listed_visible (quantos
-- APARECEM de verdade na vitrine — usa a regra única marketplace_visible), guardians_total,
-- guardians_active (≥1 aluno ATIVO vinculado), students_active, series[6 baldes de 5 dias =
-- 30 dias; fuso de São Paulo] com novos motoristas/responsáveis/alunos, funnel (período
-- 7 ou 30 dias: buscas → pedidos pelo link genérico → aprovados/rejeitados/pendentes) e
-- top_cities/top_schools (as mais buscadas no período, sem diferença de maiúsculas).
-- p_days só aceita 7 ou 30 (qualquer outro valor vira 30).

create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days  integer     := case when p_days = 7 then 7 else 30 end;
  v_since timestamptz := now() - make_interval(days => case when p_days = 7 then 7 else 30 end);
  v_today date        := (now() at time zone 'America/Sao_Paulo')::date;
  v_out   jsonb;
begin
  perform public.admin_assert();

  select jsonb_build_object(
    'period_days', v_days,
    'drivers_total', (select count(*) from public.driver_profiles),
    'drivers_by_status', jsonb_build_object(
      'trial',  (select count(*) from public.driver_profiles dp where dp.subscription_status = 'trial'),
      'active', (select count(*) from public.driver_profiles dp where dp.subscription_status = 'active'),
      'paused', (select count(*) from public.driver_profiles dp where dp.subscription_status = 'paused')),
    'profile_complete', (
      select count(*)
        from public.driver_profiles dp
        join lateral (
          select vv.prefix, vv.plate, vv.model, vv.color
            from public.vehicles vv
           where vv.driver_id = dp.user_id
           order by vv.created_at, vv.id
           limit 1
        ) v on true
       where nullif(btrim(v.prefix), '') is not null and nullif(btrim(v.plate), '') is not null
         and nullif(btrim(v.model), '')  is not null and nullif(btrim(v.color), '') is not null),
    'listed_visible', (select count(*) from public.marketplace_visible()),
    'guardians_total', (select count(*) from public.guardians),
    'guardians_active', (
      select count(distinct gs.guardian_id)
        from public.guardian_student gs
        join public.students s on s.id = gs.student_id
       where s.status = 'active'),
    'students_active', (select count(*) from public.students s where s.status = 'active'),
    'series', (
      select jsonb_agg(jsonb_build_object(
               'label', to_char(b.d0, 'DD/MM'),
               'drivers', (select count(*) from public.driver_profiles dp
                             join public.users u on u.id = dp.user_id
                            where (u.created_at at time zone 'America/Sao_Paulo')::date between b.d0 and b.d1),
               'guardians', (select count(*) from public.guardians gd
                               join public.users u on u.id = gd.user_id
                              where (u.created_at at time zone 'America/Sao_Paulo')::date between b.d0 and b.d1),
               'students', (select count(*) from public.students s
                             where (s.created_at at time zone 'America/Sao_Paulo')::date between b.d0 and b.d1)
             ) order by b.i)
        from (select g as i, v_today - 29 + 5 * g as d0, v_today - 25 + 5 * g as d1
                from generate_series(0, 5) g) b),
    'funnel', jsonb_build_object(
      'searches', (select count(*) from public.marketplace_search_log l where l.created_at >= v_since),
      'requests', (select count(*) from public.capture_submissions cs
                     join public.capture_links cl on cl.id = cs.link_id
                    where cl.kind = 'generic' and cs.created_at >= v_since),
      'approved', (select count(*) from public.capture_submissions cs
                     join public.capture_links cl on cl.id = cs.link_id
                    where cl.kind = 'generic' and cs.created_at >= v_since and cs.status = 'approved'),
      'rejected', (select count(*) from public.capture_submissions cs
                     join public.capture_links cl on cl.id = cs.link_id
                    where cl.kind = 'generic' and cs.created_at >= v_since and cs.status = 'rejected'),
      'pending',  (select count(*) from public.capture_submissions cs
                     join public.capture_links cl on cl.id = cs.link_id
                    where cl.kind = 'generic' and cs.created_at >= v_since and cs.status = 'pending')),
    'top_cities', coalesce((
      select jsonb_agg(jsonb_build_object('label', t.label, 'count', t.n) order by t.n desc, t.label)
        from (select (array_agg(l.city order by l.city))[1] as label, count(*) as n
                from public.marketplace_search_log l
               where l.created_at >= v_since and l.city is not null
               group by lower(l.city)
               order by n desc, label
               limit 5) t), '[]'::jsonb),
    'top_schools', coalesce((
      select jsonb_agg(jsonb_build_object('label', t.label, 'count', t.n) order by t.n desc, t.label)
        from (select (array_agg(l.school order by l.school))[1] as label, count(*) as n
                from public.marketplace_search_log l
               where l.created_at >= v_since and l.school is not null
               group by lower(l.school)
               order by n desc, label
               limit 5) t), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.admin_overview(integer) from public, anon;
grant execute on function public.admin_overview(integer) to authenticated;
