-- Kangu v1 — LGPD, retenção do GPS: a posição da van só existe enquanto a rota está em andamento.
--
-- Antes: `live_positions` é upsert (uma linha por execução) e NUNCA era apagada — o pai deixava de ver (regra de
-- acesso), mas a última posição ficava gravada no banco para sempre.
-- Agora, em duas camadas:
--   1. gatilho: quando a execução deixa de estar 'in_progress' (encerrada, reaberta, qualquer saída), a posição dela
--      é apagada no mesmo instante — vale para qualquer caminho que mude o status, não só o botão do app;
--   2. rede de segurança: job a cada 15 min apaga qualquer posição parada há mais de 24 h (ex.: rota esquecida
--      "em andamento", app fechado no meio da viagem).
-- Mais uma limpeza única do que já estava retido.

create or replace function public.purge_live_position_on_stop()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.live_positions where execution_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_purge_live_position on public.route_executions;
create trigger trg_purge_live_position
  after update of status on public.route_executions
  for each row
  when (old.status = 'in_progress' and new.status is distinct from 'in_progress')
  execute function public.purge_live_position_on_stop();

create or replace function public.cleanup_stale_live_positions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  delete from public.live_positions where updated_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.cleanup_stale_live_positions() from public, anon, authenticated;
revoke all on function public.purge_live_position_on_stop() from public, anon, authenticated;

-- Limpeza única: posição de execução que não está em andamento não deveria existir.
delete from public.live_positions lp
 using public.route_executions e
 where e.id = lp.execution_id and e.status <> 'in_progress';

select cron.schedule(
  'kangu_cleanup_live_positions',
  '*/15 * * * *',
  $cron$select public.cleanup_stale_live_positions()$cron$
);
