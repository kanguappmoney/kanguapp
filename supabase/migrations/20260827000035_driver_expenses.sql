-- Kangu v1 — R11: despesas do motorista (aba Financeiro → "Despesas"), base do
-- "lucro líquido" do painel (receita recebida − despesas do mês). Categoria só
-- as 3 fixas. RLS dono-only (padrão de vehicles): só o próprio motorista lê e
-- escreve. Sem guarda G1–G6 envolvida (dado financeiro interno do motorista).
create type expense_category as enum ('combustivel', 'manutencao', 'outros');

create table driver_expenses (
  id            uuid primary key default gen_random_uuid(),
  driver_id     uuid not null references driver_profiles (user_id) on delete cascade,
  category      expense_category not null,
  amount_cents  int  not null check (amount_cents > 0),
  expense_date  date not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index driver_expenses_driver_date_idx on driver_expenses (driver_id, expense_date);

alter table driver_expenses enable row level security;

create policy driver_expenses_all_owner on driver_expenses
  for all using (driver_id = auth.uid()) with check (driver_id = auth.uid());
