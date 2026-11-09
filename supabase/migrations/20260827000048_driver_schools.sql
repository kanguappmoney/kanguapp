-- Kangu — Escolas que o motorista atende (motorista × escola), fonte ÚNICA da cobertura de escolas.
--
-- Liga o motorista às escolas do INEP já importadas (`schools`) por `inep_code` — sem casar por nome.
-- É a lista que restringe o seletor de escola nos formulários (aluno, link de captação, formulário do
-- pai) e que ALIMENTA `driver_profiles.service_schools` (o texto da Frente C que o marketplace lê):
-- a função `set_my_schools` grava as duas coisas na mesma transação, então não divergem.
--
-- Escrita só pela função (SECURITY DEFINER; exige ser motorista; teto de 150 escolas por cidade e
-- 300 no total). A tabela é dono-only para leitura (RLS). `p_extra` guarda nomes digitados à mão
-- (cadastro antigo que não existe no INEP) só no texto, sem linha na tabela.
--
-- `capture_link_schools(token)` é a leitura pública mínima para o formulário do pai (sem login):
-- devolve só os NOMES da lista do dono de um link ativo — as escolas atendidas já são públicas no
-- marketplace. Não altera `get_capture_link` nem `submit_capture`.

create table if not exists public.driver_schools (
  driver_id  uuid        not null references public.driver_profiles (user_id) on delete cascade,
  inep_code  integer     not null references public.schools (inep_code),
  created_at timestamptz not null default now(),
  primary key (driver_id, inep_code)
);
create index if not exists driver_schools_inep_idx on public.driver_schools (inep_code);

alter table public.driver_schools enable row level security;
drop policy if exists driver_schools_owner_read on public.driver_schools;
create policy driver_schools_owner_read on public.driver_schools for select to authenticated
  using (driver_id = auth.uid());
revoke all on table public.driver_schools from public, anon, authenticated;
grant select on table public.driver_schools to authenticated;

create or replace function public.set_my_schools(p_codes integer[], p_extra text[] default '{}')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_codes  integer[];
  v_found  integer;
  v_extra  text[];
  v_names  text[];
  v_text   text;
begin
  if v_uid is null or not exists (select 1 from public.driver_profiles where user_id = v_uid) then
    raise exception 'Apenas motoristas podem definir as escolas atendidas.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct c), '{}') into v_codes from unnest(coalesce(p_codes, '{}')) c;
  select count(*) into v_found from public.schools where inep_code = any (v_codes);
  if v_found <> cardinality(v_codes) then
    raise exception 'Escola inválida.';
  end if;
  if cardinality(v_codes) > 300 then
    raise exception 'Limite de 300 escolas atingido.';
  end if;
  if exists (
    select 1 from public.schools where inep_code = any (v_codes)
    group by city_id having count(*) > 150
  ) then
    raise exception 'Limite de 150 escolas por cidade atingido.';
  end if;

  -- nomes digitados à mão: sem separadores da cobertura, 2–60 caracteres, sem repetição, até 50.
  select coalesce(array_agg(n order by ord), '{}') into v_extra from (
    select distinct on (lower(n)) n, ord from (
      select btrim(regexp_replace(regexp_replace(e, '[,;\r\n]+', ' ', 'g'), '\s+', ' ', 'g')) as n, ord
        from unnest(coalesce(p_extra, '{}')) with ordinality as t(e, ord)
    ) x where char_length(n) between 2 and 60 order by lower(n), ord
  ) y;
  v_extra := v_extra[1:50];

  delete from public.driver_schools where driver_id = v_uid;
  insert into public.driver_schools (driver_id, inep_code)
    select v_uid, c from unnest(v_codes) c;

  -- texto da Frente C: nomes de exibição (alfabéticos, sem repetição) + os digitados à mão.
  select coalesce(array_agg(n order by lower(n)), '{}') into v_names from (
    select distinct on (lower(coalesce(display_name, name))) coalesce(display_name, name) as n
      from public.schools where inep_code = any (v_codes)
     order by lower(coalesce(display_name, name))
  ) z;
  select string_agg(n, ', ' order by ord, lower(n)) into v_text from (
    select n, 1 as ord from unnest(v_names) n
    union all
    select e, 2 from unnest(v_extra) e where lower(e) <> all (select lower(x) from unnest(v_names) x)
  ) a;

  update public.driver_profiles set service_schools = v_text where user_id = v_uid;
  return cardinality(v_codes);
end;
$$;
revoke all on function public.set_my_schools(integer[], text[]) from public, anon;
grant execute on function public.set_my_schools(integer[], text[]) to authenticated;

create or replace function public.capture_link_schools(p_token text)
returns table (name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct coalesce(s.display_name, s.name) as name
    from public.capture_links cl
    join public.driver_schools ds on ds.driver_id = cl.driver_id
    join public.schools s on s.inep_code = ds.inep_code
   where cl.token = p_token and cl.status = 'active'
   order by 1
   limit 300;
$$;
revoke all on function public.capture_link_schools(text) from public;
grant execute on function public.capture_link_schools(text) to anon, authenticated;
