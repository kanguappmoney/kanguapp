-- Kangu v1 — Fatia 1 do financeiro: campos base.
-- Mensalidade por aluno (fonte do amount_cents na geração da fatura) e status
-- da assinatura do motorista (campo manual, NÃO é fluxo de cobrança no piloto).

-- Mensalidade do aluno em centavos (o motorista define; opcional até definir).
alter table students add column monthly_fee_cents int
  check (monthly_fee_cents is null or monthly_fee_cents > 0);

-- Status da assinatura do motorista com a Kangu (fluxo 1). Setável na mão.
create type subscription_status as enum ('active', 'trial', 'paused');
alter table driver_profiles
  add column subscription_status subscription_status not null default 'trial';
