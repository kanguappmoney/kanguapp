-- Kangu v1 — Rotas 2.0 (rota sugerida, Fatia A): coordenada da escola.
-- A rota otimizada (Fatia B) precisa de lat/lng de CADA ponto. Aluno já tem
-- pickup_lat/lng e dropoff_lat/lng (migration 002); faltava a ESCOLA, que é o
-- ponto-âncora (a ida termina nela, a volta começa nela). school_address já era
-- texto (migration 010); aqui ganha a coordenada.
--
-- Nullable de propósito: coordenada é enriquecimento, NUNCA obrigatória — o
-- cadastro não pode travar se o geocoding falhar (mesmo espírito do 100m). Segue
-- a RLS de students (G5); sem trigger, sem policy nova.
alter table students
  add column school_lat double precision,
  add column school_lng double precision;
