-- Kangu v1 — Políticas RLS
-- Guardas impostas aqui (não só escondidas na tela):
--   G4 — rastreio só em execução in_progress.
--   G5 — endereço nunca a responsável não vinculado.
--   G6 — modo 'timeline' nunca entrega live_positions.
-- Princípio: negar por padrão; abrir o mínimo necessário por papel.

-- ===========================================================================
-- users — cada um lê/edita o próprio perfil.
-- Motorista precisa ler users de responsáveis vinculados (nome nas telas) e
-- vice-versa; liberado via função de vínculo abaixo.
-- ===========================================================================
create policy users_select_self on users
  for select using (id = auth.uid());

create policy users_update_self on users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Motorista vê o perfil (nome/telefone) dos responsáveis de seus alunos.
create policy users_select_linked_guardians on users
  for select using (
    current_user_role() = 'driver'
    and exists (
      select 1
      from guardian_student gs
      join students s on s.id = gs.student_id
      where gs.guardian_id = users.id
        and s.driver_id = auth.uid()
    )
  );

-- Responsável vê o perfil do motorista dos alunos a que está vinculado.
create policy users_select_linked_driver on users
  for select using (
    current_user_role() = 'guardian'
    and exists (
      select 1
      from students s
      join guardian_student gs on gs.student_id = s.id
      where s.driver_id = users.id
        and gs.guardian_id = auth.uid()
    )
  );

-- ===========================================================================
-- driver_profiles — motorista gerencia o próprio; responsável vinculado lê
-- (precisa saber parent_tracking_mode pra renderizar a tela certa).
-- ===========================================================================
create policy driver_profiles_all_self on driver_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy driver_profiles_select_linked on driver_profiles
  for select using (
    exists (
      select 1
      from students s
      join guardian_student gs on gs.student_id = s.id
      where s.driver_id = driver_profiles.user_id
        and gs.guardian_id = auth.uid()
    )
  );

-- ===========================================================================
-- guardians — cada responsável gerencia o próprio; motorista vinculado lê.
-- ===========================================================================
create policy guardians_all_self on guardians
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy guardians_select_linked on guardians
  for select using (
    current_user_role() = 'driver'
    and exists (
      select 1
      from guardian_student gs
      join students s on s.id = gs.student_id
      where gs.guardian_id = guardians.user_id
        and s.driver_id = auth.uid()
    )
  );

-- ===========================================================================
-- vehicles — só o motorista dono.
-- ===========================================================================
create policy vehicles_all_owner on vehicles
  for all using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- ===========================================================================
-- students — G5: SELECT só p/ motorista dono e responsáveis VINCULADOS.
-- Não vinculado não vê a linha (logo, não vê endereço).
-- Escrita: só o motorista dono.
-- ===========================================================================
create policy students_select_owner on students
  for select using (driver_id = auth.uid());

create policy students_select_linked_guardian on students
  for select using (is_guardian_of_student(id));   -- G5

create policy students_insert_owner on students
  for insert with check (driver_id = auth.uid());

create policy students_update_owner on students
  for update using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy students_delete_owner on students
  for delete using (driver_id = auth.uid());

-- ===========================================================================
-- guardian_student — vínculo. Motorista dono do aluno gerencia; ambos leem.
-- ===========================================================================
create policy guardian_student_select on guardian_student
  for select using (
    guardian_id = auth.uid() or is_driver_of_student(student_id)
  );

create policy guardian_student_insert_driver on guardian_student
  for insert with check (is_driver_of_student(student_id));

create policy guardian_student_delete_driver on guardian_student
  for delete using (is_driver_of_student(student_id));

-- ===========================================================================
-- routes — motorista dono gerencia; responsável vinculado a algum aluno lê.
-- ===========================================================================
create policy routes_all_owner on routes
  for all using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy routes_select_linked_guardian on routes
  for select using (
    current_user_role() = 'guardian'
    and exists (
      select 1
      from route_stops rs
      join guardian_student gs on gs.student_id = rs.student_id
      where rs.route_id = routes.id
        and gs.guardian_id = auth.uid()
    )
  );

-- ===========================================================================
-- route_stops — motorista dono gerencia.
-- G5: responsável só vê a parada DO PRÓPRIO filho (não a de outras crianças).
-- ===========================================================================
create policy route_stops_all_owner on route_stops
  for all using (is_driver_of_route(route_id))
  with check (is_driver_of_route(route_id));

create policy route_stops_select_own_child on route_stops
  for select using (is_guardian_of_student(student_id));   -- G5

-- ===========================================================================
-- route_executions — motorista dono gerencia; responsável com filho na rota lê.
-- ===========================================================================
create policy route_executions_all_owner on route_executions
  for all using (is_driver_of_route(route_id))
  with check (is_driver_of_route(route_id));

create policy route_executions_select_guardian on route_executions
  for select using (is_guardian_of_execution(id));

-- ===========================================================================
-- route_events — alimentam a Linha do tempo (G6). Motorista dono escreve.
-- G5: responsável vê eventos da rota (student_id null) e os do PRÓPRIO filho;
--     nunca eventos nominais de outra criança.
-- ===========================================================================
create policy route_events_all_owner on route_events
  for all using (is_driver_of_execution(execution_id))
  with check (is_driver_of_execution(execution_id));

create policy route_events_select_guardian on route_events
  for select using (
    is_guardian_of_execution(execution_id)
    and (student_id is null or is_guardian_of_student(student_id))  -- G5
  );

-- ===========================================================================
-- live_positions — G4 + G6, o ponto mais sensível.
-- Motorista dono escreve/lê. Responsável só lê se guardian_can_see_live_position
-- (in_progress E modo 'map'). Modo 'timeline' => nunca entrega, nem em rota ativa.
-- ===========================================================================
create policy live_positions_all_owner on live_positions
  for all using (is_driver_of_execution(execution_id))
  with check (is_driver_of_execution(execution_id));

create policy live_positions_select_guardian on live_positions
  for select using (guardian_can_see_live_position(execution_id));  -- G4 + G6

-- ===========================================================================
-- absences — motorista dono lê; responsável vinculado lê e cria/desfaz p/ seu filho.
-- ===========================================================================
create policy absences_select on absences
  for select using (
    is_driver_of_student(student_id) or is_guardian_of_student(student_id)
  );

create policy absences_insert_guardian on absences
  for insert with check (is_guardian_of_student(student_id));

create policy absences_delete_guardian on absences
  for delete using (is_guardian_of_student(student_id));

-- ===========================================================================
-- occurrences — motorista dono gerencia; responsável com filho na execução lê.
-- ===========================================================================
create policy occurrences_all_owner on occurrences
  for all using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy occurrences_select_guardian on occurrences
  for select using (
    execution_id is not null and is_guardian_of_execution(execution_id)
  );

-- ===========================================================================
-- invoices — fatura por aluno. Motorista dono gerencia; responsável vinculado lê.
-- (Transições sensíveis, ex. suspender, são barradas por trigger — ver 000005.)
-- ===========================================================================
create policy invoices_all_owner on invoices
  for all using (driver_id = auth.uid()) with check (driver_id = auth.uid());

create policy invoices_select_guardian on invoices
  for select using (is_guardian_of_student(student_id));

-- ===========================================================================
-- invoice_events — motorista dono gerencia; responsável vinculado lê.
-- ===========================================================================
create policy invoice_events_all_owner on invoice_events
  for all using (
    exists (select 1 from invoices i
            where i.id = invoice_events.invoice_id and i.driver_id = auth.uid())
  )
  with check (
    exists (select 1 from invoices i
            where i.id = invoice_events.invoice_id and i.driver_id = auth.uid())
  );

create policy invoice_events_select_guardian on invoice_events
  for select using (
    exists (select 1 from invoices i
            where i.id = invoice_events.invoice_id
              and is_guardian_of_student(i.student_id))
  );

-- ===========================================================================
-- notifications — cada um vê e marca como lida as próprias.
-- ===========================================================================
create policy notifications_select_self on notifications
  for select using (user_id = auth.uid());

create policy notifications_update_self on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
