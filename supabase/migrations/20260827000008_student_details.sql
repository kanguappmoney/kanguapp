-- Kangu v1 — Cadastro de aluno encorpado (campos)
-- Decisão (progresso.md seção 2): aluno completo — horário entra/sai, contato do
-- responsável. A FOTO fica de fora desta migration de propósito: bucket + RLS do
-- Storage vão numa migration própria, no passo dedicado da foto (teste isolado
-- de acesso recusado, igual G4/G5). Ver supabase/deferred/student_photos_storage.sql.

alter table students add column entry_time        time;   -- horário de entrada na escola
alter table students add column exit_time         time;   -- horário de saída
alter table students add column responsible_name  text;   -- contato do responsável (o motorista já conhece)
alter table students add column responsible_phone text;   -- telefone/WhatsApp
