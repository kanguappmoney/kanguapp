-- Kangu v1 — Cadastro de aluno: campos adicionais (decisão do builder, 27/08)
-- Traz para o escopo: data de nascimento, e-mail e WhatsApp do responsável,
-- e o turno 'integral'. CPF fica FORA (dado sensível, desnecessário no piloto).

alter table students add column birth_date          date;
alter table students add column responsible_whatsapp text;
alter table students add column responsible_email    text;

-- Novo valor de turno. (ADD VALUE não pode ser usado na mesma transação em que
-- é criado, mas aqui só declaramos — o uso vem depois, então é seguro.)
alter type student_shift add value if not exists 'integral';
