-- Kangu v1 — Sugestão de horário de saída de casa (perna de ida). "Saia até HH:MM
-- para não atrasar o 1º aluno." Informativo, NUNCA bloqueia (espírito 100m/recorrência).

-- Âncora do cálculo: horário-alvo de começar a pegar, por rota. Nullable — sem ele
-- a home simplesmente não sugere (sem dado, sem sugestão; nunca quebra a tela). Não
-- se preenche retroativo nas rotas existentes.
alter table routes add column pickup_target_time time;

-- Cache da sugestão: 1x por rota por dia. Preenchido na 1ª carga da home naquele
-- dia; recargas reusam (evita geocoding + Directions repetidos). NÃO usa
-- route_executions de propósito — a sugestão aparece ANTES de iniciar, quando ainda
-- não existe execução daquela perna.
create table route_departure_suggestions (
  route_id           uuid not null references routes (id) on delete cascade,
  service_date       date not null,
  leave_by           time not null,          -- horário sugerido de saída de casa
  first_student_name text not null,          -- 1º aluno da lista de pickup (no cache)
  duration_seconds   int  not null,          -- duração estimada casa → 1º aluno
  created_at         timestamptz not null default now(),
  primary key (route_id, service_date)
);

-- RLS dono-only (espelha route_exceptions): só o motorista dono da rota lê/grava.
alter table route_departure_suggestions enable row level security;
create policy route_departure_suggestions_all_owner on route_departure_suggestions
  for all using (is_driver_of_route(route_id))
  with check (is_driver_of_route(route_id));
