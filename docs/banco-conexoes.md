# Conexões com o banco (serverless) — análise e decisões

## Como o app acessa o banco
- **Nenhuma conexão Postgres própria.** Não há `pg`, `postgres`, Prisma, Drizzle nem `DATABASE_URL`. Tudo passa por
  `@supabase/ssr` / `@supabase/supabase-js` (HTTP/HTTPS para a API do Supabase → PostgREST).
- Cada função serverless da Vercel só faz requisições HTTP; ela não abre nem segura conexão no Postgres. Por isso não
  existe "conexão aberta sem reuso" a pooling no lado do app, e PgBouncer/Prisma Accelerate não se aplicam aqui.
- Quem mantém conexões é o **PostgREST** (papel `authenticator`), com **pool interno próprio** (≈5 conexões ociosas no
  diagnóstico). O Supabase também tem PgBouncer/Supavisor ativo para quem usar driver direto (porta 6543).
- `scripts/*.ts` (importações) também usam `supabase-js` com a chave secreta — HTTP, sem conexão direta.

## Diagnóstico (2026-11-09)
- `max_connections` = 60; ~18 em uso (PostgREST 5, Auth, pg_net, pg_cron, exporter, dashboard…).
- Já existiam (padrão Supabase): `statement_timeout` anon 3s / authenticated 8s; `authenticator` statement 8s e lock 8s.
- Faltavam: `idle_in_transaction_session_timeout` e `idle_session_timeout` (ambos 0 = nunca encerram).

## O que foi feito
1. **Banco (migration 054)** — `authenticator`: `idle_in_transaction_session_timeout = 30s` e `idle_session_timeout = 10min`
   (vale para conexões novas). O `connection limit` do `authenticator` **não é alterável** (papel reservado, 42501).
2. **App** — `getCurrentUser()` agora usa `cache()` do React: layout + página + cabeçalho compartilham uma leitura por
   requisição (antes cada chamada fazia ida à API de auth + consulta ao banco).

## Se um dia entrar driver direto (Prisma/pg/Drizzle) em serverless
- Conectar pela URL do **pooler em modo transação (porta 6543)**, nunca pela direta (5432).
- Pool de **1 conexão por instância** (`max: 1`), `idleTimeoutMillis` curto (~10 s) e **sem prepared statements**
  (`?pgbouncer=true` no Prisma). Guardar a conexão no escopo do módulo para reuso entre invocações quentes.
- Manter `DIRECT_URL` (5432) só para migrations.

## Ajustes manuais no painel (não dá por SQL)
- Database → Settings → pool size / max client connections do pooler e do Data API conforme o plano.
- Subir o plano de compute se `max_connections` (60) apertar.

Reverter a migration 054: `alter role authenticator reset idle_in_transaction_session_timeout;` e
`alter role authenticator reset idle_session_timeout;`.
