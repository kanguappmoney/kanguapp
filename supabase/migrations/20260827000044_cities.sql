-- Kangu — Cobertura guiada, parte 1: cidades de SP (dado de referência, somente leitura).
--
-- Fonte: API de localidades do IBGE —
--   https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios
-- (645 municípios). `id` = código IBGE do município (7 dígitos) — o MESMO código que o INEP usa
-- em CO_MUNICIPIO, o que permite ligar as escolas (parte 2) sem casar por nome. Estado fixo 'SP'
-- (check). Carga: `scripts/import-cities.ts` (único, fora do caminho de request, idempotente).
--
-- Acesso: leitura para anon e authenticated (dado público do IBGE); NENHUMA escrita por API
-- (sem policy de insert/update/delete + revoke) — só o script, com a chave secreta.

create table if not exists public.cities (
  id    integer  primary key,
  name  text     not null,
  state char(2)  not null default 'SP' check (state = 'SP')
);
create unique index if not exists cities_name_lower_key on public.cities (lower(name));

alter table public.cities enable row level security;
drop policy if exists cities_read on public.cities;
create policy cities_read on public.cities for select to anon, authenticated using (true);

revoke all on table public.cities from public, anon, authenticated;
grant select on table public.cities to anon, authenticated;
