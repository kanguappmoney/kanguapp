-- Kangu v1 — Rotas 2.0 (editar rota): correção forward-only da guarda G2.
-- A migration 026 resolvia a rota com coalesce(new.route_id, old.route_id) num
-- inicializador de DECLARE. Num DELETE o NEW é nulo, então v_route_id saía nulo
-- e o `count(*) where route_id = null` casava com zero linhas — o trigger deixava
-- APAGAR paradas com a perna in_progress (furo na G2, pego pelo teste
-- docs/tests/rotas_edit.sql, check 3).
--
-- Correção: ramifica por TG_OP e, no DELETE, lê OLD.route_id (a linha relevante
-- do delete é a OLD, não a NEW). INSERT/UPDATE seguem lendo NEW. Forward-only
-- (create or replace) no espírito do fix 14→15: a 026 fica como está; num banco
-- recriado do zero, a 026 cria a versão com o furo e esta 027 substitui em
-- seguida — funciona, é bom saber.

create or replace function enforce_route_stops_frozen_while_running()
returns trigger
language plpgsql
as $$
declare
  v_route_id uuid;
  v_running  int;
begin
  -- No DELETE a linha é OLD (NEW é nulo); em INSERT/UPDATE é NEW.
  if tg_op = 'DELETE' then
    v_route_id := old.route_id;
  else
    v_route_id := new.route_id;
  end if;

  select count(*) into v_running
  from route_executions
  where route_id = v_route_id
    and service_date = current_date
    and status = 'in_progress';

  if v_running > 0 then
    raise exception 'G2: rota com perna em andamento hoje não pode ter as paradas editadas'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- O trigger da 026 já aponta para esta função pelo nome; recriar a função basta.
