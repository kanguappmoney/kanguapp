-- Kangu v1 — LGPD, log de IP das buscas do marketplace separado do log de buscas.
--
-- Antes: `marketplace_search_log` guardava o IP NA MESMA LINHA dos filtros (cidade, bairro, escola, idade, turno) e o
-- zeramento aos 30 dias só rodava de carona quando alguém fazia uma nova busca (sem busca, o IP ficava além do prazo).
-- Agora:
--   • `marketplace_search_ip_log` guarda SÓ o IP bruto + a hora (antiabuso), 30 dias, apagado por job diário;
--   • `marketplace_search_log` fica só com os filtros + a hora (estatística), sem nenhum IP e sem ligação com ele.
-- Os IPs ainda dentro de 30 dias são copiados (sem os filtros) e a coluna `ip` é removida da tabela de buscas.

create table if not exists public.marketplace_search_ip_log (
  id         bigint generated always as identity primary key,
  ip         inet not null,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_search_ip_log_created_idx
  on public.marketplace_search_ip_log (created_at);
alter table public.marketplace_search_ip_log enable row level security;
revoke all on table public.marketplace_search_ip_log from public, anon, authenticated;

insert into public.marketplace_search_ip_log (ip, created_at)
select ip, created_at
  from public.marketplace_search_log
 where ip is not null and created_at >= now() - interval '30 days';

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
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  if v_ip is not null and masklen(v_ip) <> (case when family(v_ip) = 4 then 32 else 128 end) then
    v_ip := null;
  end if;

  insert into public.marketplace_search_log (city, neighborhood, school, child_age, shift)
  values (
    left(nullif(btrim(p_city), ''), 80),
    left(nullif(btrim(p_neighborhood), ''), 80),
    left(nullif(btrim(p_school), ''), 80),
    case when p_child_age between 0 and 30 then p_child_age::smallint end,
    p_shift
  );

  if v_ip is not null then
    insert into public.marketplace_search_ip_log (ip) values (v_ip);
  end if;
end;
$$;

revoke all on function public.log_marketplace_search(text, text, text, integer, student_shift, text) from public;
grant execute on function public.log_marketplace_search(text, text, text, integer, student_shift, text) to anon, authenticated;

create or replace function public.purge_search_ip_log()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  delete from public.marketplace_search_ip_log where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_search_ip_log() from public, anon, authenticated;

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
  v_all   bigint;
  v_with  bigint;
begin
  perform public.admin_assert();
  select count(*) into v_all from public.marketplace_search_log l where l.created_at >= v_since;
  select count(*) into v_with from public.marketplace_search_ip_log i where i.created_at >= v_since;
  return query
  select host(i.ip)::text, count(*), min(i.created_at), max(i.created_at), v_all, v_with
    from public.marketplace_search_ip_log i
   where i.created_at >= v_since
   group by i.ip
   order by count(*) desc, max(i.created_at) desc
   limit 20;
end;
$$;

drop index if exists public.marketplace_search_log_ip_retention_idx;
alter table public.marketplace_search_log drop column if exists ip;

select cron.schedule(
  'kangu_purge_search_ip_log',
  '17 3 * * *',
  $cron$select public.purge_search_ip_log()$cron$
);
