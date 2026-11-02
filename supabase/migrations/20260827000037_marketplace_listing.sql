-- Kangu — Marketplace, Frente D: a ÚNICA porta de leitura pública (anônima) dos
-- motoristas. Uma função SECURITY DEFINER com WHITELIST EXPLÍCITO de colunas — sem
-- `select *` em lugar nenhum da cadeia, e sem policy nova nas tabelas-base (anon
-- continua sem ler driver_profiles/users/vehicles/students por RLS).
--
-- Colunas que SAEM (e só elas): nome do motorista, foto da van, modelo da van, vagas
-- disponíveis (capacidade − alunos ativos, calculado), faixa de preço, telefone (p/
-- WhatsApp), cidades/bairros/escolas, faixa etária e turnos atendidos.
-- NUNCA saem: endereço residencial, e-mail, CNH (document_number), prefixo, placa, cor,
-- id/uuid do motorista como coluna (ele só aparece DENTRO de van_photo_path, porque a
-- policy do bucket exige a pasta = auth.uid() — uuid não é segredo, RLS é a barreira),
-- nem qualquer dado de aluno (só a CONTAGEM entra no cálculo).
-- Mudar o contrato = mudar esta função E o teste docs/tests/marketplace_view.sql.
--
-- Quem aparece: toggle `marketplace_listed` ligado + perfil completo (prefixo, placa,
-- modelo e cor do veículo — o portão da Frente A) + TODOS os campos da Frente C
-- (cidades, bairros, escolas, idade mín/máx, turnos, preço mín/máx, foto da van).
-- Falta qualquer um → não aparece, mesmo com o toggle ligado. "Preenchido" = texto não
-- vazio depois de trim; turnos = ao menos um. O telefone também é exigido (é o único
-- canal de contato exposto; listar sem ele seria um beco sem saída).
create or replace function public.marketplace_listing()
returns table (
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
  service_shifts        student_shift[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    u.full_name,
    dp.van_photo_path,
    v.model,
    greatest(v.capacity - coalesce(a.active_students, 0), 0)::integer,
    dp.price_min_cents,
    dp.price_max_cents,
    u.phone,
    dp.service_cities,
    dp.service_neighborhoods,
    dp.service_schools,
    dp.age_min,
    dp.age_max,
    dp.service_shifts
  from public.driver_profiles dp
  join public.users u on u.id = dp.user_id
  -- Veículo primário (o mesmo critério do app: um por motorista no v1).
  join lateral (
    select vv.model, vv.plate, vv.color, vv.prefix, vv.capacity
      from public.vehicles vv
     where vv.driver_id = dp.user_id
     order by vv.created_at, vv.id
     limit 1
  ) v on true
  -- Só a contagem de alunos ativos — nenhum dado de aluno sai daqui.
  left join lateral (
    select count(*) as active_students
      from public.students s
     where s.driver_id = dp.user_id and s.status = 'active'
  ) a on true
  where dp.marketplace_listed
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
    and nullif(btrim(u.full_name), '') is not null
  order by u.full_name, dp.user_id;
$$;

-- Fechado por padrão; abre só para quem pode chamar a vitrine.
revoke all on function public.marketplace_listing() from public;
grant execute on function public.marketplace_listing() to anon, authenticated;
