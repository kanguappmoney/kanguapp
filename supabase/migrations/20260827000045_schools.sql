-- Kangu — Cobertura guiada, parte 2: escolas de SP (dado de referência, somente leitura).
--
-- Fonte: Censo Escolar da Educação Básica, microdados do INEP (dados abertos) —
--   https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_2024.zip
--   arquivo dados/microdados_ed_basica_2024.csv (MD5 conferido com o md5 publicado pelo INEP).
-- Filtro: SG_UF = 'SP' e TP_SITUACAO_FUNCIONAMENTO = 1 (em atividade). `name` = NO_ENTIDADE (como o
-- INEP publica, em maiúsculas), `inep_code` = CO_ENTIDADE (código INEP da escola), `city_id` =
-- CO_MUNICIPIO (o MESMO código IBGE de `cities.id` — liga sem casar por nome), `dependency` =
-- TP_DEPENDENCIA (1 federal, 2 estadual, 3 municipal, 4 privada), `census_year` = NU_ANO_CENSO.
-- Carga: `scripts/import-schools.ts` (único, fora do caminho de request, idempotente).
--
-- Acesso: leitura para anon e authenticated (dado público do INEP); NENHUMA escrita por API.
-- Nada aqui é dado pessoal (estabelecimentos, não pessoas).

create table if not exists public.schools (
  inep_code   integer  primary key,
  city_id     integer  not null references public.cities (id),
  name        text     not null,
  dependency  smallint check (dependency between 1 and 4),
  census_year smallint not null
);
create index if not exists schools_city_name_idx on public.schools (city_id, name);

alter table public.schools enable row level security;
drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select to anon, authenticated using (true);

revoke all on table public.schools from public, anon, authenticated;
grant select on table public.schools to anon, authenticated;
