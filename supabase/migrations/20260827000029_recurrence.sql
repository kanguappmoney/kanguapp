-- Kangu v1 — Rotas 2.0 (recorrência): que dias uma rota roda + exceções.
-- Modelo LEVE/computado (decisão travada): nada de cron/pré-geração. A regra vive
-- em routes.weekdays (dias da semana), os desvios em route_exceptions (esparsa), e
-- route_runs_on(route, date) junta os dois na leitura. A execução segue nascendo
-- no "iniciar" — combina com a postura manual-primeiro do piloto.
--
-- Princípio (herdado do 100m): recorrência decide o que é MOSTRADO/agendado,
-- NUNCA bloqueia execução. Não há trigger/constraint que recuse iniciar uma rota
-- num dia fora da agenda — o motorista sempre pode rodar um dia extra.

-- Dias da semana em ISO dow: 1=Seg … 7=Dom (extract(isodow)). Por rota (ida e
-- volta compartilham). Backfill das rotas existentes = Seg–Sex (transporte
-- escolar). check: só valores 1..7 (array vazio é válido = só roda em 'extra').
alter table routes
  add column weekdays smallint[] not null default '{1,2,3,4,5}'
  check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]);

-- Exceções esparsas: só os dias que fogem da regra. skip = feriado/recesso
-- (não roda num dia que rodaria); extra = reposição (roda num dia que não
-- rodaria). Um dia é skip OU extra, nunca os dois (unique route_id,date).
create type route_exception_kind as enum ('skip', 'extra');

create table route_exceptions (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references routes (id) on delete cascade,
  date        date not null,
  kind        route_exception_kind not null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (route_id, date)
);
create index route_exceptions_route_idx on route_exceptions (route_id);

-- RLS: motorista dono gerencia (espelha route_stops). O pai não precisa da agenda.
alter table route_exceptions enable row level security;
create policy route_exceptions_all_owner on route_exceptions
  for all using (is_driver_of_route(route_id))
  with check (is_driver_of_route(route_id));

-- "A rota roda no dia D?" — a pergunta da home e da /rotas. Exceção manda sobre a
-- regra: 'extra' força rodar, 'skip' força não rodar; sem exceção, cai no dow.
-- STABLE + invoker: a RLS de routes/route_exceptions já recorta ao dono.
create or replace function route_runs_on(p_route_id uuid, p_date date)
returns boolean
language sql
stable
as $$
  select case
    when exists (
      select 1 from route_exceptions e
      where e.route_id = p_route_id and e.date = p_date and e.kind = 'extra'
    ) then true
    when exists (
      select 1 from route_exceptions e
      where e.route_id = p_route_id and e.date = p_date and e.kind = 'skip'
    ) then false
    else exists (
      select 1 from routes r
      where r.id = p_route_id
        and extract(isodow from p_date)::smallint = any (r.weekdays)
    )
  end
$$;
