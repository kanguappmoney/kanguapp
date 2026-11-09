-- Kangu — cobertura: as CIDADES que o dono de um link de captação atende (leitura pública mínima).
--
-- Hierarquia da cobertura: cidade (obrigatória) → bairro e escola (opcionais, cada um independente).
-- Sem escolas configuradas (`driver_schools` vazio), o seletor de escola do formulário do pai busca só nas
-- escolas das cidades que o motorista atende, não em todo o estado. O pai não tem login nem lê o perfil do
-- motorista, então esta função devolve só id/nome das cidades (já públicas no marketplace) de um link ATIVO.
-- Casa `driver_profiles.service_cities` (texto da Frente C) com `cities` sem diferença de maiúsculas, o mesmo
-- critério do filtro de busca. Não altera `get_capture_link` nem `submit_capture`.

create or replace function public.capture_link_cities(p_token text)
returns table (city_id integer, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.name
    from public.capture_links cl
    join public.driver_profiles dp on dp.user_id = cl.driver_id
    join public.cities c on lower(c.name) = any (public.marketplace_tokens(dp.service_cities))
   where cl.token = p_token and cl.status = 'active'
   order by c.name
   limit 50;
$$;
revoke all on function public.capture_link_cities(text) from public;
grant execute on function public.capture_link_cities(text) to anon, authenticated;
