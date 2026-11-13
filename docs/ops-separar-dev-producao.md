# Separar o banco de desenvolvimento do de produção (checklist, NÃO executado)

> Preparado em 2026-11-13. Hoje existe UM projeto Supabase ("Kangu App", ref `noqetqvfhyloixllwjyi`, sa-east-1)
> usado pelo `localhost`, pelos testes de SQL e pela Vercel (produção). Nada abaixo foi executado.

## Ordem

1. **Antes de tudo, no projeto de produção atual:** ligar backup (hoje plano Free, sem backup) e exportar uma cópia do
   `erasure_ledger` (guardar fora do banco; ver pendência no `estado-atual.md`).
2. **Criar o projeto de dev** (novo projeto Supabase, mesma região sa-east-1; nome sugerido "Kangu App (dev)"). Anotar:
   URL, chave `anon`/publishable, chave secreta (`SUPABASE_SECRET_KEY`), ref do projeto.
3. **Extensões** (Dashboard → Database → Extensions): habilitar `pg_cron` ANTES das migrations 055/056/058/062, que chamam
   `cron.schedule`. Nenhuma migration cria a extensão. Conferir também `pgcrypto`/`uuid-ossp` se o schema usar
   `gen_random_uuid()` (nativo no Postgres 13+; não precisa de extensão).
4. **Migrations 001 a 065, em ordem de nome de arquivo, pelo SQL Editor** (mesmo método de sempre; sem
   `supabase db push`, ver riscos). Cuidados:
   - rodar **cada arquivo sozinho**; a 064 tem `alter type route_event_type add value` e o valor novo só pode ser usado
     depois de confirmado (a própria migration não o usa em tempo de criação, mas o teste `reabrir_rota.sql` sim);
   - o editor avisa "operação destrutiva" por causa de `drop ... if exists`; é esperado.
5. **Dados de referência** (não vêm das migrations, vêm de scripts com a chave secreta do DEV): na ordem
   `scripts/import-cities.ts` → `scripts/import-neighborhoods-ibge.ts` → `scripts/import-schools.ts` (precisa do CSV do
   Censo Escolar/INEP), e, se quiser nomes amigáveis, `scripts/backfill-school-display-names.ts`.
   Rodar com `node --env-file=.env.dev scripts/...` apontando para o `.env.dev` (nunca para `.env.local` de produção).
6. **Storage:** os buckets `student-photos`, `driver-photos` e `van-photos` são criados pelas migrations 011/013/036
   (conferir em Storage). As políticas de `storage.objects` vêm das mesmas migrations.
7. **Auth** (Dashboard → Authentication): copiar do projeto de produção: Site URL e **Redirect URLs** (acrescentar
   `http://localhost:3000/**` só no dev), provedores habilitados, "Confirm email", SMTP/templates de e-mail, limites de
   taxa. Criar contas de teste (motorista, responsável, admin); NUNCA copiar usuários nem dados reais para o dev.
8. **Variáveis de ambiente:**
   - `.env.local` (máquina de desenvolvimento) → URL/chaves do DEV;
   - Vercel, ambiente **Production** → URL/chaves do projeto REAL (como hoje);
   - Vercel, ambiente **Preview** → URL/chaves do DEV (para os previews de PR não tocarem em produção);
   - `NEXT_PUBLIC_MAPBOX_TOKEN` pode ser o mesmo (restringir por domínio no painel do Mapbox: localhost + domínio de
     produção); `ASAAS_API_KEY` só com a chave sandbox no dev.
9. **Comparar os dois bancos** (ver risco 2): rodar a mesma consulta de catálogo nos dois e diferenciar (contagem e
   hash por função/tabela/policy/trigger). Qualquer diferença = migration editada depois de aplicada ou ajuste manual.
10. **Rodar os 30 testes de `docs/tests/` no DEV** (são feitos para rodar e reverter) e só então passar a rodar testes
    no banco de produção apenas em casos justificados, em transação revertida.
11. **Trava de segurança:** conferir em cada sessão qual projeto o `.env.local` aponta antes de qualquer teste que escreva
    (hoje o `localhost` escreve no banco real).

## Riscos do histórico `supabase_migrations` terminar na 018

1. **`supabase db push` em produção reaplicaria 019–065.** O histórico (`supabase_migrations.schema_migrations`) só conhece
   até a 018; a CLI trataria 019–065 como pendentes e tentaria executá-las de novo (`create type`, `alter type add value`,
   `create policy` sem `if not exists`...), com erros no meio e risco de estado parcial. Regra: **nunca** `db push`
   em produção antes de reconciliar o histórico.
2. **Reconciliação (quando for usar a CLI):** em produção, marcar 019–065 como aplicadas com
   `supabase migration repair --status applied <versão>` (uma por versão), depois de comprovar que o catálogo bate com os
   arquivos (checklist item 9). Se alguma migration foi editada no editor depois de aplicada, o arquivo e o banco divergem
   e o repair esconderia isso.
3. **Deriva silenciosa:** como o histórico não registra nada depois da 018, não há como saber, só pelo banco, se um arquivo
   foi aplicado inteiro, parcialmente ou com ajustes manuais. A única prova é o catálogo (`pg_proc`, `pg_trigger`, colunas,
   policies), por isso o item 9.
4. **Recriar o dev do zero também depende de os arquivos serem executáveis do vazio:** nunca foram rodados em sequência num
   banco limpo. Podem existir dependências implícitas de dados ou de objetos criados à mão (ex.: `pg_cron` ligado no painel;
   linhas em `cities`/`schools` carregadas por script). Por isso o passo 3 e o passo 5 vêm antes/depois como descrito, e
   o primeiro teste de vazio deve ser feito no dev, nunca em produção.
5. **Reconciliar o histórico do dev:** no dev recém-criado, o histórico começa vazio. Se aplicar por `db push`, a CLI
   registra 001–065 corretamente; se aplicar pelo editor, o histórico fica vazio e a divergência com a CLI reaparece.
   Escolher UM método por ambiente e documentar.
6. **Migration 064 (`alter type ... add value`)** não pode ser usada na mesma transação em que o valor é criado; em `db push`
   isso é um erro clássico quando algum arquivo posterior usa o valor.
7. **Restaurar backup em produção** desfaz exclusões LGPD posteriores ao snapshot: reaplicar o `erasure_ledger`
   guardado fora do banco (pendência já registrada).
