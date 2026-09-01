-- Kangu v1 — Financeiro Fatia 2: tolerância default do motorista.
-- Piso de 2 dias (mesmo piso do snapshot em invoices.tolerance_days). É a folga
-- entre o vencimento e o momento em que a suspensão pode ser considerada.
-- A G3 (suspender só com aviso entregue) NÃO depende disto — é travada no
-- trigger enforce_invoice_transition e é obrigatória, não configurável.

alter table driver_profiles
  add column default_tolerance_days int not null default 2
  check (default_tolerance_days >= 2);
