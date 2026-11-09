-- Kangu — Marketplace: regra de cobertura cidade → bairro → escola (ajuste das Frentes D/E).
--
-- Cidade atendida é OBRIGATÓRIA; bairro e escola são OPCIONAIS e independentes: lista vazia = "todos dentro das
-- cidades do motorista"; lista marcada = restringe só ao marcado. Mudanças:
--   * `marketplace_visible`: deixa de exigir bairros E escolas preenchidos — visibilidade exige só cidade (+ os
--     demais requisitos de sempre). Tudo que usa a regra única (listagem, admin) acompanha.
--   * `marketplace_listing`: o filtro de bairro/escola casa quando a lista do motorista está VAZIA e o bairro/
--     escola pertence a uma cidade dele (e à cidade do filtro, se houver); com lista, casa o marcado (escola: pelo
--     nome de exibição OU o oficial do INEP).
--   * `marketplace_filter_options(p_city)`: dropdowns CITY-FIRST. Sem cidade: só as cidades de motoristas visíveis.
--     Com cidade: os bairros dessa cidade (pool + os marcados pelos motoristas dela) que ao menos um motorista
--     atende, com a contagem.
--   * `marketplace_school_options(p_city, p_q)` (nova): busca de escola na cidade escolhida (até 20), com a
--     contagem de motoristas que a atendem — as escolas são milhares, não cabem num dropdown.
-- Contrato de colunas de `marketplace_listing` inalterado. Funções internas seguem sem execute para anon.

create index if not exists schools_display_lower_idx on public.schools (lower(display_name));
create index if not exists neighborhoods_name_lower_idx on public.neighborhoods (lower(name));

-- Regra única de visibilidade (interna).
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
    -- Frente C: campos públicos preenchidos. Cidade é OBRIGATÓRIA; bairro e escola são opcionais (vazio = todos
    -- dentro das cidades do motorista).
    and nullif(btrim(dp.service_cities), '')        is not null
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

-- Vitrine com a regra cidade → bairro → escola.
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
  request_token         text,
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
    -- Telefone e token só no modo perfil (um motorista por vez).
    case when p_public_id is not null then v.phone end,
    v.service_cities,
    v.service_neighborhoods,
    v.service_schools,
    v.age_min,
    v.age_max,
    v.service_shifts,
    case when p_public_id is not null then (
      select cl.token
        from public.capture_links cl
       where cl.driver_id = v.user_id and cl.kind = 'generic' and cl.status = 'active'
       limit 1
    ) end,
    count(*) over ()
  from public.marketplace_visible() v
  where (p_public_id is null or v.public_id = p_public_id)
    and (nullif(btrim(p_city), '') is null
         or public.marketplace_tokens(v.service_cities) @> array[lower(btrim(p_city))])
    -- Bairro: lista marcada restringe ao marcado; lista VAZIA = qualquer bairro das cidades do motorista
    -- (o bairro precisa existir no pool de uma cidade dele — e na cidade do filtro, se houver).
    and (nullif(btrim(p_neighborhood), '') is null
         or case
              when cardinality(public.marketplace_tokens(v.service_neighborhoods)) > 0
                then public.marketplace_tokens(v.service_neighborhoods) @> array[lower(btrim(p_neighborhood))]
              else exists (
                select 1
                  from public.neighborhoods n
                  join public.cities c on c.id = n.city_id
                 where lower(n.name) = lower(btrim(p_neighborhood))
                   and lower(c.name) = any (public.marketplace_tokens(v.service_cities))
                   and (nullif(btrim(p_city), '') is null or lower(c.name) = lower(btrim(p_city)))
              )
            end)
    -- Escola: idem. Casa o nome de exibição e o oficial do INEP (cadastros antigos guardam o oficial).
    and (nullif(btrim(p_school), '') is null
         or case
              when cardinality(public.marketplace_tokens(v.service_schools)) > 0
                then public.marketplace_tokens(v.service_schools) && (
                       array[lower(btrim(p_school))]
                       || array(select lower(s.name) from public.schools s where lower(s.display_name) = lower(btrim(p_school))))
              else exists (
                select 1
                  from public.schools s
                  join public.cities c on c.id = s.city_id
                 where (lower(s.display_name) = lower(btrim(p_school)) or lower(s.name) = lower(btrim(p_school)))
                   and lower(c.name) = any (public.marketplace_tokens(v.service_cities))
                   and (nullif(btrim(p_city), '') is null or lower(c.name) = lower(btrim(p_city)))
              )
            end)
    and (p_child_age is null or p_child_age between v.age_min and v.age_max)
    and (p_shift is null or p_shift = any (v.service_shifts))
  order by v.driver_name, v.public_id
  limit  least(greatest(coalesce(p_limit, 12), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Opções dos filtros (city-first). A assinatura antiga (sem argumentos) sai.
drop function if exists public.marketplace_filter_options();

create or replace function public.marketplace_filter_options(p_city text default null)
returns table (kind text, value text, driver_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with city_tok as (
    select v.user_id, btrim(t) as val
      from public.marketplace_visible() v,
           unnest(regexp_split_to_array(v.service_cities, '[,;' || chr(10) || ']+')) as t
     where btrim(t) <> ''
  ),
  city_opts as (
    select 'city'::text as kind, (array_agg(val order by val))[1] as value, count(distinct user_id)::integer as driver_count
      from city_tok group by lower(val)
  ),
  d as (  -- motoristas visíveis que atendem a cidade escolhida
    select v.user_id, public.marketplace_tokens(v.service_neighborhoods) as nb, v.service_neighborhoods
      from public.marketplace_visible() v
     where nullif(btrim(p_city), '') is not null
       and public.marketplace_tokens(v.service_cities) @> array[lower(btrim(p_city))]
  ),
  nb_cand as (
    select n.name as val, 0 as pri
      from public.neighborhoods n
      join public.cities c on c.id = n.city_id
     where nullif(btrim(p_city), '') is not null and lower(c.name) = lower(btrim(p_city))
       and exists (select 1 from d)
    union all
    select btrim(t), 1
      from d, unnest(regexp_split_to_array(coalesce(d.service_neighborhoods, ''), '[,;' || chr(10) || ']+')) as t
     where btrim(t) <> ''
  ),
  nb_grp as (
    select lower(c.val) as k, (array_agg(c.val order by c.pri, c.val))[1] as value
      from nb_cand c group by lower(c.val)
  ),
  nb_opts as (
    select 'neighborhood'::text as kind, g.value,
           (select count(*) from d where cardinality(d.nb) = 0 or g.k = any (d.nb))::integer as driver_count
      from nb_grp g
  )
  select kind, value, driver_count from city_opts
  union all
  select kind, value, driver_count from nb_opts where driver_count > 0
  order by 1, 2;
$$;

-- Busca de escola na cidade escolhida (typeahead do filtro público).
create or replace function public.marketplace_school_options(p_city text, p_q text default null)
returns table (value text, driver_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with d as (
    select v.user_id, public.marketplace_tokens(v.service_schools) as sc, v.service_schools
      from public.marketplace_visible() v
     where nullif(btrim(p_city), '') is not null
       and public.marketplace_tokens(v.service_cities) @> array[lower(btrim(p_city))]
  ),
  q as (select regexp_replace(lower(coalesce(p_q, '')), '[%_\\]', ' ', 'g') as qt),
  cand as (
    -- escolas da cidade que casam com a busca (só com ≥ 3 letras)
    select coalesce(s.display_name, s.name) as val, 0 as pri, lower(s.name) as official
      from public.schools s
      join public.cities c on c.id = s.city_id, q
     where exists (select 1 from d)
       and lower(c.name) = lower(btrim(p_city))
       and char_length(btrim(q.qt)) >= 3
       and (lower(s.display_name) like '%' || btrim(q.qt) || '%' or lower(s.name) like '%' || btrim(q.qt) || '%')
    union all
    -- escolas marcadas explicitamente por motoristas da cidade (casam com a busca, ou todas se a busca é curta)
    select btrim(x.tok), 1, null
      from d, q, unnest(regexp_split_to_array(coalesce(d.service_schools, ''), '[,;' || chr(10) || ']+')) as x(tok)
     where btrim(x.tok) <> ''
       and (char_length(btrim(q.qt)) < 3 or lower(btrim(x.tok)) like '%' || btrim(q.qt) || '%')
  ),
  agg as (
    select (array_agg(val order by pri, val))[1] as value, lower(val) as k, min(official) as official
      from cand group by lower(val)
  )
  select a.value,
         (select count(*) from d
           where cardinality(d.sc) = 0
              or lower(a.value) = any (d.sc)
              or (a.official is not null and a.official = any (d.sc)))::integer as driver_count
    from agg a
   order by 2 desc, 1
   limit 20;
$$;

revoke all on function public.marketplace_filter_options(text) from public;
grant execute on function public.marketplace_filter_options(text) to anon, authenticated;
revoke all on function public.marketplace_school_options(text, text) from public;
grant execute on function public.marketplace_school_options(text, text) to anon, authenticated;
