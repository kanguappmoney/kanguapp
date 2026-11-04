-- Kangu — Cobertura guiada, parte 3: POOL de bairros por cidade, que CRESCE com o uso.
--
-- Não existe lista oficial de bairros (o IBGE só tem município/distrito), então o pool nasce do
-- que já está no banco e cresce quando um motorista usa "+ adicionar bairro". Semente: bairros dos
-- motoristas que cobrem UMA cidade só (aí a cidade é inequívoca); os demais ficam de fora porque
-- o dado antigo é uma lista plana (não diz qual bairro é de qual cidade). Hoje a semente é vazia.
--
-- O pool é COMPARTILHADO entre motoristas (leitura para authenticated), então a escrita é
-- controlada: só a função `add_neighborhood` (SECURITY DEFINER) insere — exige ser MOTORISTA,
-- normaliza o nome (sem vírgula/ponto-e-vírgula/quebra de linha, que são os separadores da
-- cobertura salva em texto), 2–60 caracteres, deduplica sem diferença de maiúsculas na mesma
-- cidade e limita 300 bairros criados por motorista (freio de spam). Nenhuma escrita direta por
-- API. `created_by` registra quem criou (moderação futura); some se o usuário for apagado.

create table if not exists public.neighborhoods (
  id         bigint generated always as identity primary key,
  city_id    integer     not null references public.cities (id),
  name       text        not null check (char_length(name) between 2 and 60 and name !~ '[,;\r\n]'),
  created_by uuid        references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists neighborhoods_city_name_key
  on public.neighborhoods (city_id, lower(name));

alter table public.neighborhoods enable row level security;
drop policy if exists neighborhoods_read on public.neighborhoods;
create policy neighborhoods_read on public.neighborhoods for select to authenticated using (true);
revoke all on table public.neighborhoods from public, anon, authenticated;
grant select on table public.neighborhoods to authenticated;

-- Semente (idempotente): bairros de motoristas com UMA cidade só, casada com `cities` por nome.
insert into public.neighborhoods (city_id, name, created_by)
select distinct on (c.id, lower(btrim(t.n))) c.id, btrim(t.n), dp.user_id
  from public.driver_profiles dp
  join public.cities c
    on lower(c.name) = (public.marketplace_tokens(dp.service_cities))[1]
  cross join lateral unnest(regexp_split_to_array(dp.service_neighborhoods, '[,;' || chr(10) || ']+')) as t(n)
 where cardinality(public.marketplace_tokens(dp.service_cities)) = 1
   and char_length(btrim(t.n)) between 2 and 60
on conflict do nothing;

create or replace function public.add_neighborhood(p_city_id integer, p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_out  text;
begin
  if v_uid is null or not exists (select 1 from public.driver_profiles where user_id = v_uid) then
    raise exception 'Apenas motoristas podem adicionar bairros.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cities where id = p_city_id) then
    raise exception 'Cidade inválida.';
  end if;

  -- separadores da cobertura salva viram espaço; espaços repetidos colapsam.
  v_name := btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[,;\r\n]+', ' ', 'g'), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'O nome do bairro deve ter de 2 a 60 caracteres.';
  end if;

  -- Já existe (sem diferença de maiúsculas)? devolve o nome canônico, sem criar nada.
  select n.name into v_out from public.neighborhoods n
   where n.city_id = p_city_id and lower(n.name) = lower(v_name);
  if v_out is not null then
    return v_out;
  end if;

  if (select count(*) from public.neighborhoods where created_by = v_uid) >= 300 then
    raise exception 'Limite de bairros adicionados atingido.';
  end if;

  insert into public.neighborhoods (city_id, name, created_by)
  values (p_city_id, v_name, v_uid)
  on conflict (city_id, lower(name)) do nothing;

  select n.name into v_out from public.neighborhoods n
   where n.city_id = p_city_id and lower(n.name) = lower(v_name);
  return v_out;
end;
$$;

revoke all on function public.add_neighborhood(integer, text) from public, anon;
grant execute on function public.add_neighborhood(integer, text) to authenticated;
