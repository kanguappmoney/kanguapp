-- Kangu v1 — Notificação "rota iniciada" (in-app) para os responsáveis da perna.
--
-- Não altera apply_route_review (coração de G1/G2) nem startRoute: um gatilho AFTER INSERT em route_executions
-- chama uma função SECURITY DEFINER que grava em `notifications` (a tabela não tem policy de INSERT de propósito).
--
-- Quem recebe: responsáveis vinculados (guardian_student) a alunos DAQUELA perna (route_stops.kind = perna), exceto
-- quando o aluno está ausente no dia/trajeto (absences: leg 'both' ou o trajeto da perna; ida = outbound, volta =
-- inbound), suspenso/sem autorização (consent_status <> 'authorized'), arquivado ou anonimizado.
-- Texto genérico, sem nome de criança, de motorista nem localização. Perna nula (execução legada de uma perna):
-- "O motorista iniciou a rota".
--
-- Idempotente: o gatilho é por INSERT (reabrir é UPDATE e não dispara) e a função ainda confere se já existe aviso
-- desta execução para o responsável.
-- Falha NUNCA derruba a criação da execução: o corpo roda num bloco com EXCEPTION que engole o erro. Limite: o
-- gatilho roda na mesma transação do início da rota (é um insert + um select indexado, sem rede), então não há
-- como ser "assíncrono"; o que se garante é que um erro nele não impede o início.

create or replace function public.notify_route_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leg_text  text;
  v_absence   text;
  v_body      text;
begin
  begin
    if new.status is distinct from 'in_progress' then
      return new;
    end if;

    -- perna -> trajeto da ausência (pickup = ida/outbound; dropoff = volta/inbound). Perna nula = direção da rota.
    if new.leg is not null then
      v_leg_text := new.leg::text;
      v_absence  := case new.leg::text when 'pickup' then 'outbound' else 'inbound' end;
    else
      select r.direction::text into v_absence from routes r where r.id = new.route_id;
      v_leg_text := case v_absence when 'inbound' then 'dropoff' else 'pickup' end;
    end if;

    v_body := case
      when new.leg is null          then 'O motorista iniciou a rota.'
      when new.leg::text = 'pickup' then 'O motorista iniciou a rota de ida.'
      else                               'O motorista iniciou a rota de volta.'
    end;

    insert into notifications (user_id, title, body, channel, metadata)
    select distinct gs.guardian_id,
           'Rota iniciada',
           v_body,
           'in_app'::delivery_channel,
           jsonb_build_object('kind', 'route_started', 'execution_id', new.id)
      from route_stops rs
      join students s on s.id = rs.student_id
      join guardian_student gs on gs.student_id = rs.student_id
     where rs.route_id = new.route_id
       and rs.kind::text = v_leg_text
       and s.status = 'active'
       and s.consent_status = 'authorized'
       and s.anonymized_at is null
       and not exists (
             select 1 from absences a
              where a.student_id = s.id
                and a.service_date = new.service_date
                and a.leg::text in ('both', v_absence))
       and not exists (
             select 1 from notifications n
              where n.user_id = gs.guardian_id
                and n.metadata ->> 'kind' = 'route_started'
                and n.metadata ->> 'execution_id' = new.id::text);
  exception when others then
    null; -- nunca impede nem atrasa a criação da execução
  end;
  return new;
end;
$$;

revoke all on function public.notify_route_started() from public, anon, authenticated;

drop trigger if exists trg_notify_route_started on public.route_executions;
create trigger trg_notify_route_started
  after insert on public.route_executions
  for each row
  when (new.status = 'in_progress')
  execute function public.notify_route_started();
