-- Kangu v1 — limites de conexão do banco (proteção contra excesso e conexões ociosas).
--
-- Contexto: o app NÃO abre conexões Postgres próprias (só HTTP via supabase-js → PostgREST). Quem segura as
-- conexões é o PostgREST (papel `authenticator`), com pool interno próprio; o banco tem max_connections = 60 e o
-- PgBouncer/Supavisor do Supabase já está ativo. O que faltava eram travas no banco:
--   • idle_in_transaction_session_timeout = 0 (transação esquecida aberta nunca era encerrada);
--   • idle_session_timeout = 0 (sessão ociosa nunca era encerrada);
--   • nenhum teto de conexões do PostgREST. O `authenticator` é papel reservado do Supabase: `connection limit` NÃO
--     pode ser alterado por SQL (erro 42501). O teto do pool do PostgREST se ajusta no painel
--     (Database → Settings → Data API / pool size), não aqui.
-- Já existiam (padrão Supabase) e NÃO mudam: statement_timeout anon 3s / authenticated 8s; authenticator
-- statement_timeout 8s e lock_timeout 8s.
--
-- Valores:
--   30s  — transação aberta e parada por mais de 30 s é bug/queda de cliente: encerra e libera o lock.
--   10min — rede de segurança para sessão ociosa. Bem acima dos 30 s em que o PostgREST já fecha sozinho as
--           conexões paradas do pool dele, então não derruba conexão que ele ainda considera viva.
-- Valem para conexões NOVAS (as abertas continuam até serem recicladas).
--
-- Reverter: alter role authenticator reset idle_in_transaction_session_timeout;
--           alter role authenticator reset idle_session_timeout;

alter role authenticator set idle_in_transaction_session_timeout = '30s';
alter role authenticator set idle_session_timeout = '10min';

notify pgrst, 'reload config';
