-- Kangu v1 — Enums (tipos de domínio)
-- Fonte de verdade: progresso.md, seção 4.
-- Nomenclatura: guardas de segurança = G1..G6 (só em comentários, nunca na UI);
-- grupos/turmas de alunos = "Turma" (nunca "G").

-- Papel do usuário. B2B2C: motorista é cliente pagante; pai entra por convite.
create type user_role as enum ('driver', 'guardian');

-- G6 — modo de acompanhamento do pai, escolhido POR MOTORISTA.
--   'map'      = pai vê a van no mapa ao vivo (respeitando G4).
--   'timeline' = barra por degraus, sem GPS; o banco NUNCA entrega live_positions.
create type parent_tracking_mode as enum ('map', 'timeline');

-- Verificação: status único, sem níveis (seção 2 / fora: verificação em níveis).
create type verification_status as enum ('pending', 'verified');

-- Turno escolar do aluno.
create type student_shift as enum ('morning', 'afternoon');

-- Ciclo de vida do aluno no atendimento do motorista.
create type student_status as enum ('active', 'archived');

-- Flag derivado no aluno (camada 2 — operação, onde vivem G1/G2).
--   'ok'      = sem fatura vencida.
--   'at_risk' = vencida dentro da tolerância (só informa, não bloqueia).
--   'blocked' = tem fatura 'suspended'.
create type pay_status as enum ('ok', 'at_risk', 'blocked');

-- Máquina de estados da fatura (camada 1 — dinheiro). 'paid' e 'canceled' terminais.
create type invoice_status as enum ('pending', 'overdue', 'suspended', 'paid', 'canceled');

-- Sentido da rota. G1 se aplica à volta (retorno garantido no mesmo dia).
create type route_direction as enum ('outbound', 'inbound'); -- ida / volta

-- Tipo de parada dentro da rota.
create type stop_type as enum ('pickup', 'dropoff');

-- Execução da rota num dia. G4 só libera rastreio quando 'in_progress'.
create type execution_status as enum ('scheduled', 'in_progress', 'completed', 'canceled');

-- Eventos da execução — alimentam a Linha do tempo (G6) e a trilha de auditoria (LGPD).
create type route_event_type as enum (
  'route_started',
  'arrived_at_stop',
  'embarked',
  'disembarked',
  'student_absent',
  'stop_skipped_billing',      -- pulo por inadimplência (ver camada 2)
  'stop_forced_driver_override', -- "Levar mesmo assim" (G1/G2)
  'route_ended'
);

-- Tipos de ocorrência pré-definidos (seção 2).
create type occurrence_type as enum ('traffic', 'delay', 'breakdown', 'vehicle_change');

-- Trajetos afetados por uma ausência.
create type trip_leg as enum ('outbound', 'inbound', 'both');

-- Eventos da fatura. É esta lista que sustenta a guarda G3:
-- só há 'suspended' se antes houve 'final_warning_delivered'.
create type invoice_event_type as enum (
  'reminder_sent',
  'final_warning_sent',
  'final_warning_delivered',   -- entrega CONFIRMADA do aviso definitivo (G3)
  'final_warning_failed',      -- entrega falhou -> escala pro motorista (G3)
  'marked_overdue',
  'suspended',
  'paid',
  'reactivated',
  'driver_override',
  'canceled'
);

-- Canal de entrega de um invoice_event / notification.
create type delivery_channel as enum ('whatsapp', 'sms', 'email', 'push', 'in_app');
