-- Kangu v1 — prefixo do veículo (número de identificação da van no transporte
-- escolar). Nullable de propósito: motoristas antigos não têm o dado. A
-- obrigatoriedade (prefixo + placa + modelo + cor) é um portão de CADASTRO,
-- não uma guarda de segurança (G1–G6): imposta no servidor (server actions de
-- aluno, convite e link de captação via lib/profile-gate) + aviso na tela — ver
-- progresso.md. Não vai para RLS/trigger: `students` recebe UPDATE de outros
-- fluxos (mensalidade, foto, pay_status, approve_capture) que não podem travar.
alter table vehicles add column if not exists prefix text;
