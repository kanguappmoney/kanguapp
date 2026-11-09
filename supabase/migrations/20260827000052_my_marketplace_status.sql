-- Kangu — status REAL de visibilidade na vitrine, para o próprio motorista.
--
-- A tela de Configurações dizia "Aparecendo" olhando só o toggle (`marketplace_listed`), enquanto a vitrine usa a
-- regra única `marketplace_visible` (assinatura em dia, veículo completo, cidade, idades, turnos, preço, foto da van,
-- telefone e nome). `my_marketplace_status()` devolve, só para o dono (motorista), `visible` — calculado pela MESMA
-- `marketplace_visible`, então nunca diverge — e `missing`: os códigos do que está faltando (toggle, assinatura,
-- veiculo, cidades, idades, turnos, preco, foto, telefone, nome) para a tela dizer o que fazer. Não expõe nada de
-- outro motorista; anon e responsável são recusados.

create or replace function public.my_marketplace_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  dp     record;
  u      record;
  v      record;
  v_has  boolean;
  m      text[] := '{}';
begin
  if v_uid is null or not exists (select 1 from public.driver_profiles where user_id = v_uid) then
    raise exception 'Apenas motoristas têm status de vitrine.' using errcode = '42501';
  end if;

  select * into dp from public.driver_profiles where user_id = v_uid;
  select full_name, phone into u from public.users where id = v_uid;
  select vv.prefix, vv.plate, vv.model, vv.color into v
    from public.vehicles vv where vv.driver_id = v_uid order by vv.created_at, vv.id limit 1;
  v_has := found;

  if not dp.marketplace_listed then m := array_append(m, 'toggle'); end if;
  if dp.subscription_status not in ('active', 'trial') then m := array_append(m, 'assinatura'); end if;
  if not v_has or nullif(btrim(v.prefix), '') is null or nullif(btrim(v.plate), '') is null
     or nullif(btrim(v.model), '') is null or nullif(btrim(v.color), '') is null then m := array_append(m, 'veiculo'); end if;
  if nullif(btrim(dp.service_cities), '') is null then m := array_append(m, 'cidades'); end if;
  if dp.age_min is null or dp.age_max is null then m := array_append(m, 'idades'); end if;
  if cardinality(dp.service_shifts) = 0 then m := array_append(m, 'turnos'); end if;
  if dp.price_min_cents is null or dp.price_max_cents is null then m := array_append(m, 'preco'); end if;
  if nullif(btrim(dp.van_photo_path), '') is null then m := array_append(m, 'foto'); end if;
  if nullif(btrim(u.phone), '') is null then m := array_append(m, 'telefone'); end if;
  if nullif(btrim(u.full_name), '') is null then m := array_append(m, 'nome'); end if;

  return jsonb_build_object(
    'listed',  dp.marketplace_listed,
    'visible', exists (select 1 from public.marketplace_visible() mv where mv.user_id = v_uid),
    'missing', to_jsonb(m)
  );
end;
$$;
revoke all on function public.my_marketplace_status() from public, anon;
grant execute on function public.my_marketplace_status() to authenticated;
