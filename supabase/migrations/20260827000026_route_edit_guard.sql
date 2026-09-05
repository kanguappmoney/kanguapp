-- Kangu v1 — Rotas 2.0 (editar rota): guarda G2 no banco.
-- "Nada é removido no meio de uma execução em andamento." Editar uma rota
-- reescreve suas paradas (delete + reinsert). Se uma perna está rodando HOJE
-- (route_execution in_progress), reescrever route_stops mudaria a jornada VIVA
-- que o get_active_journey lê em tempo real — exatamente o que a G2 proíbe.
--
-- Impõe no banco (à prova de bypass), não só na server action: qualquer
-- insert/update/delete em route_stops de uma rota com execução in_progress hoje
-- é recusado. A criação normal passa (no momento de criar não há execução), e a
-- edição de uma rota PARADA passa. Nada no fluxo de execução escreve route_stops
-- (o drive grava route_events, não paradas), então a guarda não atrapalha a rota
-- rodando — só protege o conjunto de paradas de ser mexido embaixo dela.

create or replace function enforce_route_stops_frozen_while_running()
returns trigger
language plpgsql
as $$
declare
  v_route_id uuid := coalesce(new.route_id, old.route_id);
  v_running  int;
begin
  select count(*) into v_running
  from route_executions
  where route_id = v_route_id
    and service_date = current_date
    and status = 'in_progress';

  if v_running > 0 then
    raise exception 'G2: rota com perna em andamento hoje não pode ter as paradas editadas'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_route_stops_frozen on route_stops;
create trigger trg_route_stops_frozen
  before insert or update or delete on route_stops
  for each row execute function enforce_route_stops_frozen_while_running();
