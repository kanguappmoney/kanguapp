-- Kangu v1 — Rotas 2.0 (criação encorpada): sentido 'both'.
-- Uma rota passa a poder ser uma "turma" com as duas pernas (ida + volta) numa
-- entidade só. Rota nova nasce direction='both'; as pernas vivem em
-- route_stops.kind. Rotas antigas seguem 'outbound'/'inbound' e continuam
-- rodáveis no fluxo atual (ponte de compatibilidade).
--
-- ADD VALUE fica sozinho neste arquivo: o novo valor não pode ser usado na mesma
-- transação em que é adicionado.
alter type route_direction add value if not exists 'both';
