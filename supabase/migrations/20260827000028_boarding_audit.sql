-- Kangu v1 — Embarque a 100m (G1/G2): integridade da auditoria do "mesmo assim".
-- O gate de proximidade (100m) é CLIENT-SIDE de propósito: pôr a distância como
-- trava no banco violaria a G1 quando o GPS falha (nada pode impedir uma criança
-- de embarcar). O papel do banco aqui é só REGISTRAR o override fielmente.
--
-- Este trigger é um NORMALIZADOR, não um bloqueio: garante que todo evento de
-- embarque/desembarque carregue um `forced` canônico (boolean) e a chave
-- `distance_m` (número medido ou null) no metadata — não importa qual caminho
-- gravou. Por NUNCA recusar (nunca faz raise), é estruturalmente incapaz de
-- violar a G1: não existe caminho de bloqueio. A segurança não é uma promessa de
-- "não vou travar", é a ausência de qualquer trava.

create or replace function normalize_boarding_metadata()
returns trigger
language plpgsql
as $$
begin
  -- Só toca embarque/desembarque; os demais eventos passam intactos.
  if new.type in ('embarked', 'disembarked') then
    if new.metadata is null then
      new.metadata := '{}'::jsonb;
    end if;
    -- forced canônico: ausente => embarque normal (false).
    if not (new.metadata ? 'forced') then
      new.metadata := new.metadata || jsonb_build_object('forced', false);
    end if;
    -- distance_m sempre presente (null quando não medido) — auditoria uniforme.
    if not (new.metadata ? 'distance_m') then
      new.metadata := new.metadata || jsonb_build_object('distance_m', null);
    end if;
  end if;
  return new;  -- nunca recusa (G1)
end $$;

drop trigger if exists trg_normalize_boarding_metadata on route_events;
create trigger trg_normalize_boarding_metadata
  before insert or update on route_events
  for each row execute function normalize_boarding_metadata();
