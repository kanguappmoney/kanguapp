# Kangu — Progresso e Escopo (fonte de verdade)

> Este documento é a **âncora de escopo** do projeto Kangu. Agora vive
> **versionado dentro do repositório** (`docs/progresso.md`) e é a referência de
> contexto e regras a cada nova sessão com o Claude Code. O código mostra *o quê*;
> este documento guarda *o porquê* — decisões, limites de escopo e as razões das
> guardas. Onde o texto de um mockup contradiz este documento, **vale este
> documento**.

---

## 1. Identidade do produto

App **B2B2C de gestão de transporte escolar**. Roda como **PWA** (sem app nativo).

- O **motorista de van é o cliente pagante** (assinatura da plataforma).
- Os **pais/responsáveis são convidados pelo motorista**, apenas para acompanhar
  o filho. Não se cadastram sozinhos.
- **NÃO é marketplace** na v1 — o motorista já chega com a carteira de alunos
  dele; a plataforma não faz o encontro entre motorista e pais.
- No piloto, a Kangu **não intermedia fundos**: o pai paga o motorista direto
  (Pix), e o app só **rastreia** quem pagou. Por isso "A receber", nunca
  "repasse".

**Builder:** Abner (marca dom hub), empreendedor solo, região ABC / Mauá-SP,
desenvolvendo com o Claude Code. Segundo projeto após o CHAMA (marketplace PWA
já lançado).

**Nome:** Kangu (com K). Guia de marca antigo veio com grafia errada "Cangu" —
pendência de arte, não afeta código.

**Identidade visual:**
- Cores: Amarelo `#FFD000`, Azul-marinho `#0D1B3D`, Cinza claro `#F2F4F7`,
  Branco `#FFFFFF`.
- Fontes: títulos **Poppins SemiBold**, corpo **Inter Regular** (Google Fonts).
- Logo em 3 versões (ícone do canguru no quadrado amarelo; horizontal;
  vertical).
- Cabeçalho das telas = **fundo branco**, título em azul-marinho (o marinho é a
  cor do texto, não do fundo). Exceção: o **modo direção** (rota rodando) usa
  cabeçalho escuro imersivo, de propósito.
- Ícones: **lucide-react** (linha), nunca emoji.

---

## 2. As guardas inegociáveis (G1–G6)

Regras internas de segurança. **Somem da UI** (o usuário não vê a sigla). Onde
possível, são impostas **no banco** (trigger/RLS/função `SECURITY DEFINER`),
não só na tela — assim são à prova de bypass. "G" é reservado às guardas;
grupos de aluno se chamam "Turma", nunca "G1".

- **G1 — nunca bloquear a volta de quem embarcou.** Se a criança embarcou, ela
  volta pra casa, aconteça o que acontecer com o pagamento. Inadimplência nunca
  tira a volta.
- **G2 — motorista sempre confirma antes de sair.** Nada é pulado sem o toque
  do motorista. Tela "Revisão de hoje" + botão "Levar mesmo assim". Nada é
  removido no meio de uma execução em andamento.
- **G3 — suspensão só com aviso *entregue*.** Se a entrega do aviso falha,
  escala pro motorista decidir — nunca suspende automático às cegas.
- **G4 — rastreio só em foreground, só durante rota ativa.** GPS nunca roda
  fora de uma execução `in_progress`, nem em background. (LGPD de localização
  de criança.)
- **G5 — endereço/dados nunca expostos a responsável não vinculado.** Imposto
  por RLS.
- **G6 — motorista escolhe como o pai acompanha:** modo **Mapa** (GPS ao vivo)
  OU modo **Linha do tempo** (progresso por paradas, canguru na barra que só
  avança na confirmação de parada, sem GPS, contagem anônima "X de N"). No modo
  Linha do tempo o banco **nunca** entrega `live_positions`. Imposto por RLS.

**Status das guardas:** G3, G4, G5, G6 provadas em teste nos blocos anteriores.
G1 e G2 provadas no bloco financeiro (teste 7/7). **Todas as seis ativas e
provadas.**

---

## 3. Decisões travadas

**Financeiro**
- Fatura **por aluno** (não por responsável). Sem pagamento parcial (trata como
  não pago).
- Dois fluxos de dinheiro, separados: (1) **assinatura do motorista → Kangu**
  (receita da plataforma) — **fora do app no piloto**, cobrada offline; só um
  campo de status (ativa/trial/pausada) no perfil. (2) **mensalidade dos pais →
  motorista** (por aluno) — é o que o app gerencia.
- **Pix manual no piloto** (Opção B — motorista marca "pago" à mão). Schema e
  máquina de estados já prontos para o webhook do Asaas depois.
- Máquina de estados da fatura: `pending → overdue → suspended → paid`
  (+ `canceled`). Tolerância mínima = 2 dias (piso).
- `pending → overdue`: **botão manual** "atualizar vencidas" no piloto (sem
  cron; lógica pronta para virar tarefa agendada depois).

**Provedores**
- Pagamento: **Asaas** (CNPJ da dom hub, nunca CPF). Webhook só depois do
  piloto. Reaproveita padrão N8N.
- Mapa: **Mapbox** (não Google — mudança de preço do Google em 2026). No v1 NÃO
  usar Navigation SDK (cláusula de dados/LGPD); só mapa + posição.

**Cadastros**
- Aluno: cadastro completo (nome, data de nascimento, responsável com
  nome/telefone/WhatsApp/e-mail, escola + **endereço da escola**, ano/turma,
  turno **Manhã/Tarde/Integral**, horário de entrada e saída, embarque e
  desembarque separados) + tela de editar. **Todos os campos obrigatórios,
  exceto a foto.**
- A jornada da criança tem 3 pontos: **Embarque** (casa) → **Escola** (endereço
  da escola) → **Desembarque** (volta à tarde, com toggle "mesmo endereço").
- Motorista: perfil completo (telefone, endereço, veículo placa/modelo/ano/cor/
  vagas, foto, toggle G6). **SEM CNH** e **sem verificação de documentos** (fora
  do v1 por LGPD; piloto com motorista conhecido). **Sem estrelas/avaliações**
  (não é marketplace).
- **Foto** = passo isolado, bucket **privado** + RLS espelhando G5 + teste
  dedicado de acesso recusado. Foto de criança é dado sensível.

**Removidos do v1** (não adiados por preguiça — decisão de escopo)
- Código/QR de embarque (fricção no portão). Embarque = um toque do motorista.
- Upload de CNH / verificação de documento.
- Notificação de "hora de sair" com trânsito (fase 2, depende do Mapbox).
- Pagamento parcial, cartão/boleto (Pix-only no piloto).
- Assinatura do motorista dentro do app (offline no piloto).
- Webhook automático do Asaas (schema pronto; pós-piloto).

**Notificações**
- No piloto o canal é **in-app + o motorista avisa na mão (WhatsApp)**. O app
  registra o evento.
- **WhatsApp real é a 1ª tarefa da fase 2.** No piloto, o aviso in-app depende
  do pai abrir o app; o fallback é combinado na mão com os motoristas.

---

## 4. O que está construído (por bloco)

Método aplicado: **build → validate → then scale.** Uma fatia por sessão,
validada e commitada antes da próxima. RLS/guardas entram no dia 1, não no
acabamento. Guardas provadas por teste, não presumidas.

- **Fundação** — Next.js PWA + TypeScript + Supabase (@supabase/ssr), auth dois
  papéis (driver/guardian, sem biometria, pai só por convite).
- **Cadastro + convite** — wizard de aluno em 3 passos (Dados / Escola / Rota),
  lista e detalhe, convite por aluno (uso único, expira 14 dias, funções
  `SECURITY DEFINER`), consentimento LGPD (Termos obrigatório).
- **Operação de rota + Linha do tempo (G6)** — criação de rota, modo direção
  (embarque/desembarque num toque, encerrar com checklist), Revisão de hoje
  (G2), Linha do tempo do pai (barra por paradas, canguru, agregados anônimos
  "X de N" via `get_active_journey` — G5 preservado).
- **Foto (aluno e motorista)** — bucket privado + RLS espelhando G5, upload com
  preview, exibição por URL assinada no detalhe do motorista e na home do pai.
  Testes de acesso recusado passando (não-vinculado, anônimo, URL pública
  direta).
- **Perfil do motorista** — dados, veículo, stats reais, toggle G6, status de
  assinatura. Sem CNH, sem estrelas.
- **Ausências e ocorrências** — (1) ausência declarada pelo pai (dia + trajeto),
  desfazer travado depois que a rota começa; (2) ocorrência do motorista com
  fan-out via `SECURITY DEFINER` (valida dono, notifica só pais vinculados,
  texto genérico — G5); (3) avisos in-app do pai com contador de não-lidos.
- **Financeiro (3 fatias)** — (1) mensalidade por aluno, geração de faturas
  (idempotente por mês), "A receber", marcar pago; (2) vencimento, régua, aviso
  definitivo com G3, suspensão/reativação; (3) G1/G2 na Revisão de hoje
  ("Suspensões a revisar", inclusão forçada da volta de quem embarcou, "Levar
  mesmo assim", auditoria via `route_events`). Guardas G1/G2/G3 provadas.
- **Modo Mapa (Mapbox)** — GPS ao vivo do motorista ao pai por **polling** de
  `live_positions` (sem websocket), mostrando **só o pino do motorista** se
  movendo — nunca marcadores de parada (isso vazaria endereço de criança, G5). O
  motorista emite a posição só com a rota `in_progress` e a aba em foreground
  (G4 no cliente), com throttle de custo (máx. 1x/~10s e só se moveu > ~20m).
  **Minimização de dado:** em modo Linha do tempo o GPS nem é coletado — a RLS
  descartaria de qualquer forma, então não se grava o que não se serve. O
  `mapbox-gl` é lazy-loaded (não pesa no bundle do modo Linha do tempo). Guardas
  **G4/G6/G5 provadas em teste no banco** (`docs/tests/modo_mapa_guardas.sql`);
  o gate de G4 no cliente tem teste unitário (`tests/geo.test.ts`).

**Verificações que ficaram "build-validated"** (miolo provado em teste; falta
o clique manual do Abner): upload real de foto (diálogo de arquivo do SO não é
automatizável), navegação visual do detalhe da mensalidade/régua e da seção
"Suspensões a revisar".

---

## 5. Schema (resumo)

Tabelas: users, driver_profiles (+ `parent_tracking_mode`, `subscription_status`,
`default_tolerance_days`, `address`, `photo_path`), vehicles (+ model/year/color),
students (+ `monthly_fee_cents`, `school_address`, `pay_status` derivado
ok/at_risk/blocked, campos completos de cadastro), guardians, guardian_student,
routes, route_stops, route_executions, route_events (inclui `stop_skipped_billing`
e `stop_forced_driver_override`), live_positions (upsert por rota, não histórico),
absences, occurrences, invoices, invoice_events (sustenta G3), notifications,
student_invites. Consentimento LGPD em users.

Guardas no banco: trigger `enforce_invoice_transition` (G3), RLS de
live_positions (G4/G6), RLS de endereço (G5), funções `SECURITY DEFINER`
(`accept_student_invite`, `get_active_journey`, `register_occurrence`,
`get_suspension_review`, `apply_route_review`).

**Nota de migration:** a função de notificação teve um bug de cast (`in_app` sem
cast para o enum) na migration 14, corrigido forward-only na 15 (`create or
replace`). Se o banco for recriado do zero, passa por um estado intermediário
antes da 15 corrigir — funciona, mas é bom saber.

---

## 6. Infra

- Projeto Supabase "Kangu App" (região São Paulo, sa-east-1). Migrations
  aplicadas. Roteiro de teste das guardas rodado e passando.
- Chaves no formato novo (publishable / secret). Secret sem prefixo
  NEXT_PUBLIC_; `.env.local` no `.gitignore`.
- Conta GitHub `kanguappmoney`. Contas em e-mails próprios da Kangu.
- **Atenção:** o `README.md` do repo está **desatualizado** — as "pendências"
  que ele lista (criar Supabase, aplicar migrations, preencher env) já foram
  resolvidas. O estado real é o dos commits e migrations, não o do README.

---

## 7. Formalização / LGPD (radar)

- CNPJ hoje é **MEI** (serve pro piloto). Revisar com contador: teto MEI
  (~R$81k/ano → migrar para ME ao crescer) e objeto social (software/
  intermediação nas ocupações permitidas).
- Modelagem LGPD: motorista = controlador do dado; plataforma = operador.
  **Validar com profissional antes de rodar com dado real de criança.**

---

## 8. O que falta (antes do piloto)

Com o Modo Mapa concluído, **todos os blocos de produto estão construídos**. O que
falta é validação, não código:

- **Testes manuais do Abner** — fotos, financeiro, "Suspensões a revisar".
- **Validação de LGPD** — modelagem controlador/operador revista com profissional
  **antes de rodar com dado real de criança** (ver seção 7).
- **Piloto** — 1-3 motoristas conhecidos, Pix manual. Depois: webhook Asaas,
  WhatsApp real (N8N).

**Fora do Modo Mapa v1** (fase 2, decisão de escopo): Directions/traçado de ruas,
Navigation SDK, "hora de sair" com trânsito, histórico de trajeto, geocoding de
endereços (e, portanto, marcadores de parada no mapa).

---

## 9. Log de sessões

- **Sessões 1–N (anteriores):** escopo, mockups, infra (Supabase/Vercel/GitHub),
  schema com RLS, teste das guardas G3–G6. Fundação, cadastro+convite, operação
  de rota + Linha do tempo. (Resumo compactado.)
- **Sessão atual:** cadastro de aluno encorpado (campos completos + endereço da
  escola + obrigatoriedade + ícones lucide + cabeçalho claro); foto de aluno e
  de motorista (bucket privado + RLS + testes de acesso recusado); perfil do
  motorista; bloco de ausências e ocorrências (3 fatias); bloco financeiro (3
  fatias, guardas G1/G2/G3 provadas). README atualizado e `progresso.md`
  versionado em `docs/`. **Modo Mapa concluído** (polling de `live_positions`, só
  o pino do motorista, G4 no cliente + minimização de dado no gate, `mapbox-gl`
  lazy-loaded; guardas G4/G6/G5 provadas em teste no banco). Com isso o app fica
  **completo para o piloto** — faltam só os testes manuais do Abner e a validação
  de LGPD antes de dado real de criança.

> Ao fim de cada sessão, atualizar o log e as seções afetadas.
