-- Kangu — Cobertura guiada: nome de exibição das escolas.
--
-- O INEP entrega "ADELAIDE ESCOBAR BUENO PROFESSORA" (maiúsculas, sem acento, título/tipo no fim).
-- `display_name` guarda a forma legível ("Professora Adelaide Escobar Bueno"), calculada por
-- `src/lib/school-name.ts` e gravada por script (scripts/import-schools.ts e
-- scripts/backfill-school-display-names.ts). `name` (oficial) NÃO muda: é a chave de reimportação e
-- continua valendo na busca/casamento de cadastros antigos. Nullable até o backfill; o app usa
-- coalesce(display_name, name).

alter table public.schools add column if not exists display_name text;
alter table public.schools drop constraint if exists schools_display_name_nonblank;
alter table public.schools add constraint schools_display_name_nonblank
  check (display_name is null or (char_length(btrim(display_name)) > 0 and display_name !~ '[,;\r\n]'));
