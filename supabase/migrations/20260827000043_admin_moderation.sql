-- Kangu — Admin, Moderação (parte 3): fotos públicas das vans + IPs com mais buscas.
--
-- MUDANÇA DE DECISÃO (a pedido do Abner): a Frente F guardava no log SÓ filtros + hora, sem
-- IP. Para listar IPs com maior volume de busca (identificar abuso à mão) o log passa a guardar
-- o IP — dado pessoal pela LGPD. Mitigações: (1) só `inet` de host (CIDR e lixo viram NULL);
-- (2) RETENÇÃO de 30 dias — a cada busca registrada, os IPs com mais de 30 dias são zerados
-- (a linha dos filtros + hora fica, o IP some; índice parcial mantém isso barato); (3) só o
-- admin lê (a tabela segue fechada a anon/authenticated; a leitura é admin_search_ips);
-- (4) só VISIBILIDADE — nada aqui bloqueia, limita ou age sobre ninguém.
--
-- Fotos: lista as fotos de van já cadastradas (bucket PÚBLICO van-photos) para revisão visual
-- periódica — sem ação automática. A data é a do upload no storage (cai para a do perfil se o
-- objeto não existir).
--
-- Funções admin_*: SECURITY DEFINER + admin_assert() (42501), sem execute para anon.

alter table public.marketplace_search_log add column if not exists ip inet;
create index if not exists marketplace_search_log_ip_retention_idx
  on public.marketplace_search_log (created_at) where ip is not null;

-- Assinatura nova (6º parâmetro p_ip, opcional): a antiga sai para não haver ambiguidade.
drop function if exists public.log_marketplace_search(text, text, text, integer, student_shift);

create or replace function public.log_marketplace_search(
  p_city         text          default null,
  p_neighborhood text          default null,
  p_school       text          default null,
  p_child_age    integer       default null,
  p_shift        student_shift default null,
  p_ip           text          default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet;
begin
  -- IP só se for um ENDEREÇO de host válido ('unknown', lixo e blocos CIDR viram NULL).
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  -- (CASE entre parênteses: no PL/pgSQL o THEN do CASE seria lido como o THEN do IF.)
  if v_ip is not null and masklen(v_ip) <> (case when family(v_ip) = 4 then 32 else 128 end) then
    v_ip := null;
  end if;

  insert into public.marketplace_search_log (city, neighborhood, school, child_age, shift, ip)
  values (
    left(nullif(btrim(p_city), ''), 80),
    left(nullif(btrim(p_neighborhood), ''), 80),
    left(nullif(btrim(p_school), ''), 80),
    case when p_child_age between 0 and 30 then p_child_age::smallint end,
    p_shift,
    v_ip
  );

  -- Retenção: IP com mais de 30 dias é zerado (a busca em si, sem IP, permanece).
  update public.marketplace_search_log
     set ip = null
   where ip is not null and created_at < now() - interval '30 days';
end;
$$;

revoke all on function public.log_marketplace_search(text, text, text, integer, student_shift, text) from public;
grant execute on function public.log_marketplace_search(text, text, text, integer, student_shift, text) to anon, authenticated;

-- IPs com mais buscas no período (7 ou 30 dias; outro valor vira 7). Top 20.
create or replace function public.admin_search_ips(p_days integer default 7)
returns table (
  ip              text,
  searches        bigint,
  first_at        timestamptz,
  last_at         timestamptz,
  total_in_period bigint,
  total_with_ip   bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - make_interval(days => case when p_days = 30 then 30 else 7 end);
begin
  perform public.admin_assert();
  return query
  with p as (
    select l.ip as ipaddr, l.created_at as at
      from public.marketplace_search_log l
     where l.created_at >= v_since
  ), tot as (
    select count(*) as all_n, count(p.ipaddr) as ip_n from p
  )
  select host(p.ipaddr)::text, count(*), min(p.at), max(p.at), t.all_n, t.ip_n
    from p cross join tot t
   where p.ipaddr is not null
   group by p.ipaddr, t.all_n, t.ip_n
   order by count(*) desc, max(p.at) desc
   limit 20;
end;
$$;

-- Fotos públicas de van cadastradas (revisão visual). Sem ação.
create or replace function public.admin_list_van_photos()
returns table (
  user_id                uuid,
  full_name              text,
  email                  text,
  van_photo_path         text,
  photo_at               timestamptz,
  marketplace_listed     boolean,
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
    dp.van_photo_path,
    coalesce(o.created_at, dp.updated_at),
    dp.marketplace_listed,
    exists (select 1 from public.marketplace_visible() mv where mv.user_id = dp.user_id)
  from public.driver_profiles dp
  join public.users u on u.id = dp.user_id
  join auth.users au on au.id = dp.user_id
  left join lateral (
    select so.created_at
      from storage.objects so
     where so.bucket_id = 'van-photos' and so.name = dp.van_photo_path
     limit 1
  ) o on true
  where nullif(btrim(dp.van_photo_path), '') is not null
  order by coalesce(o.created_at, dp.updated_at) desc, dp.user_id;
end;
$$;

revoke all on function public.admin_search_ips(integer) from public, anon;
revoke all on function public.admin_list_van_photos() from public, anon;
grant execute on function public.admin_search_ips(integer) to authenticated;
grant execute on function public.admin_list_van_photos() to authenticated;
