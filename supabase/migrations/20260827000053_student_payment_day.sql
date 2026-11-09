-- Kangu v1 — dia de pagamento por aluno.
-- Cada aluno pode ter o seu dia de vencimento (1–31). Nulo = ainda não definido: a geração de faturas cai
-- no dia 10, como antes. Meses mais curtos usam o último dia do mês (dia 31 vence em 30/abr, 28/fev…).
-- Mesma RLS de students (o motorista dono atualiza); sem nenhuma regra nova de acesso.

alter table students
  add column payment_due_day smallint
  check (payment_due_day is null or payment_due_day between 1 and 31);
