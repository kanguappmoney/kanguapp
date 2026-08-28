-- Kangu v1 — Endereço da escola no cadastro do aluno.
-- Jornada completa: casa (embarque) → escola (deixa de manhã) → volta à tarde
-- (desembarque). Faltava o endereço de onde deixar a criança na escola.

alter table students add column school_address text;
