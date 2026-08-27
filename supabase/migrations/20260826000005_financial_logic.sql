-- Kangu v1 — Lógica financeira imposta no banco
--   G3: overdue -> suspended só se houver aviso definitivo com ENTREGA confirmada.
--   pay_status do aluno recalculado a cada mudança de fatura.
-- "Imposto no banco, não só escondido na tela" — mesma filosofia de G4/G5/G6.

-- ---------------------------------------------------------------------------
-- G3 + integridade da máquina de estados da fatura.
-- Roda antes de gravar a mudança de status.
-- ---------------------------------------------------------------------------
create or replace function enforce_invoice_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- Estados terminais não voltam atrás.
  if old.status = 'canceled' then
    raise exception 'Fatura cancelada é terminal; não pode transicionar para %', new.status;
  end if;

  -- G3: só suspende se o aviso definitivo teve entrega CONFIRMADA.
  if new.status = 'suspended' and old.status <> 'suspended' then
    if not exists (
      select 1 from invoice_events e
      where e.invoice_id = new.id
        and e.type = 'final_warning_delivered'
        and e.delivered_at is not null
    ) then
      raise exception
        'G3: não é permitido suspender sem aviso definitivo entregue (invoice %). '
        'Se a entrega falhou, escalar para decisão manual do motorista.', new.id;
    end if;
    new.suspended_at := coalesce(new.suspended_at, now());
  end if;

  -- Carimbos automáticos das transições.
  if new.status = 'paid' and old.status <> 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  -- Reativação: saindo de suspended para um estado ativo/pago.
  if old.status = 'suspended' and new.status <> 'suspended' then
    new.reactivated_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_enforce_invoice_transition
  before update of status on invoices
  for each row execute function enforce_invoice_transition();

-- ---------------------------------------------------------------------------
-- Recalcula students.pay_status a partir das faturas do aluno.
--   blocked  = tem fatura 'suspended'
--   at_risk  = tem fatura 'overdue' (vencida) e nenhuma suspensa
--   ok       = caso contrário
-- ---------------------------------------------------------------------------
create or replace function recalc_student_pay_status(p_student_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status pay_status;
begin
  select case
           when bool_or(status = 'suspended') then 'blocked'::pay_status
           when bool_or(status = 'overdue')   then 'at_risk'::pay_status
           else 'ok'::pay_status
         end
    into v_status
  from invoices
  where student_id = p_student_id
    and status in ('overdue', 'suspended');  -- só estas mudam o flag

  update students
     set pay_status = coalesce(v_status, 'ok'),
         updated_at = now()
   where id = p_student_id
     and pay_status is distinct from coalesce(v_status, 'ok');
end;
$$;

-- Dispara o recálculo do aluno afetado após qualquer mudança de fatura.
create or replace function trg_invoice_pay_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform recalc_student_pay_status(old.student_id);
    return old;
  else
    perform recalc_student_pay_status(new.student_id);
    return new;
  end if;
end;
$$;

create trigger trg_invoices_recalc_pay_status
  after insert or update or delete on invoices
  for each row execute function trg_invoice_pay_status();

-- ---------------------------------------------------------------------------
-- updated_at automático nas tabelas que têm a coluna.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_users_updated            before update on users            for each row execute function set_updated_at();
create trigger trg_driver_profiles_updated  before update on driver_profiles  for each row execute function set_updated_at();
create trigger trg_vehicles_updated         before update on vehicles         for each row execute function set_updated_at();
create trigger trg_guardians_updated        before update on guardians        for each row execute function set_updated_at();
create trigger trg_students_updated         before update on students         for each row execute function set_updated_at();
create trigger trg_routes_updated           before update on routes           for each row execute function set_updated_at();
create trigger trg_invoices_updated         before update on invoices         for each row execute function set_updated_at();
