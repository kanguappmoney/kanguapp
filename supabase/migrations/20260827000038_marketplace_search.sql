-- Kangu — Marketplace, Frente E (parte 1): a vitrine ganha filtros, paginação e um
-- requisito novo de visibilidade, TUDO dentro do banco — o cliente nunca recebe a lista
-- inteira para filtrar depois.
--
-- O que muda em relação à 037:
--   * `marketplace_listing()` (sem argumentos) é SUBSTITUÍDA por uma versão com filtros
--     (cidade, bairro, escola, idade do filho, turno), paginação (limit/offset, teto 50) e
--     busca de UM motorista por `public_id` (o perfil público).
--   * Requisito novo: `subscription_status` ∈ ('active','trial'). O enum só tem
--     active/trial/paused — 'canceled' não existe; o `in (...)` já o exclui se um dia entrar.
--   * `public_id`: identificador OPACO e estável do motorista na vitrine (uuid aleatório,
--     sem relação com o user id) — é o que vai na URL do perfil público.
--   * O telefone só sai no modo PERFIL (com `p_public_id`); na listagem vem nulo. Reduz a
--     colheita em massa: para pegar N telefones são N chamadas, não uma.
--   * `marketplace_filter_options()`: as listas de cidades/bairros/escolas dos filtros,
--     derivadas SÓ de motoristas visíveis. Os campos são texto livre (decisão da R11, sem
--     normalizar): cada item = um trecho separado por vírgula/ponto-e-vírgula/quebra de
--     linha; casamento sem diferença de maiúsculas (acento conta: "Mauá" ≠ "Maua").
--
-- A regra de visibilidade mora em UM lugar só (`marketplace_visible`, interna — anon NÃO
-- executa); listagem e opções chamam ela. Contrato de colunas públicas = a função
-- `marketplace_listing` + o teste docs/tests/marketplace_view.sql.

alter table driver_profiles
  add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists driver_profiles_public_id_key
  on driver_profiles (public_id);

-- Trechos de um campo de texto livre: minúsculas, sem espaços nas pontas, sem vazios.
create or replace function public.marketplace_tokens(p_text text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    array(
      select distinct lower(btrim(t))
        from unnest(regexp_split_to_array(coalesce(p_text, ''), '[,;' || chr(10) || ']+')) as t
       where btrim(t) <> ''
    ),
    '{}'::text[]
  );
$$;

-- Regra única de visibilidade (INTERNA). Colunas explícitas — nada de `select *`.
create or replace function public.marketplace_visible()
returns table (
  user_id               uuid,
  public_id             uuid,
  driver_name           text,
  phone                 text,
  van_photo_path        text,
  van_model             text,
  capacity              integer,
  active_students       bigint,
  price_min_cents       integer,
  price_max_cents       integer,
  service_cities        text,
  service_neighborhoods text,
  service_schools       text,
  age_min               smallint,
  age_max               smallint,
  service_shifts        student_shift[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    dp.user_id,
    dp.public_id,
    u.full_name,
    u.phone,
    dp.van_photo_path,
    v.model,
    v.capacity,
    coalesce(a.active_students, 0),
    dp.price_min_cents,
    dp.price_max_cents,
    dp.service_cities,
    dp.service_neighborhoods,
    dp.service_schools,
    dp.age_min,
    dp.age_max,
    dp.service_shifts
  from public.driver_profiles dp
  join public.users u on u.id = dp.user_id
  join lateral (
    select vv.model, vv.plate, vv.color, vv.prefix, vv.capacity
      from public.vehicles vv
     where vv.driver_id = dp.user_id
     order by vv.created_at, vv.id
     limit 1
  ) v on true
  left join lateral (
    select count(*) as active_students
      from public.students s
     where s.driver_id = dp.user_id and s.status = 'active'
  ) a on true
  where dp.marketplace_listed
    -- Assinatura em dia (nunca pausada).
    and dp.subscription_status in ('active', 'trial')
    -- Frente A: perfil completo.
    and nullif(btrim(v.prefix), '') is not null
    and nullif(btrim(v.plate), '')  is not null
    and nullif(btrim(v.model), '')  is not null
    and nullif(btrim(v.color), '')  is not null
    -- Frente C: todos os campos públicos preenchidos.
    and nullif(btrim(dp.service_cities), '')        is not null
    and nullif(btrim(dp.service_neighborhoods), '') is not null
    and nullif(btrim(dp.service_schools), '')       is not null
    and dp.age_min is not null
    and dp.age_max is not null
    and cardinality(dp.service_shifts) > 0
    and dp.price_min_cents is not null
    and dp.price_max_cents is not null
    and nullif(btrim(dp.van_photo_path), '') is not null
    -- Contato e identificação exibidos.
    and nullif(btrim(u.phone), '')     is not null
    and nullif(btrim(u.full_name), '') is not null;
$$;

-- A 037 (sem argumentos) sai: um único ponto de entrada público.
drop function if exists public.marketplace_listing();

create or replace function public.marketplace_listing(
  p_city          text          default null,
  p_neighborhood  text          default null,
  p_school        text          default null,
  p_child_age     integer       default null,
  p_shift         student_shift default null,
  p_limit         integer       default 12,
  p_offset        integer       default 0,
  p_public_id     uuid          default null
)
returns table (
  public_id             uuid,
  driver_name           text,
  van_photo_path        text,
  van_model             text,
  spots_available       integer,
  price_min_cents       integer,
  price_max_cents       integer,
  phone                 text,
  service_cities        text,
  service_neighborhoods text,
  service_schools       text,
  age_min               smallint,
  age_max               smallint,
  service_shifts        student_shift[],
  total_count           bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v.public_id,
    v.driver_name,
    v.van_photo_path,
    v.van_model,
    greatest(v.capacity - v.active_students, 0)::integer,
    v.price_min_cents,
    v.price_max_cents,
    -- Telefone só no modo perfil (um motorista por vez).
    case when p_public_id is not null then v.phone end,
    v.service_cities,
    v.service_neighborhoods,
    v.service_schools,
    v.age_min,
    v.age_max,
    v.service_shifts,
    count(*) over ()
  from public.marketplace_visible() v
  where (p_public_id is null or v.public_id = p_public_id)
    and (nullif(btrim(p_city), '') is null
         or public.marketplace_tokens(v.service_cities) @> array[lower(btrim(p_city))])
    and (nullif(btrim(p_neighborhood), '') is null
         or public.marketplace_tokens(v.service_neighborhoods) @> array[lower(btrim(p_neighborhood))])
    and (nullif(btrim(p_school), '') is null
         or public.marketplace_tokens(v.service_schools) @> array[lower(btrim(p_school))])
    and (p_child_age is null or p_child_age between v.age_min and v.age_max)
    and (p_shift is null or p_shift = any (v.service_shifts))
  order by v.driver_name, v.public_id
  limit  least(greatest(coalesce(p_limit, 12), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Opções dos filtros: só o que existe em motoristas VISÍVEIS (+ quantos).
create or replace function public.marketplace_filter_options()
returns table (kind text, value text, driver_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with toks as (
    select v.user_id, 'city'::text as kind, btrim(t) as val
      from public.marketplace_visible() v,
           unnest(regexp_split_to_array(v.service_cities, '[,;' || chr(10) || ']+')) as t
     where btrim(t) <> ''
    union all
    select v.user_id, 'neighborhood', btrim(t)
      from public.marketplace_visible() v,
           unnest(regexp_split_to_array(v.service_neighborhoods, '[,;' || chr(10) || ']+')) as t
     where btrim(t) <> ''
    union all
    select v.user_id, 'school', btrim(t)
      from public.marketplace_visible() v,
           unnest(regexp_split_to_array(v.service_schools, '[,;' || chr(10) || ']+')) as t
     where btrim(t) <> ''
  )
  select kind,
         (array_agg(val order by val))[1],
         count(distinct user_id)::integer
    from toks
   group by kind, lower(val)
   order by kind, 2;
$$;

-- Internas: ninguém de fora executa (os defaults do Supabase concedem a anon/authenticated).
revoke all on function public.marketplace_tokens(text)  from public, anon, authenticated;
revoke all on function public.marketplace_visible()     from public, anon, authenticated;

-- Públicas: a vitrine e as opções dos filtros.
revoke all on function public.marketplace_listing(text, text, text, integer, student_shift, integer, integer, uuid) from public;
grant execute on function public.marketplace_listing(text, text, text, integer, student_shift, integer, integer, uuid) to anon, authenticated;
revoke all on function public.marketplace_filter_options() from public;
grant execute on function public.marketplace_filter_options() to anon, authenticated;
