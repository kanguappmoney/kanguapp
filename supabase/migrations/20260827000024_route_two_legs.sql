-- Kangu v1 — Rotas 2.0 (criação encorpada): duas listas por rota.
-- A ida (kind='pickup') e a volta (kind='dropoff') passam a ter ordenação
-- independente na MESMA rota. Antes o unique era (route_id, position) — o que
-- forçava posições globais e impedia duas listas. Agora é por perna.
-- kind continua sendo o "trajeto": pickup=ida, dropoff=volta (sem coluna nova).

alter table route_stops
  drop constraint if exists route_stops_route_id_position_key;

alter table route_stops
  add constraint route_stops_route_id_kind_position_key
  unique (route_id, kind, position);

-- Turno da rota: âncora do filtro de candidatos no builder (um aluno da tarde não
-- aparece numa rota da manhã; integral aparece em qualquer). Nullable: rotas
-- antigas de uma perna não têm turno definido.
alter table routes add column shift student_shift;
