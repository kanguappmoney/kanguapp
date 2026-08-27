-- Kangu v1 — Tabelas (seção 4 do progresso.md)
-- RLS é habilitado aqui, mas as POLÍTICAS ficam em 20260826000004_rls.sql.
-- Habilitar RLS sem política = tabela fechada por padrão (fail-safe). Correto.

-- ---------------------------------------------------------------------------
-- users — perfil público espelhando auth.users. O papel mora aqui.
-- ---------------------------------------------------------------------------
create table users (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        user_role   not null,
  full_name   text        not null,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- driver_profiles — dados do motorista (cliente pagante).
-- ---------------------------------------------------------------------------
create table driver_profiles (
  user_id               uuid primary key references users (id) on delete cascade,
  -- G6: preferência por motorista, vale para todas as rotas dele. Default 'map'.
  parent_tracking_mode  parent_tracking_mode not null default 'map',
  verification           verification_status  not null default 'pending',
  document_number       text,      -- CNH / doc (verificação status único, sem níveis)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- vehicles — veículo do motorista (capacidade/vagas).
-- ---------------------------------------------------------------------------
create table vehicles (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references driver_profiles (user_id) on delete cascade,
  label       text not null,          -- ex.: "Van branca - ABC1D23"
  plate       text,
  capacity    int  not null check (capacity > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index vehicles_driver_idx on vehicles (driver_id);

-- ---------------------------------------------------------------------------
-- guardians — perfil do responsável (entra por convite).
-- ---------------------------------------------------------------------------
create table guardians (
  user_id     uuid primary key references users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- students — alunos que o motorista já atende.
-- G5: endereços de embarque/desembarque vivem aqui; RLS restringe SELECT ao
--     motorista dono e aos responsáveis VINCULADOS. Não vinculado não vê.
-- ---------------------------------------------------------------------------
create table students (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references driver_profiles (user_id) on delete cascade,
  full_name         text not null,
  school            text,
  shift             student_shift,
  -- "Turma Manhã"/"Turma Tarde" (nomenclatura: nunca "G" pra grupo). Livre por ora.
  turma             text,
  pickup_address    text,   -- G5
  dropoff_address   text,   -- G5
  pickup_lat        double precision,
  pickup_lng        double precision,
  dropoff_lat       double precision,
  dropoff_lng       double precision,
  -- Flag derivado (camada 2). Recalculado por trigger nas transições de fatura.
  pay_status        pay_status     not null default 'ok',
  status            student_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index students_driver_idx on students (driver_id);
create index students_pay_status_idx on students (pay_status);

-- ---------------------------------------------------------------------------
-- guardian_student — junção N:N. Um aluno pode ter vários responsáveis.
-- É esta tabela que define "vinculado" para G4/G5.
-- ---------------------------------------------------------------------------
create table guardian_student (
  guardian_id  uuid not null references guardians (user_id) on delete cascade,
  student_id   uuid not null references students (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (guardian_id, student_id)
);
create index guardian_student_student_idx on guardian_student (student_id);

-- ---------------------------------------------------------------------------
-- routes — rotas do motorista + sentido (ida/volta).
-- ---------------------------------------------------------------------------
create table routes (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references driver_profiles (user_id) on delete cascade,
  vehicle_id  uuid references vehicles (id) on delete set null,
  name        text not null,             -- ex.: "Turma Manhã - Ida"
  direction   route_direction not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index routes_driver_idx on routes (driver_id);

-- ---------------------------------------------------------------------------
-- route_stops — sequência de paradas de uma rota.
-- ---------------------------------------------------------------------------
create table route_stops (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references routes (id) on delete cascade,
  student_id  uuid not null references students (id) on delete cascade,
  position    int  not null,             -- ordem de embarque/desembarque
  kind        stop_type not null,
  created_at  timestamptz not null default now(),
  unique (route_id, position)
);
create index route_stops_route_idx on route_stops (route_id);
create index route_stops_student_idx on route_stops (student_id);

-- ---------------------------------------------------------------------------
-- route_executions — a rota rodando num dia. G4 depende de status.
-- ---------------------------------------------------------------------------
create table route_executions (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references routes (id) on delete cascade,
  service_date date not null,
  status       execution_status not null default 'scheduled',
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  unique (route_id, service_date)
);
create index route_executions_status_idx on route_executions (status);
create index route_executions_route_idx on route_executions (route_id);

-- ---------------------------------------------------------------------------
-- route_events — trilha de eventos. Alimenta a Linha do tempo (G6) e auditoria.
-- ---------------------------------------------------------------------------
create table route_events (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid not null references route_executions (id) on delete cascade,
  student_id    uuid references students (id) on delete set null, -- null p/ eventos da rota
  type          route_event_type not null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index route_events_execution_idx on route_events (execution_id);

-- ---------------------------------------------------------------------------
-- live_positions — posição atual da van. UPSERT por execução (não histórico).
-- G4+G6: RLS só entrega ao pai quando execução in_progress E motorista em 'map'.
-- ---------------------------------------------------------------------------
create table live_positions (
  execution_id  uuid primary key references route_executions (id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  heading       double precision,
  speed         double precision,
  accuracy      double precision,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- absences — ausência informada pelo responsável.
-- ---------------------------------------------------------------------------
create table absences (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students (id) on delete cascade,
  reported_by   uuid references users (id) on delete set null,
  service_date  date not null,
  leg           trip_leg not null default 'both',
  created_at    timestamptz not null default now(),
  unique (student_id, service_date, leg)
);
create index absences_student_date_idx on absences (student_id, service_date);

-- ---------------------------------------------------------------------------
-- occurrences — ocorrências pré-definidas com notificação às famílias.
-- ---------------------------------------------------------------------------
create table occurrences (
  id            uuid primary key default gen_random_uuid(),
  execution_id  uuid references route_executions (id) on delete cascade,
  driver_id     uuid not null references driver_profiles (user_id) on delete cascade,
  type          occurrence_type not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index occurrences_execution_idx on occurrences (execution_id);

-- ---------------------------------------------------------------------------
-- invoices — fatura POR ALUNO. Deltas da seção 4.
-- ---------------------------------------------------------------------------
create table invoices (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references students (id) on delete restrict,
  guardian_id        uuid references guardians (user_id) on delete set null,
  driver_id          uuid not null references driver_profiles (user_id) on delete cascade,
  status             invoice_status not null default 'pending',
  billing_period     date not null,               -- 1º dia do mês de referência
  amount_cents       int  not null check (amount_cents > 0),
  due_date           date not null,
  -- snapshot na emissão. Piso = 2 dias (config), imposto por check.
  tolerance_days     int  not null default 2 check (tolerance_days >= 2),
  paid_at            timestamptz,
  payment_provider   text,        -- 'manual' no piloto; 'asaas' depois
  provider_charge_id text,
  provider_txid      text,        -- Pix dinâmico com txid
  suspended_at       timestamptz,
  reactivated_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (student_id, billing_period)
);
create index invoices_student_idx on invoices (student_id);
create index invoices_driver_idx on invoices (driver_id);
create index invoices_status_idx on invoices (status);

-- ---------------------------------------------------------------------------
-- invoice_events — sustenta a guarda G3 (aviso entregue antes de suspender).
-- ---------------------------------------------------------------------------
create table invoice_events (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices (id) on delete cascade,
  type          invoice_event_type not null,
  channel       delivery_channel,
  delivered_at  timestamptz,             -- preenchido só quando entrega confirmada
  provider_ref  text,
  created_at    timestamptz not null default now()
);
create index invoice_events_invoice_idx on invoice_events (invoice_id);
create index invoice_events_type_idx on invoice_events (invoice_id, type);

-- ---------------------------------------------------------------------------
-- notifications — notificações in-app / registro de envio.
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  title       text not null,
  body        text,
  channel     delivery_channel not null default 'in_app',
  metadata    jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Habilitar RLS em TODAS as tabelas. Políticas vêm depois. (fail-safe)
-- ---------------------------------------------------------------------------
alter table users             enable row level security;
alter table driver_profiles   enable row level security;
alter table vehicles          enable row level security;
alter table guardians         enable row level security;
alter table students          enable row level security;
alter table guardian_student  enable row level security;
alter table routes            enable row level security;
alter table route_stops       enable row level security;
alter table route_executions  enable row level security;
alter table route_events      enable row level security;
alter table live_positions    enable row level security;
alter table absences          enable row level security;
alter table occurrences       enable row level security;
alter table invoices          enable row level security;
alter table invoice_events    enable row level security;
alter table notifications     enable row level security;
