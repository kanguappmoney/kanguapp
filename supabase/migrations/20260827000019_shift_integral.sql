-- Kangu v1 — Turno "Integral" no enum de turno.
-- Motivo: o Link de captação é dividido por turno (manhã / tarde / integral), mas
-- student_shift nasceu só com ('morning','afternoon'). Adicionamos 'integral'.
--
-- ALTER TYPE ... ADD VALUE fica NESTE arquivo sozinho, separado da tabela que usa
-- o tipo: o novo valor de enum não pode ser referenciado na mesma transação em
-- que é adicionado. Assim a migration seguinte já enxerga 'integral'.
alter type student_shift add value if not exists 'integral';
