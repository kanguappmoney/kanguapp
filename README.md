# Kangu — Gestão de Transporte Escolar (v1)

App **B2B2C** de gestão de transporte escolar, rodando como **PWA** (Next.js).
O **motorista de van é o cliente pagante**; os **pais entram por convite** dele,
só para acompanhar o filho. Não é marketplace na v1.

> **Fonte de verdade do escopo:** [`docs/progresso.md`](docs/progresso.md).
> O código mostra *o quê*; o `progresso.md` guarda *o porquê* — decisões
> travadas, limites de escopo e as razões das guardas. Onde um mockup contradiz
> o documento, vale o documento.

Metodologia: **build → validate → then scale.** Uma fatia por sessão, validada e
commitada antes da próxima. RLS/guardas entram no dia 1, não no acabamento —
provadas por teste, não presumidas.

## Estado atual

Infra no ar e **todos os blocos de produto construídos e provados** — incluindo o
Modo Mapa. O app está completo para o piloto; o que falta é validação, não código
(testes manuais e LGPD — ver "Próximo").

| Bloco | Estado |
|---|---|
| **Fundação** — PWA + auth dois papéis (driver/guardian, sem biometria, pai só por convite) | ✅ |
| **Cadastro + convite** — wizard de aluno em 3 passos, lista/detalhe, convite por aluno (uso único, expira 14 dias), consentimento LGPD | ✅ |
| **Operação de rota + Linha do tempo (G6)** — criação de rota, modo direção, Revisão de hoje (G2), Linha do tempo do pai (paradas, canguru, agregados anônimos) | ✅ |
| **Fotos (aluno e motorista)** — bucket privado + RLS espelhando G5, upload com preview, exibição por URL assinada; testes de acesso recusado passando | ✅ |
| **Perfil do motorista** — dados, veículo, stats reais, toggle G6, status de assinatura (sem CNH, sem estrelas) | ✅ |
| **Ausências e ocorrências** — ausência pelo pai, ocorrência do motorista com fan-out `SECURITY DEFINER`, avisos in-app com contador de não-lidos | ✅ |
| **Financeiro (3 fatias)** — mensalidade por aluno, geração idempotente de faturas, "A receber", régua, aviso definitivo (G3), suspensão/reativação, G1/G2 na Revisão de hoje | ✅ |
| **Modo Mapa (Mapbox)** — GPS ao vivo por polling, só o pino do motorista (sem paradas, G5), emissão só foreground+rota ativa (G4) com throttle e minimização de dado | ✅ |

## As guardas inegociáveis (G1–G6)

Regras internas de segurança. **Somem da UI** (o usuário nunca vê a sigla). Onde
possível, impostas **no banco** (trigger/RLS/`SECURITY DEFINER`), à prova de
bypass — não só escondidas na tela. **Todas as seis ativas e provadas em teste.**

- **G1 — nunca bloquear a volta de quem embarcou.** Inadimplência nunca tira a
  volta pra casa.
- **G2 — motorista sempre confirma antes de sair.** "Revisão de hoje" + "Levar
  mesmo assim". Nada removido no meio de uma execução em andamento.
- **G3 — suspensão só com aviso *entregue*.** Trigger `enforce_invoice_transition`
  recusa `overdue → suspended` sem um `invoice_events.type =
  'final_warning_delivered'`. Sem aviso entregue, escala pro motorista decidir.
- **G4 — rastreio só em foreground, só durante rota `in_progress`.** GPS nunca
  roda fora de rota ativa nem em background (LGPD de localização de criança).
- **G5 — endereço/dados nunca expostos a responsável não vinculado.** RLS
  restringe a linha ao motorista dono e aos responsáveis vinculados.
- **G6 — motorista escolhe como o pai acompanha:** **Mapa** (GPS ao vivo) OU
  **Linha do tempo** (paradas, sem GPS). No modo Linha do tempo o banco **nunca**
  entrega `live_positions`. Imposto por RLS.

## Schema e guardas no banco

`supabase/migrations/` — schema completo com as guardas **impostas no banco**:
16 tabelas + índices, RLS habilitado em todas (fecha por padrão), trigger de G3,
RLS de G4/G5/G6, e funções `SECURITY DEFINER` (`accept_student_invite`,
`get_active_journey`, `register_occurrence`, `get_suspension_review`,
`apply_route_review`).

> **Nota de migration:** a função de notificação teve um bug de cast na migration
> 14, corrigido forward-only na 15 (`create or replace`). Recriar o banco do zero
> passa por um estado intermediário antes da 15 corrigir — funciona, mas é bom
> saber.

## App (PWA — Next.js)

Mobile-first, App Router + TypeScript + Tailwind v4 + `@supabase/ssr`.
Cabeçalho das telas com fundo branco e título em azul-marinho; exceção é o modo
direção (cabeçalho escuro imersivo). Ícones **lucide-react**, nunca emoji.

```
src/
  middleware.ts              # renova sessão + protege rotas privadas
  lib/
    supabase/{client,server,middleware}.ts   # clientes SSR
    auth.ts                  # getCurrentUser() lê o papel de public.users
    money.ts                 # helpers de centavos
    actions/                 # server actions (auth, students, routes, drive,
                             #   invoices, occurrences, absences, invite, review…)
  components/                # BottomNav, RouteBuilder, DriveScreen,
                             #   FinanceiroPanel, JourneyTimeline, ui, ...
  app/
    login/ , cadastro/       # e-mail/senha, sem biometria
    convite/[token]/         # aceite de convite do responsável
    (driver)/motorista/...   # guarda de papel = driver
    (guardian)/responsavel/… # guarda de papel = guardian
```

### Rodar localmente

```bash
npm install
cp .env.local.example .env.local   # preencher URL + chaves do Supabase
npm run dev
```

> Sem `.env.local` preenchido o app **não sobe** — o middleware valida a sessão a
> cada request e precisa da URL/chave do Supabase.

O projeto Supabase ("Kangu App", região sa-east-1) já existe, com as migrations
aplicadas e o roteiro de teste das guardas rodado e passando. Chaves no formato
novo (publishable / secret); a secret vai sem prefixo `NEXT_PUBLIC_`, e
`.env.local` está no `.gitignore`.

Para desenvolver contra um stack local (Postgres + Auth via Docker):

```bash
supabase start          # sobe Postgres/Auth locais
supabase db reset       # aplica as migrations do zero no banco local
```

> **Nota de segurança:** `npm audit` aponta CVEs no `postcss` (dependência de
> build-time do Next, não de runtime; exigem CSS malicioso — não se aplica). O
> fix força `next@16` (breaking); não aplicar por ora.

## Fora do escopo da v1

Marketplace/matching, contrato digital, otimização de rota, rastreio 24h/
background, Navigation SDK, "hora de sair" com trânsito, histórico de trajeto,
código/QR de embarque, upload de CNH, pagamento parcial/cartão/boleto, assinatura
do motorista dentro do app, e o webhook automático do Asaas (schema pronto;
pós-piloto). Ver [`docs/progresso.md`](docs/progresso.md) seções 3 e 8.

## Próximo

Não falta bloco de produto. Antes do piloto: **testes manuais do Abner** (fotos,
financeiro, "Suspensões a revisar") e **validação de LGPD** (modelagem
controlador/operador com profissional, antes de dado real de criança). Depois:
piloto com 1–3 motoristas conhecidos (Pix manual), e então webhook Asaas +
WhatsApp real (N8N).

O teste das guardas do Modo Mapa está versionado em
[`docs/tests/modo_mapa_guardas.sql`](docs/tests/modo_mapa_guardas.sql) (RLS G4/G6/G5)
e `tests/geo.test.ts` (gate de G4 no cliente; roda com `node --test`).
