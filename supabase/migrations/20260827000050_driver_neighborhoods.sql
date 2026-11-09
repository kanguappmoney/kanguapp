-- Kangu — Bairros que o motorista atende (motorista × bairro do pool), fonte ÚNICA da cobertura de bairros.
--
-- Mesmo padrão de `driver_schools` (048): liga o motorista a linhas do pool `neighborhoods` (046) por id e
-- ALIMENTA `driver_profiles.service_neighborhoods` (o texto da Frente C que o marketplace lê) na mesma transação,
-- via `set_my_neighborhoods` (SECURITY DEFINER, exige ser motorista, substitui a lista, teto de 150 bairros por cidade
-- e 300 no total). Leitura da tabela dono-only (RLS); escrita direta negada. `p_extra` guarda nomes digitados à mão que
-- não estão no pool (cadastro antigo) só no texto, sem linha na tabela.
--
-- Regra de cobertura: cidade obrigatória → bairro e escola opcionais e independentes (lista vazia = todos dentro das
-- cidades do motorista; marcada = restringe ao marcado). Esta migration só cria o armazenamento; o marketplace público
-- passa a respeitar "vazio = todos" na fatia seguinte.

create table if not exists public.driver_neighborhoods (
  driver_id       uuid        not null references public.driver_profiles (user_id) on delete cascade,
  neighborhood_id bigint      not null references public.neighborhoods (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (driver_id, neighborhood_id)
);
create index if not exists driver_neighborhoods_nb_idx on public.driver_neighborhoods (neighborhood_id);

alter table public.driver_neighborhoods enable row level security;
drop policy if exists driver_neighborhoods_owner_read on public.driver_neighborhoods;
create policy driver_neighborhoods_owner_read on public.driver_neighborhoods for select to authenticated
  using (driver_id = auth.uid());
revoke all on table public.driver_neighborhoods from public, anon, authenticated;
grant select on table public.driver_neighborhoods to authenticated;

create or replace function public.set_my_neighborhoods(p_ids bigint[], p_extra text[] default '{}')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_ids    bigint[];
  v_found  integer;
  v_extra  text[];
  v_names  text[];
  v_text   text;
begin
  if v_uid is null or not exists (select 1 from public.driver_profiles where user_id = v_uid) then
    raise exception 'Apenas motoristas podem definir os bairros atendidos.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct i), '{}') into v_ids from unnest(coalesce(p_ids, '{}')) i;
  select count(*) into v_found from public.neighborhoods where id = any (v_ids);
  if v_found <> cardinality(v_ids) then
    raise exception 'Bairro inválido.';
  end if;
  if cardinality(v_ids) > 300 then
    raise exception 'Limite de 300 bairros atingido.';
  end if;
  if exists (
    select 1 from public.neighborhoods where id = any (v_ids)
    group by city_id having count(*) > 150
  ) then
    raise exception 'Limite de 150 bairros por cidade atingido.';
  end if;

  select coalesce(array_agg(n order by ord), '{}') into v_extra from (
    select distinct on (lower(n)) n, ord from (
      select btrim(regexp_replace(regexp_replace(e, '[,;\r\n]+', ' ', 'g'), '\s+', ' ', 'g')) as n, ord
        from unnest(coalesce(p_extra, '{}')) with ordinality as t(e, ord)
    ) x where char_length(n) between 2 and 60 order by lower(n), ord
  ) y;
  v_extra := v_extra[1:50];

  delete from public.driver_neighborhoods where driver_id = v_uid;
  insert into public.driver_neighborhoods (driver_id, neighborhood_id)
    select v_uid, i from unnest(v_ids) i;

  select coalesce(array_agg(n order by lower(n)), '{}') into v_names from (
    select distinct on (lower(name)) name as n
      from public.neighborhoods where id = any (v_ids)
     order by lower(name)
  ) z;
  select string_agg(n, ', ' order by ord, lower(n)) into v_text from (
    select n, 1 as ord from unnest(v_names) n
    union all
    select e, 2 from unnest(v_extra) e where lower(e) <> all (select lower(x) from unnest(v_names) x)
  ) a;

  update public.driver_profiles set service_neighborhoods = v_text where user_id = v_uid;
  return cardinality(v_ids);
end;
$$;
revoke all on function public.set_my_neighborhoods(bigint[], text[]) from public, anon;
grant execute on function public.set_my_neighborhoods(bigint[], text[]) to authenticated;
