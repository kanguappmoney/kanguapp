-- Kangu v1 — LGPD/Marco Civil: log legal de acesso à aplicação (IP + data/hora), retido por 6 meses.
--
-- Separado do log de IP de busca do marketplace (migration 056, 30 dias, antiabuso). Este é o registro de acesso
-- exigido do provedor de aplicações pessoa jurídica; cobre usuário logado E público (decisão: logado e público
-- por ora, a confirmar com o advogado).
--
-- Gravação POR SESSÃO, não por requisição: o middleware chama `log_app_access` e a função só insere quando não há
-- registro do mesmo IP + mesmo usuário nas últimas 6 h (início da sessão + renovação a cada 6 h de uso contínuo).
-- Sem chave secreta no middleware: o usuário vem de auth.uid() (verificado pelo token da própria sessão); só o IP vem
-- do chamador. Por isso há uma trava de inundação (máx. 2000 registros/hora no total) — quem chamar a função
-- direto com IPs falsos só consegue gerar ruído limitado, nunca apagar nem alterar registro (ninguém tem
-- update/delete). Se isso virar problema, o passo seguinte é gravar com a chave de servidor.
--
-- Leitura só pelo admin (atender pedido judicial: por usuário ou por IP). Retenção: job diário apaga > 6 meses.

create table if not exists public.app_access_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  ip      inet not null,
  user_id uuid,
  area    text not null check (area in ('authenticated', 'public'))
);
create index if not exists app_access_log_at_idx on public.app_access_log (at);
create index if not exists app_access_log_ip_idx on public.app_access_log (ip, at);
create index if not exists app_access_log_user_idx on public.app_access_log (user_id, at) where user_id is not null;
alter table public.app_access_log enable row level security;
revoke all on table public.app_access_log from public, anon, authenticated;

create or replace function public.log_app_access(p_ip text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip  inet;
  v_uid uuid := auth.uid();
begin
  begin
    v_ip := nullif(btrim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;
  if v_ip is null or masklen(v_ip) <> (case when family(v_ip) = 4 then 32 else 128 end) then
    return;
  end if;

  if (select count(*) from public.app_access_log where at > now() - interval '1 hour') >= 2000 then
    return;
  end if;

  if exists (
    select 1 from public.app_access_log
     where ip = v_ip and user_id is not distinct from v_uid and at > now() - interval '6 hours'
  ) then
    return;
  end if;

  insert into public.app_access_log (ip, user_id, area)
  values (v_ip, v_uid, case when v_uid is null then 'public' else 'authenticated' end);
end;
$$;
revoke all on function public.log_app_access(text) from public;
grant execute on function public.log_app_access(text) to anon, authenticated;

create or replace function public.purge_app_access_log()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  delete from public.app_access_log where at < now() - interval '6 months';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_app_access_log() from public, anon, authenticated;

create or replace function public.admin_access_log(
  p_user_id uuid default null,
  p_ip      text default null,
  p_days    integer default 30
)
returns table (at timestamptz, ip text, user_id uuid, area text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert();
  return query
  select l.at, host(l.ip)::text, l.user_id, l.area
    from public.app_access_log l
   where l.at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 190))
     and (p_user_id is null or l.user_id = p_user_id)
     and (p_ip is null or l.ip = p_ip::inet)
   order by l.at desc
   limit 500;
end;
$$;
revoke all on function public.admin_access_log(uuid, text, integer) from public, anon;
grant execute on function public.admin_access_log(uuid, text, integer) to authenticated;

select cron.schedule(
  'kangu_purge_app_access_log',
  '31 3 * * *',
  $cron$select public.purge_app_access_log()$cron$
);
