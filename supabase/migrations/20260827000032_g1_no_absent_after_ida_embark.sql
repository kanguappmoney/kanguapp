-- Kangu v1 — Extensão da G1 no banco: quem EMBARCOU na IDA não pode ser marcado
-- AUSENTE na VOLTA (o ciclo do dia fecha com o desembarque, nunca com uma
-- ausência que não faz sentido pra quem já está a bordo). Espelha a G1 que o
-- apply_route_review já impõe (força a inclusão da volta de quem embarcou), agora
-- também no nível do EVENTO e à prova de bypass: recusa um student_absent numa
-- perna dropoff quando o aluno tem embarked na ida (pickup) da mesma rota + dia.
--
-- Só a volta (dropoff) gateia. Ida (pickup) e rotas legadas (leg null) seguem
-- livres — o "Ausente" no embarque continua sendo o caso real (pai foi buscar,
-- aluno passou mal). SECURITY DEFINER: a checagem lê os eventos da ida sem
-- depender da visibilidade por RLS.
--
-- Dispara em INSERT **e UPDATE**: a RLS do dono permite update em route_events,
-- então trocar um `disembarked` existente para `student_absent` por update seria
-- um bypass do caminho normal (delete+insert do setStopState).
create or replace function enforce_no_absent_after_ida_embark()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route uuid;
  v_date  date;
  v_leg   stop_type;
begin
  if NEW.type <> 'student_absent' or NEW.student_id is null then
    return NEW;
  end if;

  select route_id, service_date, leg
    into v_route, v_date, v_leg
    from route_executions
   where id = NEW.execution_id;

  -- Gateia só na volta. Ida (pickup) e legado (leg null) não travam.
  if v_leg is distinct from 'dropoff'::stop_type then
    return NEW;
  end if;

  if exists (
    select 1
      from route_events re
      join route_executions e on e.id = re.execution_id
     where re.student_id = NEW.student_id
       and re.type = 'embarked'
       and e.route_id = v_route
       and e.service_date = v_date
       and e.leg = 'pickup'::stop_type
  ) then
    raise exception
      'G1: aluno embarcou na ida hoje — na volta só desembarque, sem ausencia';
  end if;

  return NEW;
end
$$;

drop trigger if exists trg_enforce_no_absent_after_ida_embark on route_events;
create trigger trg_enforce_no_absent_after_ida_embark
  before insert or update of type, student_id, execution_id on route_events
  for each row execute function enforce_no_absent_after_ida_embark();
