# Kangu — Gestão de Transporte Escolar (v1)

Fundação de dados do app. Fonte de verdade das regras: `progresso.md` (âncora de escopo).
Metodologia: build → validate → then scale. Escopo v1 congelado.

## O que já existe

`supabase/migrations/` — schema completo da seção 4 do progresso.md, **com as guardas
impostas no banco** (não só escondidas na tela):

| Arquivo | Conteúdo |
|---|---|
| `..._enums.sql` | Tipos de domínio (papéis, status de fatura, modos de acompanhamento…) |
| `..._tables.sql` | 16 tabelas + índices; RLS habilitado em todas (fecha por padrão) |
| `..._functions_helpers.sql` | Funções de vínculo (SECURITY DEFINER) + gatilho de signup |
| `..._rls.sql` | Políticas RLS — **G4, G5 e G6** |
| `..._financial_logic.sql` | Máquina de estados da fatura — **G3** + recálculo do `pay_status` |

### Guardas impostas no banco
- **G3** — `overdue → suspended` é **bloqueado por trigger** se não houver um
  `invoice_events.type = 'final_warning_delivered'` com `delivered_at`. Sem aviso
  entregue, o banco recusa a suspensão (escala pro motorista decidir).
- **G4** — responsável só lê `live_positions` quando a execução está `in_progress`.
- **G5** — endereços (em `students`) nunca aparecem a responsável não vinculado; a
  RLS restringe a linha inteira ao motorista dono e aos responsáveis vinculados.
- **G6** — se `driver_profiles.parent_tracking_mode = 'timeline'`, o banco **nunca**
  entrega `live_positions` àquele pai, nem durante rota ativa.

> G1 (nunca bloquear a volta) e G2 (motorista confirma antes de sair) são regras de
> **operação da rota** — vivem na lógica da tela "Revisão de hoje", não no schema.
> Serão implementadas quando essa tela for construída (semanas 6-8).

## Como aplicar

Ainda não há projeto Supabase criado (próximo passo da Fundação). Quando criar:

```bash
# instalar a CLI (uma vez)
brew install supabase/tap/supabase

# na raiz do projeto
supabase init
supabase link --project-ref <SEU_PROJECT_REF>
supabase db push        # aplica as migrations em ordem
```

Para desenvolver localmente com o stack completo (Postgres + Auth):

```bash
supabase start          # sobe Postgres/Auth locais (precisa de Docker)
supabase db reset       # aplica migrations do zero no banco local
```

## Roteiro de teste das guardas (rodar no primeiro apply)

Criar 1 motorista, 1 aluno, 2 responsáveis (A vinculado, B não vinculado). Então,
autenticado como cada um (`supabase` client ou SQL com `set request.jwt.claims`):

1. **G5** — responsável B faz `select * from students` → deve vir **vazio**.
   Responsável A → vê o aluno e o endereço.
2. **G4** — com a execução `scheduled`, responsável A lê `live_positions` → vazio.
   Motorista muda para `in_progress` → A passa a ver.
3. **G6** — motorista em `parent_tracking_mode = 'timeline'`, execução `in_progress`
   → responsável A lê `live_positions` → **vazio** (nunca entrega GPS no timeline).
   Muda para `'map'` → A passa a ver.
4. **G3** — como motorista, `update invoices set status='suspended'` sem evento
   `final_warning_delivered` → deve **falhar** com a mensagem da guarda G3. Inserir o
   evento com `delivered_at` e repetir → deve suceder e marcar `pay_status='blocked'`.

## App (PWA — Next.js)

Scaffold mobile-first, App Router + TypeScript + Tailwind v4 + `@supabase/ssr`.

```
src/
  middleware.ts              # renova sessão + protege rotas privadas
  lib/
    supabase/{client,server,middleware}.ts   # clientes SSR
    auth.ts                  # getCurrentUser() lê o papel de public.users
    actions/{auth,driver}.ts # server actions (login/cadastro, toggle G6)
  components/                # BottomNav, ui, TrackingModeToggle, ...
  app/
    login/ , cadastro/       # e-mail/senha, sem biometria
    (driver)/motorista/...   # guarda de papel = driver
    (guardian)/responsavel/… # guarda de papel = guardian
```

Decisões do doc já refletidas: sem biometria; motorista se cadastra (cliente
pagante), responsável entra por convite (self-cadastro removido); Home motorista
sem selo "Rota Otimizada"; Financeiro usa "A receber" (não "repasse"); Perfil do
motorista tem o toggle **G6** (Mapa/Linha do tempo) que grava `parent_tracking_mode`;
Home do responsável mostra o estado **G4** "fora do horário de rota".

### Rodar localmente

```bash
npm install
cp .env.local.example .env.local   # preencher URL + anon key do Supabase
npm run dev
```

> Sem `.env.local` preenchido o app **não sobe** — o middleware valida a sessão a
> cada request e precisa da URL/anon key do Supabase. Ou seja: criar o projeto
> Supabase e aplicar as migrations é pré-requisito pra ver o app rodando.

> Nota de segurança: `npm audit` aponta 2 CVEs no `postcss` (dependência de
> build-time do Next, não de runtime; exigem CSS malicioso — não se aplica).
> O fix força `next@16` (breaking); não aplicar por ora.

## Fora do schema (fase 2, não construir)
Marketplace, matching, contrato digital, otimização de rota, rastreio 24h/background,
webhook automático do Asaas (só depois do piloto), código/QR de embarque (removido do v1).
Ver `progresso.md` seção 3.

## Próximos passos da Fundação
1. ~~Scaffold do PWA (Next.js) com auth de dois papéis + esqueleto do painel.~~ ✅
2. Criar projeto Supabase + Vercel + repo git.
3. Aplicar as migrations e rodar o roteiro de teste das guardas acima.
4. Preencher `.env.local` e subir o app (`npm run dev`); validar login dos 2 papéis.
5. Depois: cadastro de alunos + convite dos pais (semanas 4-5).
