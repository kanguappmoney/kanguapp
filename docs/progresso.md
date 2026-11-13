> ⚠️ **PARE — não leia este arquivo inteiro.** Ele é o histórico completo (muito longo).
> Para começar qualquer sessão, leia **`docs/estado-atual.md`**. Aqui, consulte só o trecho
> que a tarefa precisa, por busca (grep pelo assunto, seção, migration ou data).

**Login:** reescrito conforme o brief — hero amarelo sólido com a marca (o símbolo é amarelo, então vai num selo branco para não sumir no fundo) e card branco com o formulário embaixo; formulário e links intactos. Fecha as 3 camadas em todo o app.# Kangu — Progresso e Escopo (fonte de verdade)

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

- **Link de captação (4 fatias)** — inverte o cadastro: o pai cadastra o próprio
  filho e o motorista só aprova. (1) motorista gera link **reutilizável e
  revogável** por (turno + escola), com `'integral'` novo no enum de turno; (2)
  formulário público em `/captacao/<token>` — o pai cria conta (guardian) **atrás
  do token válido** (não é cadastro solto), aceita os Termos (LGPD) e envia à fila
  `pending` (staging `capture_submissions`, nunca `students`); (3) geocoding do
  endereço de casa (Mapbox Geocoding grava `pickup_lat/lng`); (4) **fila de
  aprovação (portão G5)** — só na aprovação consciente do motorista a criança
  vira `students` active e o pai é vinculado; rejeitar não cria nada. Guardas
  provadas em teste no banco (owner-only do link; G5 da fila; link revogado
  recusa; só responsável envia; e o portão: sem aprovar nada entra, B não aprova
  link de A, rejeitado sem aluno, aprovado vira aluno vinculado).

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
routes (+ `weekdays smallint[]` ISO dow, recorrência), route_stops,
route_executions, route_exceptions (skip/extra por data — exceções da recorrência),
route_events (inclui `stop_skipped_billing` e `stop_forced_driver_override`),
live_positions (upsert por rota, não histórico), absences, occurrences, invoices,
invoice_events (sustenta G3), notifications, student_invites. Consentimento LGPD em
users.

Tabelas de referência (cobertura guiada, migrations 044–046): `cities` (645 municípios de SP, IBGE),
`schools` (30.746 escolas de SP, INEP Censo 2024, `city_id` → cities) — ambas leitura pública, escrita só
por script com chave de serviço — e `neighborhoods` (pool de bairros por cidade, leitura authenticated,
escrita só por `add_neighborhood`).

Guardas no banco: trigger `enforce_invoice_transition` (G3), trigger
`enforce_route_stops_frozen_while_running` em route_stops (G2 na edição de rota —
congela as paradas enquanto uma perna roda), trigger `normalize_boarding_metadata`
em route_events (auditoria do embarque a 100m — canoniza `forced`/`distance_m` e,
por NUNCA recusar, é incapaz de bloquear um embarque: G1), RLS de live_positions
(G4/G6), RLS de endereço (G5), RLS dono-only em route_exceptions, funções
`SECURITY DEFINER` (`accept_student_invite`, `get_active_journey`,
`register_occurrence`, `get_suspension_review`, `apply_route_review`) e a função
`route_runs_on(route, date)` (recorrência: dia da semana + exceções).

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
- **Motivo de exceção de rota (`route_exceptions.reason`) — texto livre.** Hoje só
  visível ao motorista (RLS dono-only). **Antes** de qualquer fatia da fase 2 que
  exponha esse texto ao pai (ex.: notificação "rota não roda hoje: <motivo>"),
  revisar: o motorista pode digitar dado sensível sem pensar (ex.: motivo de saúde
  da criança). Se for exibir, tratar como dado do pai/criança — não repassar o texto
  cru, ou pedir consentimento/curadoria. Mesma cautela vale para o `reason` de
  ausência e o texto de ocorrência, se algum dia virar visível além do genérico.
- **IP no log de buscas do marketplace (`marketplace_search_log.ip`) — cobrir na revisão jurídica geral,
  antes do piloto (NÃO é frente de código própria).** O IP é dado pessoal. Hoje: guardado por **30 dias** e
  zerado automaticamente depois (a busca, sem IP, permanece), visível só ao admin, usado só para enxergar abuso
  (raspagem do telefone dos motoristas) — sem bloqueio automático. Pontos a fechar com o profissional:
  (1) **base legal** para reter o IP por 30 dias (candidata: legítimo interesse de segurança/prevenção a abuso,
  com teste de proporcionalidade — ou outra que o jurídico indicar) e se 30 dias é o prazo adequado;
  (2) **necessidade de aviso na política de privacidade** (`/privacidade` hoje é rascunho) dizendo que o IP é
  registrado nas buscas públicas, para quê e por quanto tempo; (3) se a busca pública sem login precisa de aviso
  na própria tela (`/buscar`) além da política. Se a conclusão for retenção menor ou nenhuma, é só trocar o
  prazo (30 dias na migration 043) ou parar de enviar o IP (`logSearch` em `lib/marketplace`) — sem refazer o resto.

---

## 8. O que falta (antes do piloto)

Com o Modo Mapa concluído, **todos os blocos de produto estão construídos**. O que
falta é validação, não código:

- **Testes manuais do Abner** — fotos, financeiro, "Suspensões a revisar".
- **Validação de LGPD** (inclui: base legal para reter IP por 30 dias no log de buscas + aviso na política de privacidade — seção 7) — modelagem controlador/operador revista com profissional
  **antes de rodar com dado real de criança** (ver seção 7).
- **Piloto** — 1-3 motoristas conhecidos, Pix manual. Depois: webhook Asaas,
  WhatsApp real (N8N).

### Pendências em aberto (atualizado 2026-11-01, 2ª rodada)

Resolvido e **retirado daqui**: R10 (volta sem "Ausente" para quem embarcou), R8 (thumb do
DragConfirm), R6 (cabeçalho fixo + Configurações), dívida do `today()` em UTC (app + banco,
migration 033), auto-recolher do bottom sheet (visto com geo simulada), número real do WhatsApp de
suporte, push/deploy da 1ª rodada, **portão de perfil completo** (migration 034) e **R11 — painel
financeiro + despesas** (migration 035).

**Antes do piloto**
- **Push / deploy da 2ª rodada:** as migrations **034 (prefixo) e 035 (despesas) já estão no banco**,
  mas os commits do portão de perfil e do R11 **ainda não foram para o `main` remoto**. São mudanças
  aditivas (coluna nova nullable, tabela nova): o app publicado segue funcionando, só não tem as
  telas novas até o push.
- **Prefixo do veículo** — a conta de teste (`house@domhub.com`) está **sem prefixo**, então cadastrar
  aluno, gerar link e enviar convite ficam bloqueados até preencher em Configurações → Editar perfil.
  Todo motorista que já tinha cadastro cai no mesmo aviso.
- **Testes manuais do Abner** — fotos, financeiro, "Suspensões a revisar".
- **Validação de LGPD** com profissional antes de qualquer dado real de criança (seção 7) — inclui o ponto do **IP retido por 30 dias no log de buscas** (base legal + aviso na política de privacidade).
- **Device real com GPS em movimento** — confirmar a câmera seguindo o rumo (bearing) e o
  auto-recolher do sheet por distância fora da simulação.

**Lacunas conhecidas (sem bloqueio)**
- **Sininho do motorista vazio por desenho** — nada gera `notifications` para o motorista ainda
  (o único gerador, `register_occurrence`, escreve para os pais). O badge com contagem > 0 nunca
  foi visto na tela. Definir quais eventos notificam o motorista quando houver demanda.
- **Região da Vercel → `gru1` (2026-11-02): FEITO e no ar.** `vercel.json` com `"regions": ["gru1"]`
  (commit `ad2a6b5`), push de tudo para o `main` (`09a5e25`, `1234a75`, `1a03cbc`, `9aa3a4e`, `ad2a6b5`) e
  deploy de produção concluído. Cabeçalho agora `x-vercel-id: gru1::gru1::…` (antes `gru1::iad1::…`).
  **Baseline SEM login** (`/convite/<token-inexistente>`, 10 rodadas, `curl`): `iad1` mediana ~714 ms
  (489–1465) → `gru1` mediana ~160 ms (108–350), ~4,5× menor. Medição COM login das 3 telas
  (alunos, home, Modo Direção) — **decisão do Abner (2026-11-02): medição logada dispensada.** A
  baseline sem login (714 → ~160 ms) é confirmação suficiente do ganho da região; o "antes" logado em
  `iad1` nunca foi tirado, então não haveria comparação limpa. **Frente FECHADA.** A validação visual
  das 3 telas (e do esqueleto com prefetch em produção) fica para os testes manuais já pendentes do Abner.
  **Instalação do PWA + página pública `/baixar`: PRONTO (validado no navegador; instalação real
  PENDENTE de device).** **Auditoria antes de mexer:** já existiam `manifest.webmanifest`, `sw.js`
  mínimo (fetch vazio, suficiente p/ instalabilidade), `RegisterSW`, ícones 192/512/apple-touch 180 e
  as meta tags (`manifest`, `apple-touch-icon`, `appleWebApp`, `theme-color`, viewport). **Faltava:**
  (1) ícone **maskable de verdade** — o "maskable" era o mesmo 512 `any` com cantos transparentes
  (o Android recorta e preenche com preto/branco); (2) **apple-touch-icon opaco** (o de 180 tinha
  cantos transparentes → o iOS pinta de preto); (3) manifest sem `id`/`scope`/`lang`; (4) `/baixar`
  não era pública; (5) a página. **Feito:** ícones maskable 192/512 (tela cheia amarela, canguru na
  zona segura de 76%) e apple-touch 152/167/180 sem transparência, gerados do ícone oficial; manifest
  com `id`, `scope`, `lang`, `categories` e `background_color` amarelo (splash do Android); `/baixar`
  em `PUBLIC_PATHS`; `lib/platform` (detecção por UA, iPadOS "Macintosh + toque" = iOS; testes em
  `tests/platform.test.ts`, 5/5) e `components/InstallGuide`: **Android** → botão "Instalar o Kangu"
  via `beforeinstallprompt` (evento guardado, `prompt()` no toque) com passo a passo manual como
  fallback; **iOS** → Safari → Compartilhar → Adicionar à Tela de Início (ícones lucide `Compass`/
  `Share`/`SquarePlus`) + aviso se não for Safari; **desktop** → "abra no celular"; "já instalado"
  se `display-mode: standalone`. `?so=ios|android|desktop` força a visão (só apresentação).
  **Validado:** manifest carrega e todos os 4 ícones respondem 200 com o tamanho declarado; SW
  `activated`; meta tags corretas (uma `mobile-web-app-capable` — a duplicata que eu tinha criado foi
  removida); `/baixar` abre sem cookie (200, sem redirect); UA Android → Android, desktop → desktop,
  iOS via `?so=ios` + UA de iPhone/iPad em teste unitário; `beforeinstallprompt` sintético mostra o
  botão e chama `prompt()` uma vez; tsc limpo, console sem erros. **PENDENTE do Abner (device real):**
  (a) Android/Chrome — o prompt nativo aparecer e o app instalar com o ícone maskable bem recortado
  e splash amarela; (b) iPhone/Safari — o passo a passo bate com os menus do iOS atual, o ícone na
  tela inicial sai amarelo sem cantos pretos e o app abre em tela cheia (standalone); (c) abrir
  `/baixar` por um navegador dentro de app (Instagram/WhatsApp) e ver o aviso "abra no Safari".
  Fora de escopo: cache/offline (SW segue mínimo), link para `/baixar` dentro do app/na tela de login.
  **Marketplace — Frente C (perfil público do motorista): PRONTA** (frente C de um bloco maior; a
  busca pública / leitura anônima é a frente seguinte e NÃO foi iniciada). **Migration 036** (aplicada
  pelo SQL Editor; catálogo confirma 10 colunas, bucket, policy e check): `driver_profiles` ganhou
  `service_cities`, `service_neighborhoods`, `service_schools` (texto livre, **sem normalizar** — mesma
  decisão da R11), `age_min`/`age_max` (0–30), `service_shifts student_shift[]` (manhã/tarde/integral),
  `price_min_cents`/`price_max_cents` (faixa PÚBLICA de referência, **independente** de
  `students.monthly_fee_cents` — o valor real por aluno), `marketplace_listed` (nasce `false`) e
  `van_photo_path`; check `driver_profiles_marketplace_ranges` (mín ≤ máx, preço > 0). Tudo nullable/
  default — motoristas antigos seguem válidos. **Nenhuma policy nova em `driver_profiles`:** a leitura
  segue self/vinculado, então o **endereço residencial NÃO fica público** por esta frente (a regra da
  seção 10 vale para a frente da busca: usar projeção/visão separada, nunca `select *`). **Bucket
  `van-photos` PÚBLICO** (distinto do privado `driver-photos`, que segue `public=false`): só JPG/PNG/WebP,
  até 5 MB; escrita dono-only por RLS (pasta = `auth.uid()`); sem policy de SELECT p/ anônimo (a URL
  pública serve o arquivo, mas ninguém lista o bucket). Upload (`VanPhotoUploader`) usa **caminho novo a
  cada envio** (`<id>/van-<timestamp>`) porque a URL pública é cacheada pelo CDN, e apaga a foto anterior;
  `setVanPhoto` só aceita caminho dentro da pasta do próprio motorista. UI: seção "Marketplace" em
  Editar perfil (foto da van, cidades/bairros/escolas, idade mín/máx, chips de turno, faixa de preço em
  R$, toggle) e card-resumo "Marketplace" em Configurações (foto, Aparecendo/Não aparece, faixa, cidades).
  **Validado no navegador (dev, mobile):** os campos salvam e re-hidratam (inclusive turnos e preço
  `250,00`/`400,00`); toggle liga/desliga e persiste (texto de apoio acompanha o estado); idade mín > máx
  é recusada pelo servidor com mensagem; a foto da van sobe, aparece no preview e depois no card (URL
  pública), a troca remove a anterior (URL antiga → 400) e a nova responde 200 `image/jpeg` **sem
  login**; `driver-photos` segue negando acesso público. tsc limpo, console sem erros. Dados de teste
  removidos (foto apagada pelo caminho exato; campos do perfil zerados; prefixo `TESTE-1` revertido —
  a conta de teste segue **sem prefixo**, como estava). **Decisões em aberto p/ as próximas frentes:**
  o toggle "aparecer" **não exige** nada hoje (perfil vazio pode ligar) — decidir o que é obrigatório p/
  listar (ex.: cidade + faixa + foto) antes de a busca existir; a foto da van é pública de fato — o
  aviso na tela pede para evitar placa e pessoas, mas não há moderação. Sem CNH (decisão de escopo
  mantida).
  **Marketplace — Frente D (vitrine pública anônima): PRONTA** (a tela de busca e o contato são a
  frente seguinte; nada de UI aqui). **Migration 037** (SQL Editor; catálogo confirma a função
  `SECURITY DEFINER`, `search_path` fixo, `execute` só p/ `anon`/`authenticated`): função
  `public.marketplace_listing()` — a ÚNICA porta de leitura pública dos motoristas, com **whitelist
  explícito de 13 colunas**: `driver_name`, `van_photo_path`, `van_model`, `spots_available` (capacidade
  do veículo primário − alunos `active`, calculado, piso 0; só a CONTAGEM entra, nenhum dado de aluno),
  `price_min_cents`/`price_max_cents`, `phone` (WhatsApp), `service_cities`/`service_neighborhoods`/
  `service_schools`, `age_min`/`age_max`, `service_shifts`. **Sem `select *`** em lugar nenhum e **sem
  policy nova** nas tabelas-base (anon segue sem ler `driver_profiles`/`users`/`vehicles`/`students`).
  **Nunca sai:** endereço residencial, e-mail, CNH (`document_number`), prefixo, placa, cor, id como
  coluna. Só aparece quem tem **tudo**: toggle ligado + prefixo/placa/modelo/cor (Frente A) + cidades,
  bairros, escolas, idade mín/máx, ≥1 turno, preço mín/máx e foto da van (Frente C); "preenchido" =
  não vazio após `btrim`. **Decisão minha, fora da lista pedida:** também exige **telefone** e nome —
  é o único canal de contato exposto, listar sem ele é beco sem saída (tirar é uma linha na função).
  **Teste de guarda `docs/tests/marketplace_view.sql` — 5/5 no banco** (chamando a função COMO `anon`):
  (1) completo + toggle aparece, vagas = 12 (3 ativos + 1 arquivado de 15); (2) toggle desligado não
  aparece, religar volta; (3) **19 requisitos faltando, um a um** (cidades/bairros/escolas nulos e só
  espaços, idade mín e máx, nenhum turno, preço mín e máx, foto nula e vazia, prefixo/placa/modelo/cor/
  sem veículo, telefone) — nenhum aparece, e restaurar cada um traz de volta (prova que foi AQUELE campo);
  (4) a lista de colunas da função é EXATAMENTE o whitelist e a linha de um motorista completo não
  carrega endereço, e-mail, CNH, prefixo, placa, cor, id nem nome de aluno (valores-isca no fixture);
  (5) anon não lê as tabelas-base por fora da função e a função é `SECURITY DEFINER` com `search_path`
  fixo. Fixture sintético (`...0e0001`) com rollback; banco conferido sem resíduo. **Anotação:** o
  uuid do motorista aparece DENTRO de `van_photo_path` (a policy do bucket exige a pasta =
  `auth.uid()`), por desenho — uuid não é segredo, a barreira é a RLS. **Em aberto p/ a frente da
  busca:** (a) filtros (cidade/escola/turno) devem rodar sobre ESTA função, nunca nas tabelas; (b) a
  função devolve a lista inteira — paginar/limitar antes de haver muitos motoristas; (c) assinatura
  `paused` não tira o motorista da vitrine (não foi pedido) — decidir; (d) o contato leva o telefone
  em claro p/ qualquer anônimo (é o pedido), considerar limitar raspagem em massa (rate limit na rota).
  **Marketplace — Frente E (busca pública + perfil público): PRONTA, EXCETO "Solicitar vaga" (parado de
  propósito — ver o gap abaixo).** **Banco (migration 038, commit `6db8c2a`):** `marketplace_listing(...)`
  agora filtra e pagina DENTRO da função — `p_city`, `p_neighborhood`, `p_school`, `p_child_age`, `p_shift`,
  `p_limit` (1–50, padrão 12), `p_offset`, `p_public_id` — e devolve `total_count` (janela, p/ a paginação).
  Visibilidade nova: `subscription_status in ('active','trial')` (o enum só tem active/trial/paused, não existe
  'canceled'). A regra de visibilidade ficou em UM lugar (`marketplace_visible()`, interna, **fechada** a
  anon/authenticated); listagem e opções chamam ela. `public_id` = uuid **opaco** (coluna nova, sem relação
  com o id do usuário) é o que vai na URL do perfil. **Telefone só no modo perfil** (`p_public_id`), nulo na
  listagem. Novo `marketplace_filter_options()`: as listas dos filtros vêm SÓ de motoristas visíveis.
  **Reconciliação das "listas estruturadas":** o dado é texto livre (decisão da R11), então a lista é
  DERIVADA — cada campo é cortado em vírgula/ponto-e-vírgula/quebra de linha, sem diferença de maiúsculas
  (acento conta: "Mauá" ≠ "Maua"; quem digitar diferente vira opção separada). Estruturar de verdade
  (cidade/escola normalizadas) é o "Endereço 2.0" da seção 10. **Teste de guarda `marketplace_view.sql` 7/7**
  (agora **20** requisitos um a um, somando "assinatura pausada"; `trial` e `active` aparecem; 18 combinações
  de filtro; paginação/limit/offset/total e saneamento de limit 0 e offset negativo; telefone só no perfil;
  opções só de visíveis; funções internas fechadas a anon). Achado do teste: o check 3 restaura campos com
  valores simplificados — o teste repõe o fixture antes dos filtros. **Telas (sem login, `/buscar` em
  `PUBLIC_PATHS`):** `/buscar` (filtros cidade/bairro/escola/idade/turno por GET, resultados paginados de 10,
  cards com foto da van, nome, modelo, vagas e faixa de preço; mensagem p/ página inexistente e sem
  resultado) e `/buscar/[id]` (foto, vagas, mensalidade-referência, idade, turnos, cidades/bairros/escolas e
  botão "Chamar no WhatsApp" `wa.me/55…` com texto pronto; `robots: noindex`; id inválido ou motorista oculto
  → 404). Link "Buscar motoristas" na tela de login. **Rate limit por IP** (`lib/rate-limit`, em memória, janela
  deslizante): **busca 30/min, perfil 15/min** (o telefone só sai no perfil); excedeu → página "Muitas buscas
  em pouco tempo" com os segundos de espera (status HTTP segue 200). Cards com `prefetch={false}` (prefetch
  gastaria o limite do perfil). **Limites do rate limit — dito sem enfeitar:** o contador vive na instância
  da função (na Vercel cada instância conta por si e zera no cold start) e a chave anon do Supabase permite
  chamar a função direto, fora das telas; por isso o banco também entrega o telefone um por vez. Teto firme =
  contador compartilhado (Redis/tabela) ou chamar o banco só pelo servidor com a service key. **Validado:**
  como anônimo via curl (sem redirect; 12 motoristas, 10 + 2 por página, página 3 com aviso; HTML da lista sem
  telefone; perfil com `wa.me`); no navegador (mobile) — filtro combinado Mauá + Integral + idade 15 devolve
  exatamente 3 (08, 10, 12) e preserva os campos, paginação mantém o filtro, card → perfil, link do WhatsApp com
  `target=_blank rel=noopener`; rate limit: 30 ok e a 31ª bloqueada na busca, 15 ok e a 16ª no perfil, outro IP
  não afetado; 404 p/ id inválido e inexistente. tsc limpo, console sem erros. Dados de teste (13 motoristas
  sintéticos — 1 pausado, que ficou de fora, e a foto de fixture) criados e removidos por id exato; banco
  conferido sem resíduo (0 usuários, 0 perfis, 0 veículos, 0 visíveis).
  **⛔ "Solicitar vaga" — GAP (RESOLVIDO na Frente E.1 abaixo, opção (b)).** Reconciliação com a captação atual
  (`capture_links`, migrations 020–022): o link é `(driver_id, shift, school, token, status)` — **um** turno e
  **uma** escola (texto livre) por link, `token` é segredo por design ("segredo do link /captacao/<token>"), RLS
  dono-only, e o pai só o conhece porque o motorista o **mandou** (seção 10: "ao fechar, o motorista manda o link
  de captação"). Dá para casar tecnicamente (escola + turno escolhidos na busca = link ativo do motorista com a
  mesma escola e turno, comparando texto sem caixa), **mas:** (1) a escola da vitrine (`service_schools`) e a do
  link (`capture_links.school`) são dois textos livres digitados à parte — só casam por igualdade exata, então
  muitos motoristas não teriam match; (2) rotear exige uma função nova que **entrega o token a anônimos** — vira
  público um segredo hoje privado: qualquer um com o `public_id` mandaria cadastro de criança para a fila de
  qualquer motorista (a fila exige aprovação, mas vira spam/enumeração e muda o desenho da seção 10, que põe o
  contato fora do app); (3) sem match não existe destino. **Decisão necessária (Abner):** (a) manter o contato
  fora do app (WhatsApp) e NÃO ter "Solicitar vaga" — é o que está construído; (b) link de captação
  **público opt-in** por motorista (flag "aceitar pedidos pela vitrine", um link dedicado, não o do grupo) —
  fluxo novo; (c) "pedido de contato" próprio (tabela + aviso ao motorista, sem token). Nada disso foi
  construído. **Em aberto:** link para `/buscar` além do login (ex.: `/baixar`, landing); `noindex` no perfil
  enquanto a busca não for aberta de propósito; opções dos filtros hoje listam tudo (sem busca por texto) —
  ok para poucos motoristas.
  **Marketplace — Frente E.1 ("Solicitar vaga" por link público opt-in): PRONTA — fecha o gap acima pela
  opção (b).** **Migration 039 (SQL Editor; commit `52048c9`):** `capture_links.kind` (`scoped` = o de sempre,
  turno+escola travados · `generic` = sem turno/escola, o pai preenche), com check de forma (travado exige
  turno+escola; genérico exige nulos) e **índice único parcial: no máximo UM genérico ATIVO por motorista**.
  Reaproveita token, revogação e a fila `capture_submissions` — **sem tabela nova**; `capture_submissions` ganhou
  `child_school`/`child_shift` (o que o pai escolheu no genérico). **Não existe expiração** em `capture_links`
  (só `active`/`revoked`), então o genérico segue igual — nada inventado. `submit_capture` ganhou `p_school`/
  `p_shift`: **obrigatórios no genérico, DESCARTADOS no travado** (o pai nunca troca a escola/turno do link);
  mesma validação de papel/link ativo e mesmo consentimento LGPD no formulário. `approve_capture` usa o contexto
  do link e, no genérico, o que o pai informou (`coalesce`) — o resto idêntico à 022. `get_capture_link_preview`
  devolve `kind`. **O toggle = existir um genérico ativo:** ligar cria um (token novo), desligar revoga; **revogado
  nunca ressuscita** — religar gera outro token (um vazado não volta). Default desligado. Ligar exige o portão de
  perfil completo (mesmo da Frente A). **Vitrine:** `marketplace_listing` ganhou `request_token` — token do
  genérico ATIVO, **só no modo perfil**; nulo na listagem, nulo sem genérico, e **nunca o de um link travado**.
  É a única via em que um token chega a um anônimo, e é opt-in explícito do motorista. **App:** card
  "Receber pedidos pela vitrine" em Configurações (`OpenRequestsToggle`; o erro do portão devolve o switch);
  `/buscar/[id]` mostra "Solicitar vaga" (→ `/captacao/<token>`) só se houver genérico ativo, com o WhatsApp
  logo abaixo; sem ele, só o WhatsApp (sem quebrar a tela); `/captacao/<token>` genérico mostra "Peça uma vaga
  com <motorista>" e libera **Escola** (texto) e **Turno** (obrigatórios) em vez do card travado; a fila
  "Cadastros a aprovar" mostra "Escola · Turno (informado pelo pai)"; `/motorista/alunos/captacao` lista só os
  travados (o genérico tem toggle próprio). **Testes de guarda:** `docs/tests/captacao_generica.sql` **7/7**
  (forma de cada tipo; um genérico ativo por motorista; genérico exige escola E turno e grava na fila `pending`;
  travado descarta escola/turno do pai; genérico revogado recusa; aprovação do genérico usa escola/turno do pai e
  a do travado segue usando os do link; `request_token` só no perfil/genérico ativo/some ao revogar) e
  `marketplace_view.sql` **7/7** de novo (contrato de colunas agora com `request_token`; a função foi recriada).
  **Validado no navegador:** toggle sem prefixo → recusa com "falta: Prefixo" e o switch volta; desligado → perfil
  público só com WhatsApp; ligado pelo clique → perfil mostra "Solicitar vaga" + WhatsApp e o clique leva ao link
  certo; HTML anônimo do formulário traz escola, turno, nome da criança, conta e aceite de Termos; pedido na
  fila aparece com "(informado pelo pai)" e o motorista aprova pela tela → aluno `active` com a escola/turno do
  pai e responsável vinculado (conferido no banco); desligar → botão some e o link antigo mostra "revogado".
  tsc limpo, console sem erros. **(Resolvido no teste manual abaixo.) Antes, NÃO feito pela interface:** o ENVIO do pai pelo formulário (exigiria criar conta
  de responsável em produção pela UI) — o envio está provado no banco (teste 7/7, chamando `submit_capture` como o
  responsável) e, na validação visual, o pedido foi inserido por SQL numa conta sintética; o clique real do pai
  fica nos testes manuais do Abner. Dados de teste removidos (aluno, submissão, responsável sintético, links
  genéricos, foto, campos do perfil e prefixo `TESTE-1` — a conta de teste segue sem prefixo e com os 2 alunos
  originais). **Em aberto:** (a) quem chega pelo link genérico escolhe a escola em TEXTO livre — o motorista
  confere na aprovação, mas não casa com `service_schools` (Endereço 2.0, seção 10); (b) o token genérico fica
  visível a qualquer um que abra o perfil — se vazar para spam, desligar/religar gira o token; (c) sem limite de
  pedidos por IP nesse formulário (o cadastro de pai já exige conta).
  **✅ Frente E.1 — caminho COMPLETO provado pela interface (não só backend).** Teste manual ponta a ponta
  (2026-11-02), sem atalho de SQL no fluxo do pai: com o toggle ligado pelo clique no perfil de teste, o
  motorista aparece em `/buscar`; o perfil mostra "Solicitar vaga"; o clique abre `/captacao/<token>` genérico;
  **o pai criou a conta de responsável sintética pelo formulário real** (nome, e-mail, senha, aceite dos Termos),
  digitou escola e turno livres, endereço pelo autocomplete (geocodificado) e enviou — esse passo foi feito
  por **Abner**, numa janela anônima (a criação de conta e a senha não são ações que o Claude executa).
  Resultado conferido no banco: submissão `pending` criada pelo `submit_capture` real, com `child_school`/
  `child_shift` do pai; responsável com papel `guardian`, Termos aceitos e **e-mail sem exigir confirmação**
  (o Supabase do projeto está com confirmação desligada — o fluxo conclui no mesmo envio). A fila do motorista
  mostrou "Escola E2E Teste · Manhã (informado pelo pai)", data de nascimento, endereço "localizado" e telefone;
  **aprovada pela tela**, a submissão virou `approved` e o aluno nasceu `active` com a escola e o turno do pai,
  nascimento, coordenada, responsável (nome/e-mail da conta) e vínculo em `guardian_student`. tsc limpo, console
  sem erros. **Limpeza e resíduo = 0** (conferido por contagem): conta do pai em `auth.users`/`auth.identities`,
  `public.users`, `guardians`, vínculos, submissões, aluno, notificações, links genéricos do motorista de teste,
  foto, campos do perfil e prefixo `TESTE-1` — o motorista de teste voltou a ter os 2 alunos originais, 0 visíveis
  na vitrine e sem prefixo. **Achado fora do escopo (não é do fixture):** existem 3 links genéricos de OUTRO
  motorista ("Kangu App", criados 14:34–14:35 UTC: revogado, revogado, **ativo**) — alguém ligou/desligou/ligou o
  toggle nessa conta; o último segue ativo, ou seja, o perfil dele (se estiver completo e listado) mostra
  "Solicitar vaga". Não toquei; se foi teste, é só desligar o toggle nessa conta.
  **Marketplace — Frente F (área /admin somente leitura + log de buscas): PRONTA no código e no banco; ADMIN REAL SEMEADO
  (house@domhub.co).** **Allowlist por UUID, não por e-mail (decisão de
  segurança):** o projeto está com a **confirmação de e-mail DESLIGADA** (provado no teste E.1 — a conta do pai
  entrou confirmada no mesmo envio), então "e-mail = house@domhub.co" sozinho deixaria QUALQUER pessoa virar admin
  cadastrando esse e-mail antes do dono. A tabela `admin_users(user_id → auth.users)` é **fechada** (RLS sem
  policy + `revoke` de anon/authenticated: ninguém se promove nem espia por API) e a semente é manual no SQL Editor
  com o uuid da conta real. Sem UI de convite de outro admin (decisão da frente). **Migration 040** (SQL
  Editor; commit `5f898ed`): `is_admin()`, `admin_assert()` e **4 funções `admin_*`** (`SECURITY DEFINER`, colunas
  explícitas, todas começam por `admin_assert()` → `42501 'Acesso negado.'` para quem não está na allowlist;
  anon nem tem `execute`): `admin_list_drivers` (perfil completo = prefixo+placa+modelo+cor, o que falta,
  assinatura, toggle do marketplace, se **aparece de verdade** na vitrine, alunos ativos, link de pedidos aberto),
  `admin_list_guardians`, `admin_list_submissions` (fila de **todos** os motoristas, filtro de status, só nome
  da criança + escola/turno + status — **sem endereço, nascimento nem telefone**; origem "Link do motorista" ×
  "Vitrine") e `admin_list_search_log`. **Log de buscas:** tabela `marketplace_search_log` com SÓ
  `city/neighborhood/school/child_age/shift` + hora (sem IP, sem usuário, sem cadastro) — insert-only: a única
  escrita é `log_marketplace_search()` (anon pode chamar; normaliza: trim, 80 caracteres, idade fora de 0–30 →
  nulo, branco → nulo); ninguém lê/atualiza/apaga por API, só o admin lê pela função. `/buscar` registra **uma linha
  por busca nova** (página > 1 não conta; falha no log nunca derruba a busca). **App:** o **middleware** responde
  **403** (rewrite p/ `/acesso-negado`) a anônimo e a qualquer usuário fora da allowlist em `/admin/*` — não
  redireciona ao login; o **layout** de `/admin` não renderiza nada se `is_admin()` for falso (2ª camada); o
  **banco** recusa (3ª camada, a de verdade). Telas: `/admin/motoristas`, `/admin/responsaveis`,
  `/admin/captacao?status=` (paginada, **sem nenhum botão de ação** — aprovar/recusar segue sendo do motorista,
  provado no teste: o admin chamando `approve_capture`/`reject_capture` é recusado e a submissão segue `pending`),
  `/admin/buscas` (paginada). **Teste de guarda `docs/tests/admin_guard.sql` 6/6** (chamando como anon/
  authenticated): anon negado em tudo; motorista e responsável não-admin recebem "Acesso negado."; ninguém
  insere/lê/atualiza/apaga `admin_users` nem o log; admin lê as 3 listas com **colunas exatas** e sem dado
  sensível; fila é só leitura; log normaliza, só filtros + hora, só admin lê. **Validado no app:** anônimo → 403
  nas 5 rotas; **usuário real autenticado e não-admin** (`house@domhub.com`) → 403 nas 5 rotas e, chamando a
  API REST direto com o token dele, `42501 Acesso negado.` nas 4 funções e 403 nas 2 tabelas (anon: 401);
  promovido **temporariamente**, as 4 telas abriram com dado real — 5 motoristas reais (2 com perfil completo, 0 na
  vitrine; o "Kangu App" aparece ligado-mas-oculto e com link de pedidos aberto), 2 responsáveis, 6 buscas no
  log; a Captação não tinha pedido real, então 3 pedidos sintéticos (pendente/aprovado/rejeitado, 2 motoristas,
  link do motorista × vitrine) validaram o cruzamento, o filtro por status e a ausência de botões. tsc limpo; as 4
  telas não geraram erro novo no console (os 403/401 do console são das minhas sondagens de bloqueio). Dados de
  teste removidos (pedidos, link, responsável sintético, as 6 buscas e a promoção temporária) — **resíduo 0 e
  `admin_users` vazio**. **✅ Admin real semeado (2026-11-04):** a conta `house@domhub.co` foi criada por Abner pelo painel do Supabase
  (Authentication → Add user, confirmada; o Claude não cria conta nem digita senha) e semeada em `admin_users`
  por SQL (`e1d8f7af-963b-42a0-a8cf-4ee31feddd9d`; é o ÚNICO admin). Como foi criada fora do cadastro, o trigger de
  novo usuário a registrou como `guardian` (sem metadata) — irrelevante para `/admin`, que só confere a allowlist; ao
  logar nela, a home `/` leva a `/responsavel`, então o acesso é direto por `/admin`. Conferido: `house@domhub.com`
  e anônimo seguem em 403. **A senha dessa conta foi digitada no chat — trocar** (o login do admin ainda não foi
  exercitado com a conta nova: validado só o mecanismo com uma conta temporária). **Limites/em aberto:** (a) o log registra também
  bots/curl e não deduplica; (b) `log_marketplace_search` é chamável por qualquer um com a chave anon (spam de
  linhas) — tamanho limitado por coluna, sem rate limit no banco; (c) a fila admin mostra nome de criança de todos
  os motoristas (a plataforma é operadora do dado — rever na validação de LGPD, seção 7); (d) sem exportação nem
  busca por texto nas listas.
  **Modo Direção — texto do arraste fixo + R9 testado de verdade com GPS em movimento + histerese: PRONTO.**
  **(1) Texto:** o arraste agora diz SEMPRE `Embarcar <nome>` / `Desembarcar <nome>` (a frase condicional
  "Cheguei no embarque/desembarque — deslize para confirmar/mesmo assim" saiu); perto × longe vive só no estilo
  da trilha (sólida × tracejada), no `DragConfirm`; o nome cabe em até 2 linhas. **(2) R9 testado em movimento**
  (não só parado): GPS simulado na página (mock de `navigator.geolocation` movido por distância à parada, rota
  real do motorista de teste em `in_progress`, leitura do estado do painel a cada passo). Resultado do código
  ANTERIOR: recolhido de 3 km até 101 m, **expande em 99 m**, recolhe ao se afastar — o R9 estava ativo — **mas
  com o GPS oscilando em torno dos 100 m (99→105→98→103→99→104) o painel PISCAVA a cada leitura**: defeito real,
  invisível parado. **Correção:** função pura `sheetAutoTarget` em `lib/geo` com **histerese** — expande em
  ≤100 m (mesma borda do gate do arraste), só recolhe acima de 130 m, e entre 100 e 130 m é faixa morta que
  mantém o estado atual (inclusive o da mão); sem dado (sem GPS/coordenada) segue expandindo. Retestado: expande
  UMA vez ao cruzar 100 m, fica expandido por toda a oscilação (98–129 m) e recolhe só aos 131 m. **Alça manual:**
  toque real a 400 m abre e o painel FICA aberto com o GPS andando sem cruzar o limiar (390→330 m); arraste real p/
  baixo a 60 m recolhe e fica recolhido (50→90 m); cruzar >130 m (longe) ou ≤100 m (perto) reaplica o automático.
  **(3) Recolhido = "navegando até lá":** o visual já era mapa em quase tela cheia (só a faixa de ~55 px embaixo +
  barra de topo); como a faixa só dizia "PRÓXIMA <nome>" e podia parecer "aguardando ação", ela ganhou a
  **distância até a parada** (`3,0 km`, `850 m`), que acompanha o GPS. Mapa mostra a van, o pino da parada e a
  rota. Testes unitários `sheetAutoTarget` (borda 100/130, faixa morta, simulação do oscilar) → `node --test` 26/26.
  tsc limpo; sem erro de console do Modo Direção (os 403 no console são do meu `fetch('/admin')` anterior).
  Execução de teste removida pelo id exato (rota volta às 4 execuções originais, 0 em andamento). **Limite:** o
  GPS foi simulado na página; o comportamento com um GPS físico em movimento (e o bearing) segue dependendo do
  teste em device real.
  **Admin — Visão Geral + Assinaturas + Moderação (3 partes, cada uma com migration, teste de guarda e
  commit): PRONTO.** Tudo segue o padrão da Frente F: funções `admin_*` `SECURITY DEFINER` com
  `admin_assert()` (42501 'Acesso negado.', sem execute p/ anon), middleware 403 + layout; abas novas na barra
  (**Visão geral** agora é a landing — `/admin` redireciona p/ `/admin/visao-geral` —, **Assinaturas**,
  **Moderação**). **Parte 1 — Visão Geral (migration 041, `admin_overview(p_days)`, teste `admin_overview.sql`
  6/6, método baseline-delta):** cards (motoristas total e por trial/ativa/pausada; perfil completo X de Y; na
  vitrine X de Y — "aparece de verdade", pela regra única `marketplace_visible`; responsáveis ATIVOS = ≥1 aluno
  ATIVO vinculado — quem só tem aluno arquivado ou nenhum não conta; alunos ativos); **novos motoristas/
  responsáveis/alunos** nos últimos 30 dias em 6 baldes de 5 dias (fuso de São Paulo); funil do marketplace com
  período 7/30 (buscas → pedidos enviados pelo link GENÉRICO — pedido de link travado não entra — → aprovados/
  rejeitados/pendentes, com % de conversão); ranking de cidades e escolas mais buscadas (Top 5, sem diferença de
  maiúsculas: "Mauá"="mauá"); donut de assinatura. **Reuso:** `charts.tsx` (`Donut`, `MoneyBars` p/ as barras —
  o campo `cents` carrega a contagem —, `RankBars`) sem componente novo; **auto-atualização** com o `AutoRefresh`
  existente (`router.refresh`, 45 s, sem websocket; mostra a hora da última leitura). **Parte 2 — Assinaturas
  (migration 042, `admin_list_trials`, teste 4/4):** motoristas em TRIAL do mais antigo ao mais novo (ativa e
  pausada ficam fora), com dias, perfil completo, alunos ativos e se aparece na vitrine; **o tempo conta desde o
  CADASTRO** — o banco não guarda o histórico de mudança de `subscription_status`, então "há quanto tempo sem virar
  ativo" é um proxy (um motorista que foi pausado e voltou a trial aparece com a idade do cadastro); registrar a
  data da transição quando houver Asaas. **Parte 3 — Moderação (migration 043, `admin_list_van_photos` +
  `admin_search_ips`, teste 6/6):** fotos públicas das vans com preview (data = a do UPLOAD lida de
  `storage.objects`, com o `updated_at` do perfil de reserva) e Top 20 de IPs por volume de busca (7/30 dias, % das
  buscas com IP, primeira/última); **só visibilidade — nenhum bloqueio nem ação**. **⚠ MUDANÇA DE DECISÃO COM
  IMPACTO DE LGPD:** o log de buscas da Frente F era "só filtros + hora, sem IP"; para listar IPs ele **passou a
  guardar o IP** (`marketplace_search_log.ip inet`, capturado do `x-forwarded-for`). Mitigações: só endereço de
  host válido (lixo, 'unknown' e CIDR viram NULL), **retenção automática de 30 dias** (a cada busca registrada os
  IPs > 30 dias são zerados — a linha dos filtros fica, o IP some), tabela fechada a anon/authenticated (só
  `admin_search_ips` entrega o IP; `admin_list_search_log` não o devolve). Pendente de decisão jurídica: base
  legal/aviso na política de privacidade para o IP — **registrado como ponto específico da validação de LGPD
  (seção 7), junto da revisão jurídica geral antes do piloto; não é frente de código própria**. **Achado de implementação:** `IF ... <> CASE ... THEN`
  em PL/pgSQL quebra (o `THEN` do CASE é lido como o do IF → "syntax error at end of input") — o CASE vai entre
  parênteses; ficou comentado na migration. O `admin_guard.sql` foi atualizado (coluna `ip`) e **re-executado: 6/6**.
  **Validado no navegador** (conta de teste promovida temporariamente e removida depois) com dado real +
  sintético: Visão Geral — 6 motoristas (5 reais), 2 de 6 com perfil completo, 0 de 6 na vitrine, 1 de 4
  responsáveis ativos, 4 alunos ativos, 12 buscas → 3 pedidos (25%), 1/1/1 aprovado/rejeitado/pendente,
  "mauá" 8 (grafias agrupadas), escola 6; **polling provado** (a mesma página, sem reload — marcador em memória
  preservado —, subiu de 12 para 13 buscas, "Diadema" entrou no ranking e a "última leitura" andou 45 s);
  Assinaturas — 6 em trial de 69 a 0 dias, em ordem; Moderação — 2 fotos públicas carregadas (800 px) e 5 IPs
  ordenados 6/3/2/1/1. tsc limpo; as telas não geraram erro novo no console. **Dados de teste removidos
  (resíduo 0):** pedidos e usuários sintéticos, 13 buscas com IP de teste (`198.51.100.0/24`), fotos no storage,
  foto do perfil do Abner e a promoção temporária; `admin_users` = só `house@domhub.co`. **Em aberto:** (a) o
  IP vem do cabeçalho `x-forwarded-for` — atrás de proxy/CDN ele é confiável só se a Vercel for a única entrada;
  (b) IPs de rede compartilhada (escola, operadora) somam vários usuários; (c) o log continua recebendo bots
  e `log_marketplace_search` é chamável com a chave anon (spam de linhas); (d) série em baldes de 5 dias, não
  diária (a `MoneyBars` não comporta 30 barras); (e) sem exportação nem busca por texto nas listas.
- **"Placeholder de endereço"** — citado como pendência, mas sem item com esse nome neste
  documento; o mais próximo é o **Endereço 2.0** (busca de escola por nome, CEP estruturado —
  seção 10). Confirmar o que é.
- **Rota sugerida "inteligente"** — a ordem sugerida está COMPLETA; o próximo passo é o **ETA ao
  vivo durante a rota** (seção 10), ainda não feito.
- **Painel R11 — decisões a confirmar:** "Em atraso" mostra o **estado atual** (overdue+suspended de
  qualquer mês), como "A receber" — não filtra pelo mês selecionado. Frequência e atraso de rota usam
  a configuração **atual** da rota (dias da semana, paradas, horário-alvo), não a de meses
  anteriores: se a rota mudar, o histórico é recalculado com a regra nova.
- **Aprovação de cadastro vindo de captação** segue liberada com perfil incompleto (o link já passou
  pelo portão; travar deixaria o pai preso na fila). Rever se o portão deve valer ali também.
- **Histórico `supabase_migrations`** termina na 018; 019–035 foram aplicadas pelo SQL Editor.
  Reconciliar o histórico antes de usar `supabase db push`.

**Fase 2 (decidido, fora do piloto):** webhook Asaas, WhatsApp real (N8N), "hora de sair" com
trânsito, arte com a grafia certa ("Kangu", não "Cangu").

- **Rotas 2.0** — **COMPLETA** (recorrência R1→R3 + rota sugerida: coordenadas →
  número/complemento → viés de região → sugestão de ordem; ver detalhe adiante e no log).
  **Criação de rota encorpada: pronta. Execução da
  rota `'both'` por perna: pronta. Editar rota `'both'`: pronta. Home operacional
  + iniciar: pronta.** O modelo evoluiu: `route_direction += 'both'`
  — uma rota vira uma "turma" com **duas listas** (ida=pickup, volta=dropoff) numa
  entidade só; `route_stops` agora é `unique(route_id, kind, position)` (cada perna
  com ordenação própria); `routes` ganhou `shift` (turno) como âncora do filtro.
  Builder de duas listas com filtro por turno (aluno do turno + integrais) e volta
  pré-proposta como a ida invertida (editável). Modelo provado
  (`docs/tests/rotas_two_legs.sql`). **Execução por perna:** `route_executions`
  ganhou `leg` (pickup/dropoff; null=legado) e a unicidade virou dois índices
  parciais — legado 1×/dia, `'both'` com ida **e** volta no mesmo dia (pernas
  independentes: encerra a ida de manhã, inicia a volta à tarde; dia de só-volta
  roda sem travar — obrigar a ida antes seria um jeito de bloquear volta legítima,
  contra a G1). Na lista, a `'both'` mostra **dois botões (Iniciar ida / Iniciar
  volta)**, cada um com seu estado; a DriveScreen filtra as paradas pelo `kind` da
  perna; `get_active_journey` conta e lista só a perna em execução (G5 por perna);
  a Revisão (G1/G2) recorta os alunos e as ausências à perna, e a G1 ("nunca
  bloquear a volta de quem embarcou") lê o embarque da ida daquele dia ao revisar a
  volta. Ponte de compatibilidade: rotas antigas de uma perna (`outbound`/`inbound`,
  `leg` null) seguem idênticas — todo ramo novo é guardado por `leg is null`.
  Execução provada (`docs/tests/rotas_both_execution.sql`, 4/4). **Editar rota:**
  reaproveita o RouteBuilder em modo edição (carrega as duas listas do banco,
  ordenadas por perna); só rotas `'both'` (legado de uma perna não edita aqui — a
  ponte de compatibilidade fica intocada). `updateRoute` reescreve as paradas
  (delete + reinsert renumerado 1..N por perna). **Guarda G2 imposta por trigger no
  banco** (`enforce_route_stops_frozen_while_running` em `route_stops`): rota com
  perna `in_progress` hoje **congela as paradas** — insert/update/delete recusados,
  à prova de bypass (não só na server action, que ainda pré-checa p/ erro amigável;
  a UI esconde o botão Editar quando roda, conveniência por cima da lei). O trigger
  ramifica por `TG_OP` e lê `OLD.route_id` no DELETE (a 026 tinha o furo de resolver
  a rota só por `NEW`, nula no delete; corrigido forward-only na 027). Editar provado
  (`docs/tests/rotas_edit.sql`, 4/4: dono edita rota parada; B não edita rota de A
  por RLS; perna `in_progress` recusa; numeração por perna 1..N após reinserção).
  **Home operacional + iniciar:** a home do motorista deixou de ser placeholder e
  virou a tela de "começar o dia". Dois estados por dado real: **(a) ocioso** —
  saudação + chip da placa (perfil) + contadores (alunos ativos, ausências de hoje,
  paradas) + as rotas com Iniciar/Continuar por perna; **(b) rodando** — quando há
  perna `in_progress`, mostra a **próxima parada** (1ª pendente) e a **lista de
  embarque** reais daquela execução (mesma fonte do Modo Direção) + Continuar. Selo
  **Ida/Volta** no cabeçalho, no botão e no texto da lista ("embarcaram"/"desembarcaram")
  — a perna nunca fica ambígua. Nada é fabricado: sem execução, os blocos vivos
  somem (a "rota de hoje" só vira automática quando a recorrência existir). **Fonte
  única** extraída (`lib/routes-today` = rotas+execs; `lib/drive-board` = quadro de
  embarque, com a DriveScreen refatorada pra usar o mesmo helper — sem cópia
  divergente) e apresentação separada do dado (`HomeContent`, `RouteRunList`). Sem
  migration nem guarda nova: reuso de caminho de início já provado; validado visual
  (dois estados) no navegador. Gestão (criar/editar) segue na `/rotas`, com a ponte
  "Ver todas / gerenciar" na home.
  **Embarque a "100m" (G1/G2):** o botão "embarcar" libera-se (sólido) quando a van
  está a ≤100m do endereço da criança; longe, sem GPS, ou aluno sem coordenada, vira
  **"embarcar mesmo assim"** — SEMPRE disponível. O 100m é AJUDA, nunca trava:
  colocá-lo como bloqueio no banco violaria a G1 quando o GPS falha, então o gate é
  **client-side de propósito**. O banco só REGISTRA o override: `setStopState` grava
  `metadata:{forced, distance_m}` no evento `embarked`/`disembarked` — **só o escalar
  de distância, nunca a coordenada crua** (minimização, espelha o G4). A posição da
  van (`useDriverPosition`) roda na janela do G4 (in_progress + foreground) e nunca
  persiste. Guarda no banco: trigger **normalizador** `normalize_boarding_metadata`
  (canoniza `forced`/`distance_m`; por NUNCA fazer raise, é estruturalmente incapaz
  de bloquear um embarque — a segurança é a ausência de qualquer trava, não uma
  promessa). Provado: gate puro em unit (`tests/geo.test.ts`, 13/13) + banco
  (`docs/tests/embarque_100m.sql`, 3/3: G1 aceita a qualquer distância; forçado
  canônico com a distância; G5 — o pai vê "embarcou", nunca o override nem a
  distância). Migration 028 aplicada pelo SQL Editor (fora do histórico
  `supabase_migrations`, idempotente).
  **Recorrência (R1: fundação + guarda):** modelo **leve/computado** (decisão travada
  — sem cron, combina com o piloto). `routes.weekdays` (ISO dow, backfill Seg–Sex) é a
  regra; `route_exceptions(date, kind skip|extra, reason)` são os desvios esparsos
  (feriado/reposição), RLS dono-only; a função `route_runs_on(route, date)` junta os
  dois na leitura (exceção manda sobre a regra). Por rota (ida e volta compartilham os
  dias; o dia de só-volta já é a execução por perna). Execução segue criada no
  "iniciar". **Guarda (espírito do 100m): recorrência MOSTRA, nunca BLOQUEIA** — nenhum
  trigger/constraint recusa iniciar num dia fora da agenda; o motorista sempre pode
  rodar um dia extra. Provado no banco (`docs/tests/recorrencia.sql`, 6/6: regra do
  dia; skip; extra; backfill Seg–Sex; RLS dono-only; execução em dia off aceita).
  Migration 029 aplicada pelo SQL Editor. **Sem UI** nesta fatia.
  **Recorrência (R2: UI — home lê + motorista escreve): FECHADA.** Duas fatias, sem
  migration (a coluna `routes.weekdays` já existe da 029). **R2a — home filtra "Rota de
  hoje":** a home mostra só as rotas que rodam hoje pela recorrência **OU** que já têm
  execução hoje — o segundo ramo mantém visível uma rota iniciada num dia FORA da agenda
  (não some depois de começar). A `/rotas` segue listando **todas** (é lá que se inicia
  fora da agenda; nenhuma guarda recusa). Espelho JS de `route_runs_on` (`lib/recurrence`
  = `routeRunsToday`, puro), testado com os MESMOS vetores dos checks 1–4 de
  `docs/tests/recorrencia.sql` (`tests/recurrence.test.ts`, 4/4 — alarme se JS e SQL
  divergirem). **Fix lateral do UTC (não regressão):** o "hoje" do match de execução em
  `routes-today` era `toISOString()` = UTC — das ~21h à meia-noite locais o servidor
  (Vercel UTC) já virara o dia, errando `service_date` e o dia-da-semana bem na janela em
  que a volta roda. Novo helper único `lib/day` (`saoPauloDay`/`saoPauloToday` = data +
  isoDow de UMA computação, fuso `America/Sao_Paulo`) alimenta o match de execução **e** o
  `routeRunsToday` — uma definição de "hoje", incapaz de divergir entre os dois usos.
  **R2b — editar os dias no builder:** 7 toggles Seg–Dom (ISO dow 1..7, abrev. de 3 letras
  — a inicial única repetiria "S" em Seg/Sex/Sáb) na criação e na edição do RouteBuilder;
  criação nasce Seg–Sex, edição hidrata do banco; `parseWeekdays` na action (só 1..7,
  dedup, ordenado); **vazio permitido** (rota que só roda em dia 'extra') com aviso na UI —
  o banco já aceita `{}`. G2 intocada (editar segue bloqueado por perna `in_progress`).
  Validado no navegador ponta-a-ponta (remover segunda faz a rota sumir da home hoje e
  devolver a traz de volta); commits `ddfff18` (R2a) e `bba669c` (R2b).
  **Recorrência (R3: UI de exceções): FECHADA.** Fatia única, sem migration (tabela, RLS e
  `route_runs_on` já vêm da 029). Sub-tela dedicada `/rotas/[routeId]/excecoes` (link
  "Exceções" no card da `/rotas`, disponível pra QUALQUER rota e mesmo com perna rodando —
  G2 não se aplica a calendário). Form: data (min hoje), tipo Feriado(`skip`)/
  Reposição(`extra`) e motivo opcional; **sugestão contextual** — pela regra semanal o dia
  roda ou não, pré-selecionando o tipo útil (roda→feriado; não roda→reposição), via o mesmo
  `routeRunsToday` puro + `isoDowOf` (novo em `lib/day`, fonte única do date→isoDow). Actions
  `addException`/`removeException` (`lib/actions/exceptions`); a RLS dono-only é o portão real
  (não um `if`); `unique(route_id,date)` vira erro amigável. Lista só datas de hoje pra
  frente. Guarda inalterada (espírito do 100m): exceção só muda o que a home MOSTRA, nunca
  bloqueia iniciar. Validado no navegador ponta-a-ponta (sugestão vira feriado na segunda e
  reposição no sábado; `skip` de hoje derruba a rota da home; remover devolve; labels e
  `prettyDate` corretos); tsc limpo, sem erros de console. **Radar LGPD:**
  `route_exceptions.reason` é texto livre, hoje só do motorista — revisar antes de expor ao
  pai na fase 2 (ver seção 7).
  **Rota sugerida — Fatia A (fundação de coordenadas): PRONTA.** A sugestão de ordem (Fatia B)
  precisa de lat/lng de CADA ponto; sem isso ignoraria a maioria das rotas manuais (que só
  gravavam endereço-texto) — feature quebrada. Três frentes: (1) migration 030
  `students.school_lat/lng` (pickup/dropoff já existiam da 002; nullable — coordenada é
  enriquecimento, nunca trava o cadastro); (2) geocoding no cadastro manual **reaproveitando o
  AddressAutocomplete** (não cria componente): wizard novo e EditStudentForm passam a usá-lo nos
  3 endereços, o componente ganha props opcionais retrocompatíveis (`initialValue`/`initialLat`/
  `initialLng` p/ hidratar a edição preservando a coord; `onChange` p/ o "mesmo endereço"
  espelhar embarque→desembarque com a coord junto), e `students.ts` grava as 6 coordenadas
  (`numOrNull`, nunca em REQUIRED_LABELS → vazio não trava); (3) `scripts/backfill-geocode.ts`
  geocoda alunos já cadastrados sem coord, idempotente (só nulls), rate-limit 150ms, **segredos
  só do ambiente** (`--env-file=.env.local`, nada hardcoded; `scripts/` fora do tsc do Next).
  Validado nos dois caminhos (sem token degrada p/ texto e salva coord null sem crash; com token,
  o pick grava a coord, persiste e re-hidrata). Migration 030 aplicada no SQL Editor. Backfill
  `--dry`/run fica com o Abner (usa a secret key local). Commit `3f8ef38`.
  **Campo número/complemento (precisão do geocoding): PRONTO.** O Mapbox às vezes não tem o
  número exato da casa → coord no meio da rua, ruim p/ rota otimizada e gate 100m. `withNumber`
  (opcional) no AddressAutocomplete, só embarque/desembarque: sub-campo que entra na query do
  geocoding e é **concatenado ao endereço salvo** — sem coluna nova (número em campo próprio é o
  Endereço 2.0 da seção 10). Visibilidade (pedido do Abner): o sub-campo NÃO aparece ao abrir a
  edição de aluno salvo (número já embutido no texto; campo vazio confundiria), só surge quando o
  motorista mexe no endereço (`showNumber = !initialValue`). **Bug pego e corrigido antes do
  commit:** ao selecionar uma sugestão que já traz o número no place_name, o `combine` duplicava
  ("Av Paulista 1578 … , 1578") — a correção zera o sub-campo no pick (o place_name canônico já
  tem o número) e, depois do pick, tratar o sub-campo como complemento (apto/bloco) anexa ao
  texto **preservando** a coord. Sem migration, sem guarda nova. Validado ponta-a-ponta
  (edição de salvo não mostra o campo; mexer revela; pick sem duplicar; complemento preserva
  coord; espelho carrega o número). Commit `05d4879`.
  **Viés de região no geocoding: PRONTO.** O `--dry` do backfill pegou coordenadas absurdas
  (Rio, Manaus, Belém…): sem viés, o Mapbox casa a rua homônima em qualquer lugar do BR. Novo
  `lib/geo-region` (fonte única): `proximity` (bias p/ a metrópole SP/ABC) + `bbox` do estado de
  SP (filtro rígido), aplicado no AddressAutocomplete (cadastro ao vivo) e no backfill. O `--dry`
  passou a resolver tudo em-região; backfill também roda só em `status=active` (não geocoda
  arquivado). Backfill real rodado pelo Abner (7 pontos, 0 sem match); persistência conferida.
  Commit `72ac152`.
  **Rota sugerida — Fatia B (sugestão de ordem): PRONTA. FECHA A ROTAS 2.0.** Botão "Sugerir
  ordem" por perna no RouteBuilder: reordena as paradas na sequência mais eficiente como PROPOSTA
  editável — MOSTRA, nunca impõe (só mexe no array editável; o motorista ajusta com as setas;
  persiste só ao Salvar). Motor em camadas (`lib/route-optimize`): (1) **Mapbox Optimization v1**
  (client, token público — confirmado que TEM escopo de Optimization), âncora = a escola SÓ
  quando a turma toda vai pra mesma (coords iguais); escolas diferentes → TSP aberto com aviso; a
  escola entra no extremo certo (fim na ida, começo na volta). **Achado da validação:** a v1 NÃO
  aceita `source=any` com `roundtrip=false` (devolve `code:NotImplemented`) — exige
  `source=first&destination=last`, então os pontos das pontas ficam fixos e o miolo é otimizado.
  (2) **fallback vizinho-mais-próximo local** (`haversineMeters`, zero rede), determinístico,
  acionado acima do limite de 12 waypoints, sem token, ou se a API falhar. (3) alunos **sem
  coordenada** NUNCA somem nem travam o botão — vão pro fim com aviso. Os selects de aluno
  (nova/editar rota) passam a levar as 6 coords até o builder. Sem migration, sem guarda nova.
  **3 casos validados no navegador** (fixture temporária de 13 alunos, criados e removidos por id
  — banco conferido limpo): (a) feliz ≤11 com escola comum → Optimization reordena; (b) >11
  paradas → fallback local sem quebrar; (c) aluno sem coord → anexado ao fim, ninguém some. tsc
  limpo. Commit `0bb0bba`. **Com isto a Rotas 2.0 está COMPLETA:** recorrência (R1→R3) + rota
  sugerida (coordenadas → número/complemento → viés de região → sugestão de ordem). **Pendência
  anotada:** o fix do UTC ficou restrito ao `routes-today`; as outras ~8 cópias de `today()` UTC
  (drive-board, absences, invoices, revisao, alunos…) seguem para uma varredura futura — fora do
  escopo da R2/R3.
  **Polimento da home (versão enxuta): PRONTO.** Cards contadores viram atalhos (alunos →
  `/motorista/alunos`, paradas → `/motorista/rotas`); **ausências fica NÃO-clicável** de propósito
  (não tem tela de motorista — só aparece na Revisão de hoje; apontar pra `/rotas` enganaria).
  Mini-mapa da próxima parada no bloco vivo via **Mapbox Static Images API** (um `<img>`, **sem
  carregar `mapbox-gl` na home** — bem mais leve que o Modo Mapa do pai); G5-safe (parada do
  próprio aluno); sem token/coordenada, degrada sem mapa. **Fora desta fatia por decisão:** ETA
  (registrado como infra futura na seção 10 — chamada de rota real + custo/cache + janela G4) e o
  selo "rota otimizada" (dropado — cosmético sem dado real por trás, evita mentir). Sem migration,
  sem guarda nova. Validado no navegador (hrefs certos; mini-mapa carrega 200 sobre o card).
  Commit `1caefb3`.
  **Traçado da rota no mini-mapa + refino visual: PRONTO.** O mini-mapa ganha o TRAÇADO
  (paradas pendentes + escola) por cima dos pinos, via o overlay `path` da Static Images API
  com a geometria polyline da **Directions API** — continua um `<img>` (sem `mapbox-gl`).
  **Directions roda no SERVER** (SSR, `lib/route-path`): a lista de coordenadas das paradas não
  vai pro cliente (espírito G5). **Fallback em camadas, NUNCA trava a home:** `AbortController` +
  timeout 1,2s → `traçado+pinos` → `só pinos` (Directions falha/lenta) → `sem mapa` (sem
  token/coord). **Caps:** ≤25 coords (teto da Directions) e cap de pinos (acima, só a próxima
  parada) p/ não estourar a URL da Static Images (~8192; medido ~500 chars); custo = 1 request
  Directions só com perna rodando (Static continua 1 request — `path` não adiciona chamada).
  Próxima parada = pino grande amarelo, demais + escola = pino pequeno navy, `auto` enquadra.
  `drive-board` passa a trazer `school_lat/lng` e expõe `ActiveBoard.schoolAnchor` (escola
  compartilhada pela perna, espelha `sharedSchoolAnchor` do builder) — âncora do traçado (fim na
  ida, começo na volta). Refino visual (dado já existente): mapa maior (`h-52`), nome da parada
  `text-lg`, faixa do motorista com **foto + placa/modelo da van** (some quando não há veículo).
  ETA e selo "rota otimizada" seguem FORA (decisão). Validado: navegador (a volta desenha o
  traçado sobre ruas reais); Node (camadas de fallback — token válido→path; Directions falha→só
  pinos; sem token→null). Sem migration, sem guarda nova. Commit `9bb2db4`. **Nota:** a exclusão
  "Directions/traçado/marcadores no mapa" abaixo era do **Modo Mapa do PAI** (exporia endereço de
  criança a responsável = G5); no lado do MOTORISTA o traçado é do próprio dado dele — permitido.
  **Sugestão de horário de saída de casa (perna de ida): PRONTA.** Chip no card da rota de hoje
  — "Saia até as HH:MM para não atrasar [1º aluno]" — quando há uma ida agendada ainda não
  iniciada. Informativo, NUNCA bloqueia (espírito 100m/recorrência). **Âncora (decisão desta
  sessão, via AskUserQuestion):** `routes.pickup_target_time` (time, nullable) — campo novo no
  RouteBuilder ("horário de começar a pegar"); sem ele, sem sugestão (nunca quebra), sem preencher
  retroativo. **NÃO é o "ETA ao vivo" do sketch da seção 10** (posição da van + janela G4): é a
  variante PRÉ-PARTIDA — origem = `driver_profiles.address` **geocodificado** (não GPS, então
  existe antes de abrir o app e sem permissão de localização), destino = 1º aluno da lista de
  pickup ordenada, `driving` sem trânsito (driving-traffic segue fora). Cálculo: `leave_by =
  pickup_target_time − duração(casa→1º aluno) − 10min`. **Só server** (`lib/departure`): endereço e
  coords nunca vão pro cliente; geocoding + Directions com timeout; qualquer furo (sem
  endereço/coord, API falha) → aquela rota fica sem sugestão, sem crash. **Cache 1x por rota por
  dia:** tabela dedicada `route_departure_suggestions` (PK `route_id+service_date`, RLS dono-only)
  — **não** usa `route_executions` porque a sugestão aparece ANTES de iniciar; recargas reusam, só
  recalcula no 1º load do dia. Some quando a ida começa (home vira bloco vivo). Migration 031
  (`routes.pickup_target_time` + tabela) aplicada no SQL Editor. Validado no navegador (input
  valida/hidrata/persiste 07:30; chip "Saia até as 06:59 para não atrasar Bruna Santos" = 07:30 −
  21min − 10min; cache grava 1 linha, reload reusa; sem endereço a home renderiza sem o chip). tsc
  limpo. Commit `ffa7c8b`. **Nota:** primeiro passo da "rota sugerida inteligente" completa (ETA de
  um trecho único, sem otimizar ordem nem trânsito).
  **Exceções (R3) — atalho no editar (fecha o gap de descoberta):** reconciliação confirmou que
  a **UI de exceções (R3) já estava PRONTA** desde o commit `5458781` (sub-tela dedicada
  `/rotas/[id]/excecoes` — lista/adicionar/excluir/sugestão contextual, por rota, datas só-futuro)
  e que **a home já filtrava "hoje" por `route_runs_on`** (R2a, `ddfff18`, via `routeRunsToday` em
  `routes-today`). O único furo era **descoberta**: não dava pra chegar nas exceções de dentro do
  editar. Esta fatia adicionou só uma seção "Exceções" no fim da tela de editar rota — contagem das
  próximas (hoje pra frente, mesmo recorte da sub-tela) + link "Ver/gerenciar" → a sub-tela. Decisão
  (AskUserQuestion): **manter a sub-tela dedicada** (não desmontar/duplicar), **datas seguem
  só-futuro** (não mexer). **Sem migration:** a RLS dono-only de `route_exceptions` da 029 é `for
  all` (cobre delete — o `removeException` já funcionava). Validado no navegador (atalho aparece;
  0 → texto genérico, 1 → "1 marcada"; link leva à sub-tela; criar/remover reflete na contagem).
  Commit `b8ea731`.
  **Mapa sempre visível na home (fecha o R2) + navegação externa por parada: PRONTO.**
  Reconciliação: o mapa só aparecia com perna `in_progress` (vivia no ramo `board ?` da
  HomeContent; `getActiveDriverBoard` só devolve board p/ `in_progress`) — daí "Concluída hoje"
  sem mapa nenhum. **(1) Mapa sempre visível:** ocioso (sem rota / antes do horário / concluída)
  → **mapa estático centrado no endereço cadastrado do motorista, geocodificado** (`lib/driver-map`
  + `lib/geocode`, extraído da sugestão de saída) + "Nenhuma rota em andamento agora". **Conflito
  com a G4 resolvido por AskUserQuestion:** a G4 proíbe GPS fora de `in_progress`, então a home
  idle **NÃO usa GPS ao vivo** — usa o endereço (decisão: não relaxar a G4). O bloco vivo
  (`in_progress`) segue com o traçado, inalterado. A **lista de rotas de hoje agora aparece SEMPRE
  abaixo do mapa** (concluídas e próximas), não só no ocioso; a sugestão de saída idem. Degrada sem
  mapa se faltar endereço/token/geocode. **(2) Navegação externa por parada (`NavMenu`):** botão
  "Abrir navegação" em cada parada do Modo Direção → menu rápido **Waze / Google Maps** com a
  coordenada (ou endereço) DAQUELA parada como **destino único** (uma por vez — Waze não faz
  multi-parada por deep link); pergunta o app toda vez, sem config no perfil. **Não é rastreio** —
  só abre link externo com a parada do próprio motorista: G4/G5 intactos, sem guarda nova. Sem
  migration. Validado no navegador nos 3 estados (idle: mapa da região + lista; `in_progress`:
  traçado + lista; concluída: cai no idle com "Ida/Volta concluída" na lista) e o NavMenu (destino =
  coord da parada, `target=_blank`). Commit `c8d187e`.
  **Modo Direção 2.0 — mapa em tela cheia (padrão Uber/99): PRONTO.** Reconciliação: a DriveScreen
  NÃO tinha mapa (era lista de cards); o mapa+traçado do bloco vivo é da HOME e é **estático**
  (Static Images, sem GPS); o único mapa interativo ao vivo era o do PAI (`LiveMap`). No lado do
  motorista, o GPS ao vivo só existia pro gate de 100m (`useDriverPosition`), sem mapa. Esta fatia
  introduz o **1º mapa interativo com GPS ao vivo do lado do motorista**: `DriveMap` (mapbox-gl,
  lazy via `DriveMapLoader` — mesmo corte de peso do `LiveMap`) em tela cheia, com a **linha da
  rota** (Directions/GeoJSON, `getRouteLineCoords` novo em `route-path`), **pinos das paradas**
  (feitas esmaecidas), a **escola** (âncora) e o **pino do motorista ao vivo**. Por cima, um
  **bottom sheet** com a PARADA ATUAL (nome/endereço + botão grande **"Cheguei no embarque/
  desembarque"** = o antigo "Embarcar", **mesmo gate de 100m, mesmas G1/G2** — só a apresentação
  muda) + "Ausente" + `NavMenu`; colapsável "Ver todas as paradas"; rodapé com ocorrência/encerrar;
  o painel avança conforme as paradas são resolvidas. **G4 ok:** o mapa/GPS roda só na janela do
  G4 (`in_progress` + foreground) — diferente da home idle, aqui é permitido; é o mapa do próprio
  motorista (paradas dele, G5 ok). O Waze/Google (`NavMenu`) segue como **fluxo paralelo**, sem
  mudança. Turn-by-turn próprio segue **fora** de escopo. Sem migration, sem guarda nova.
  Validado no navegador (mobile): mapa tela cheia renderiza (mapbox-gl), bottom sheet com a parada
  certa (Bruna Santos), "Cheguei no embarque" aciona o gate (0/1 → 1/1, hero vira "Todas as
  paradas resolvidas"). Commit `609838e`.
  **Modo Direção — gesto de arrastar no confirmar da parada (R5): PRONTO.** O botão de toque
  "Cheguei no embarque/desembarque" vira um **"deslize para confirmar"** (estilo apps de entrega,
  `DragConfirm` novo — pointer events, threshold 85%, spring-back). Ao completar o arraste, revela
  **"Embarcou"/"Desembarcou" + "Ausente"**. **UI pura sobre lógica provada** — "Embarcou" dispara
  a MESMA ação de embarque (com o `forced` do gate); "Ausente" a MESMA ausência operacional
  (`route_events.student_absent`). O gate de 100m **nunca bloqueia** — só muda visual/copy (perto =
  sólido "deslize para confirmar"; longe/sem GPS/sem coord = tracejado "deslize mesmo assim"); o
  arraste funciona a qualquer distância. **Reconciliação do #4 (Ausente × ausência do pai):** são
  dados DISTINTOS em camadas diferentes — a do motorista é operacional (`route_events`, por
  execução), a do pai é planejada (tabela `absences`, `reported_by`=pai, dispara a Revisão de hoje).
  **Não há ponte automática** (`apply_route_review` só trata suspensão/G1). Coexistem sem conflito
  (pai declara + motorista marca ausente = consistente; + motorista embarca = a G1 já protege a
  volta de quem embarcou). **Decisão: manter separado**, NÃO gravar a "Ausente" do motorista em
  `absences` — sem guarda nova. **#3 (só arrastar, sem toque simples):** a lista "Ver todas" perdeu
  o toque-embarcar (pendente = overview; concluída = "Desfazer"); embarque só pelo arraste do hero.
  Sem migration. Validado no navegador (mobile): arraste revela Embarcou/Ausente; "Desembarcou"
  marca (0/2 → 1/2, avança e reseta o arraste); "Ausente" marca (2/2, "Todas as paradas
  resolvidas"); banco confirma os eventos (`disembarked` + `student_absent`), iguais aos do toque
  anterior. Commit `05822bc`.
  **DriveMap — câmera de condução (inclinada + girando com o rumo): PRONTO.** O mapa do Modo
  Direção deixa de ser visto-de-cima e abre em **câmera de condução estilo Waze/Google**:
  inclinada (`pitch 55`) e girando com o rumo do GPS (`bearing = heading`). **NÃO é turn-by-turn**
  (segue fora do v1) — é só o comportamento da câmera do mapbox-gl: sem SDK novo, sem custo extra,
  **sem tocar a G4** (mesma janela `in_progress` + foreground do `useDriverPosition`). Reconciliação:
  o `useDriverPosition` só devolvia `{lat,lng}` (descartava o rumo, embora o `usePositionBroadcast`
  do pai já lesse `coords.heading`); o DriveMap usava `zoom 13` + `fitBounds` (achatado) + `easeTo`
  só de centro. Agora: `useDriverPosition` expõe `heading` (null quando parado/sem bússola; segue
  `GeoPoint`, o gate de 100m não muda); o DriveMap abre com `pitch 55` (sem `fitBounds`, que
  achataria) e no update segue a van com `bearing = heading` (mantém o bearing atual quando heading
  é null, não pula), pitch fixo, zoom de condução. **Padrão automático** assim que a perna vira
  `in_progress` — sem botão de alternar modos. Sem migration, sem guarda nova. Validado no navegador
  (mobile): abre inclinado (perspectiva). O seguir-o-rumo ao vivo (bearing) é código direto
  (heading→bearing) e precisa de GPS em movimento p/ confirmar no device. Commit `18a15db`.
  **DriveMap — botão de recentralizar (padrão Waze/Google): PRONTO.** Botão flutuante que só
  aparece quando o motorista **mexeu na câmera à mão** (arrastou/girou/deu zoom e saiu do "seguir");
  ao tocar, volta pra câmera de condução — centrada na posição atual, com pitch/bearing certos — e
  retoma o seguir automático. Detecção do gesto manual: listeners `dragstart`/`rotatestart`/
  `zoomstart`/`pitchstart` só desligam o seguir quando o evento tem `originalEvent` (gesto do
  usuário); os movimentos programáticos da própria câmera (`easeTo`) não têm `originalEvent` →
  ignorados (não se auto-desligam). O marcador da van acompanha sempre; a câmera só segue se
  `followRef`; a última posição fica em `lastPosRef` p/ o recenter usar; helper `driveCamera`
  (center + pitch + bearing) compartilhado pelo seguir e pelo recenter. Botão no canto
  superior-direito do mapa (não atrapalha o bottom sheet), ícone `LocateFixed`. Sem migration, sem
  guarda nova. Validado no navegador (mobile): oculto no início; arraste manual do mapa faz
  aparecer; tocar oculta e retoma o seguir. Commit `5f3d24d`. **Fix (`a362761`):** o recenter só
  agia com posição de GPS (`lastPosRef`) — no preview e antes de o sinal chegar ficava mudo.
  Fallback: sem GPS, reenquadra na ROTA (centroide das paradas + escola em `routeViewRef`, com o
  pitch de condução); com GPS segue centrando no motorista. O botão nunca fica mudo.
  **Modo Direção — bottom sheet recolhe/expande por distância: PRONTO.** O bottom sheet do Modo
  Direção 2.0 recolhe/expande sozinho por distância, com controle manual sempre disponível — UI
  sobre o gate de 100m que já existe, sem lógica/guarda/migration nova. **Auto (padrão):** longe
  da próxima parada (distância **mensurável** E fora do 100m) → recolhe pra só a faixa "Próxima
  <aluno>", dando tela ao mapa; perto (≤100m) **ou sem dado** (sem GPS/coord) → expande — nunca
  esconde a ação por falta de dado (mesmo espírito do 100m). O padrão só se aplica quando o alvo
  automático **cruza o threshold** (`useEffect` no booleano `autoCollapsed = currentDist != null &&
  !currentInRange`), então não briga com o manual. **Manual:** alça arrastável sempre visível —
  arrastar pra baixo recolhe, pra cima expande, toque alterna; a qualquer distância. Recolhido
  esconde ação/lista/rodapé e mostra só a faixa da próxima parada; o mapa (câmera de condução)
  ocupa quase a tela toda. Reusa `currentDist`/`currentInRange` do gate. Validado no navegador
  (mobile): default expandido sem GPS (#4); arraste manual baixo→recolhe, cima→expande,
  toque→alterna (#3). O auto por distância (#1/#2) é código direto sobre as funções `geo` já
  testadas e precisa de GPS em movimento p/ ver no device. Commit `99bf686`.
  **Modo Direção — volta sem "Ausente" para quem embarcou na ida (R10, extensão da G1): PRONTO.**
  Quem **embarcou na ida** hoje não pode ser marcado **ausente na volta** — o dia fecha com o
  desembarque. Duas camadas: **(1) banco (lei):** migration 032, trigger
  `enforce_no_absent_after_ida_embark` (`SECURITY DEFINER`) recusa `student_absent` numa perna
  `dropoff` quando o aluno tem `embarked` na perna `pickup` da mesma rota + dia. Dispara em
  **INSERT e UPDATE** (a RLS do dono permite update em `route_events`; trocar um `disembarked` por
  ausência via update seria bypass do delete+insert do `setStopState`). Ida e legado (`leg` null)
  seguem livres — "Ausente" no embarque continua o caso real. **(2) UI (conveniência):** a página do
  Modo Direção busca, na volta, os `student_id` com `embarked` na ida do dia; a `DriveScreen`
  esconde o "Ausente" desse aluno e mostra "Embarcou na ida hoje — precisa desembarcar". Migration
  032 aplicada pelo SQL Editor (fora do histórico `supabase_migrations`, idempotente). Provado
  (`docs/tests/g1_volta_sem_ausente.sql`, 3/3: volta recusa ausente de quem embarcou — insert e
  update — e aceita o desembarque; volta aceita ausente de quem não embarcou, inclusive embarque de
  outro dia; ida segue livre). Validado no navegador (rota "Olavo Hansen"): ida mostra
  Embarcou/Ausente; após embarcar na ida, a volta mostra só "Desembarcou" + o aviso; "Desembarcou"
  marca (1/1); banco confirma `embarked` na ida e `disembarked` na volta, sem `student_absent`.
  Execuções de teste removidas ao final.
  **DragConfirm — thumb com a marca (R8): PRONTO.** O thumb do "deslize para confirmar" trocou as
  setas duplas (`ChevronsRight`) pelo **canguru no amarelo `#FFD000`** — reaproveita o asset oficial
  `/brand/kangu-icon.png` via `Logo variant="icon"` (nenhum asset novo). Puramente visual: threshold
  85%, spring-back e as variantes **sólida** (perto/com dado) × **tracejada** ("mesmo assim",
  longe/sem dado) intocados — a diferença entre as duas fica na **trilha**; o thumb é o mesmo nos
  dois estados. Reconciliação: a barra da Linha do tempo do pai usa o **emoji** 🦘 (não um asset),
  então o único canguru-asset do app é o ícone da marca. Validado no navegador com geolocalização
  simulada na página (sem persistir posição): perto (~20 m) = trilha sólida "deslize para
  confirmar"; longe (~2070 m) = trilha tracejada "deslize mesmo assim"; arraste parcial volta,
  arraste completo revela Embarcou/Ausente. **De brinde, o auto-recolher do bottom sheet por
  distância (pendente de device desde `99bf686`) foi visto funcionando**: ao afastar a van o sheet
  recolheu sozinho para a faixa "Próxima". Execução de teste removida.
  **Cabeçalho fixo + Configurações absorvendo o Perfil (R6): PRONTO.** (1) **Cabeçalho fixo** nas
  telas principais do motorista (Início, Rotas, Alunos, Financeiro, Configurações e Notificações):
  avatar (→ Configurações) + sininho no topo direito, `sticky` ao rolar, visual idêntico — fonte
  única `lib/driver-header` (`getDriverHeader`, com `cache`: avatar assinado + não-lidas) e
  componente `DriverHeaderActions`; o `AppHeader` ganhou o slot `actions` (com ações vira sticky).
  Subtelas com "voltar" e o Modo Direção (imersivo) ficam como estavam. (2) **"Perfil" virou
  "Configurações"** no menu de baixo (ícone `Settings`; rótulos do menu a 10px para caber) — é a
  MESMA tela (`/motorista/perfil`, rota mantida p/ não quebrar links como `/perfil/editar`): dados
  pessoais, veículo, foto, assinatura e G6 no topo; abaixo, as seções novas **Notificações** (link
  p/ a lista, com contagem de novas), **Suporte** ("Falar no WhatsApp" → `wa.me/55<número>`;
  "Enviar e-mail" → `mailto:house@domhub.co`) e **Sair** (o "Sair" saiu do cabeçalho do Perfil e
  desceu p/ cá, já que o canto direito agora é avatar + sino). **⚠️ O número do WhatsApp é
  PLACEHOLDER:** constante `SUPPORT_WHATSAPP_NUMBER = "TODO_TROCAR_NUMERO_REAL"` no topo de
  `motorista/perfil/page.tsx` — **trocar pelo número real antes do piloto.** (3) **Sininho —
  reconciliação:** já existia um modelo genérico — tabela `notifications` **por `user_id`** (não só
  do pai), RLS `select_self`/`update_self`, ação `markAllNotificationsRead` e o `AvisoList`.
  Reaproveitado sem migration: nova tela `/motorista/notificacoes` (mesmo `AvisoList`, vazio =
  "Nenhuma notificação") + badge de não-lidas no sino; `markAllNotificationsRead` passou a
  revalidar também o layout `/motorista` (zera o badge). **Hoje nada grava notificação para o
  motorista** (o único gerador, `register_occurrence`, escreve para os pais) — a tela mostra o vazio
  até existir um gerador do lado dele. Sem guarda nova. Validado no navegador: cabeçalho igual em
  Início, Rotas, Alunos, Financeiro, Configurações e Notificações; sticky ao rolar; links de
  suporte com os hrefs certos; sino → lista vazia; console e servidor sem erros. O badge com
  contagem > 0 não foi visto (não há notificação de motorista no banco).
  **"Hoje" no fuso de São Paulo de ponta a ponta (app + banco): PRONTO.** Fecha a dívida anotada
  na R2/R3 (as ~8 cópias de `today()` em UTC). **App:** as 7 cópias de
  `toISOString().slice(0,10)` (home, Alunos, Revisão, `drive-board`, `actions/routes` — inclusive
  o `startExecution`, que cria a execução do dia —, `actions/absences`, `actions/invoices` e a
  lista de ausências do pai) + o `AbsenceForm` (cliente; "hoje/amanhã" em UTC) passam a usar
  `saoPauloToday` (`lib/day`); o mês das faturas ("Gerar faturas do mês", vencimento dia 10) e o
  "A receber neste mês" do Financeiro derivam o `YYYY-MM` do mesmo helper (antes `getMonth()` em
  UTC no servidor — às 21h do último dia já era o mês seguinte). **Banco (migration 033):** o
  achado que mudou o escopo — 4 funções usavam `current_date` (UTC): `apply_route_review`
  (Revisão G1/G2, **também cria a execução**), `get_active_journey` (jornada do pai G5/G6),
  `get_suspension_review` e o trigger da G2 `enforce_route_stops_frozen_while_running`. Trocar só o
  app desalinharia app e banco das 21h à meia-noite (G2 sem achar a perna rodando = edição liberada
  no meio da execução; pai sem jornada; Revisão × início direto criando execuções com datas
  diferentes). Decisão (AskUserQuestion): app + migration. A 033 cria `sp_today()` (`(now() at
  time zone 'America/Sao_Paulo')::date`) e recria as 4 funções com o corpo **idêntico** ao vigente
  (025/027), só `current_date` → `public.sp_today()` (diff verificado; `create or replace`
  preserva grants e o trigger da 026). Aplicada pelo SQL Editor; catálogo confirma as 4 com
  `sp_today()` e sem `current_date`. Testes de guarda ajustados para `sp_today()` (os 4 pedidos +
  `embarque_100m` e `modo_mapa_guardas`, que também montam execução de hoje) e rodados:
  `recorrencia` 6/6, `rotas_both_execution` 4/4, `rotas_edit` 4/4, `g1_volta_sem_ausente` 3/3;
  unit `node --test` 17/17; fronteiras de fuso conferidas (23h30 SP = mesmo dia; virada de mês só à
  meia-noite local). Telas (home, Financeiro, Alunos) sem erro.
  **Portão de perfil completo (prefixo + placa + modelo + cor): PRONTO.** Novo campo **"Prefixo"**
  do veículo (migration 034: `vehicles.prefix text`, nullable — motoristas antigos não têm) no
  formulário de perfil, junto de placa/modelo/cor. Os 4 viraram condição: enquanto algum estiver
  vazio, o motorista **não cadastra nem edita aluno, não gera/regenera link de captação e não
  envia convite** — aviso "Complete seu perfil" (com o que falta) + botão p/ Configurações → Editar
  perfil. **Mecanismo escolhido: checagem no servidor (server actions) + aviso na tela — NÃO
  RLS/trigger.** Razões: (a) é exigência de cadastro, não guarda de segurança (G1–G6); (b) `students`
  recebe UPDATE de fluxos que não podem travar (mensalidade/`setStudentFee`, foto, arquivar,
  `pay_status` do financeiro, `approve_capture` SECURITY DEFINER) — uma RLS/trigger ali bloquearia
  tudo junto. Fonte única `lib/profile-gate` (`getProfileGate`, com `cache`) usada pelas 5 actions
  (`saveNewStudent`, `updateStudent`, `createInvite`, `createCaptureLink`, `regenerateCaptureLink`)
  **e** pelas telas (lista de Alunos, novo aluno via `layout.tsx` de servidor, editar aluno, convite no
  detalhe, captação sem formulário nem "Regenerar"). **Aprovar cadastro vindo de captação segue
  liberado** (o link já passou pelo portão; travar deixaria o pai preso na fila). CNH e marketplace
  fora (decisão de escopo). Validado no navegador: perfil sem prefixo → as 4 telas bloqueiam com
  "falta: Prefixo"; prefixo preenchido pelo formulário → as 4 liberam; **bypass**: com o formulário
  de link já aberto, prefixo zerado no banco e o envio é **recusado pelo servidor** (nenhum link
  criado). Prefixo de teste revertido ao final (o motorista de teste segue sem prefixo = bloqueado).
  **Painel financeiro + despesas (R11): PRONTO.** A aba Financeiro (não é aba nova) ganhou no topo
  um **seletor de mês** (anterior/atual/próximo, `?mes=YYYY-MM`) + **painel** (3 grupos, 1 número por
  card, sem gráfico) e, abaixo, 2 sub-abas: **"A receber"** (o `FinanceiroPanel` de antes, intocado —
  segue no mês corrente) e **"Despesas"** (nova). Fonte única `lib/finance-dashboard`.
  **Reconciliação do schema:** receita = `invoices.status='paid'` com `paid_at` no mês (instante, fuso
  SP); a receber = `pending` (estado atual, sem filtro de mês); em atraso = `overdue`+`suspended`
  (valor + nº de `student_id` distintos — **estado atual, sem filtro de mês**, como "a receber");
  inadimplência = faturas `overdue`+`suspended` do mês ÷ faturas do mês (`billing_period` = dia 1,
  `canceled` fora); `invoice_events` não é necessária. **Despesas** (migration 035, tabela
  `driver_expenses` + enum `expense_category` combustivel/manutencao/outros, RLS dono-only):
  formulário + lista (com excluir) + total por categoria + total do mês selecionado; lucro líquido
  = recebido − despesas (vermelho se negativo). **Alunos:** ativos (total), novos no mês
  (`created_at`), top 5 escolas por `school_address` **bruto** (decisão travada). **Frequência**
  (proxy escolhido por AskUserQuestion: agenda + execuções) = 1 − ausências/oportunidades;
  oportunidade = aluno ativo × dia do mês (até hoje, a partir do cadastro do aluno e da rota) em
  que uma rota dele roda pela recorrência (`routeRunsToday` + exceções, espelho do `route_runs_on`);
  ausência = (aluno, dia) com ausência do pai (`absences`) OU "Ausente" do motorista
  (`route_events.student_absent`). **Operação:** atraso de rota = `started_at` da ida (perna
  `pickup` ou legado `outbound`) > `pickup_target_time`, **sem margem**, só rotas com horário-alvo.
  Sem base honesta → **"sem dado suficiente"** (nunca 0% inventado): inadimplência sem fatura no mês,
  frequência sem dia agendado (mês futuro / domingo dia 1), atraso sem ida elegível. Validado no
  navegador com dado real: nov (atual) — frequência e atraso "sem dado"; out — frequência **100%**
  (bate com o esperado: aluna e rota desde 6/9, seg–sex, 0 ausências); dez — tudo do mês "sem
  dado"; despesa de R$ 50 em nov → card "Despesas do mês" R$ 50, lucro −R$ 50, total/categoria na
  aba; em out a despesa não aparece; ida iniciada à noite → atraso **100% (1 de 1)**. Bug achado e
  corrigido na validação: mês passado dava frequência nula (último dia contável). Dados de teste
  removidos (despesa pela tela; execução pelo id).
  **Gráficos do painel R11: PRONTO.** Visualização em 4 pontos, **só do mês selecionado** (sem
  histórico multi-mês) e **sem tocar nos cálculos** (`lib/finance-dashboard` intocado). **Sem lib nova:**
  o projeto não tinha nenhuma lib de gráfico, e as 4 formas são simples — SVG puro em
  `components/charts.tsx`, renderizado no servidor (0 KB de dependência; hover = `<title>` nativo).
  (1) **Donut** de despesas por categoria na sub-aba Despesas, com legenda (nome + valor sempre
  visíveis); (2) **barras lado a lado** recebido × despesas × lucro ("Resultado do mês"), um eixo em
  R$, lucro negativo desce abaixo da linha de base; (3) **barra horizontal** no ranking top 5 de
  escolas; (4) **aro/gauge** ao lado do número em Inadimplência, Frequência e Atraso de rota —
  "sem dado suficiente" mostra **só o trilho cinza**, nunca um gráfico quebrado. Cores: categorias
  usam os 3 primeiros slots da paleta categórica validada (azul/laranja/água — passam CVD e visão
  normal em todos os pares no branco; o aviso de contraste da água é coberto pela legenda com
  rótulo); magnitude única (barras, ranking, aros) no marinho da marca sobre trilho cinza.
  Validado no navegador em out (frequência 100% = aro cheio, aros cinza nos sem dado, barras
  zeradas), nov (3 despesas de teste 50/30/20 → donut proporcional; barras com lucro −R$ 100 abaixo
  da base) e dez (tudo cinza/vazio, "Sem despesas no mês"). Ajustes de layout achados na validação:
  base no rodapé quando tudo é zero, espaço p/ o rótulo da barra negativa, legenda do donut sem
  colisão em 375px. Console limpo; despesas de teste removidas.
  **Financeiro em 4 abas de primeiro nível: PRONTO.** Sem aninhar: **Visão Geral**, **A receber**,
  **Despesas**, **Mensalidades** (`?aba=`; cada aba carrega só o próprio dado). **Reconciliação das
  abas:** o app não tinha componente de abas genérico — o único padrão de abas de *navegação* era o
  controle segmentado das sub-abas do Financeiro (o "Ida/Volta/Ambos" das ausências é seletor de
  formulário, não navegação). Extraído para `components/SegmentedTabs` (mesmo visual; largura
  proporcional ao rótulo para "Mensalidades" não truncar em 375px). **Visão Geral** = o painel R11
  como estava (seletor de mês + métricas + gráficos) + botão **"+ Nova despesa"** no topo, que abre o
  **mesmo** formulário num bottom sheet (`NewExpenseSheet`), sem trocar de aba — o formulário virou
  `ExpenseForm` (fonte única, usado também pela aba Despesas); fecha ao salvar, no X, no fundo ou
  no Esc. **A receber** (`FinanceiroPanel`, mês corrente) e **Despesas** (`ExpensesPanel` + seletor
  de mês) iguais a antes, só promovidas a abas. **Mensalidades** (nova, só consulta): alunos ativos
  com mensalidade (ou "Sem mensalidade definida") e status de pagamento — reusa os rótulos que o app
  já usava (ok = "Em dia", at_risk = "Vencida", blocked = "Suspenso"; extraídos para
  `lib/pay-status`, a lista de Alunos usa o mesmo); filtros **escola** (nome cadastrado, cai no
  endereço se vazio — valor bruto), **turno** e **rota** (via `route_stops`), combináveis (E), cada
  um opcional, "Todos" por padrão, na URL; total da lista por mês; **"Editar" leva ao cadastro do
  aluno existente** (`/motorista/alunos/[id]/editar`), nenhum formulário duplicado. Validado no
  navegador: as 4 abas navegam e mostram só o próprio conteúdo; filtro escola+Manhã+rota → 1 aluna,
  trocando p/ Tarde → 0 ("Nenhum aluno com esses filtros"), turno de volta a "Todos" → 1; "+ Nova
  despesa" abre o sheet na Visão Geral, salva R$ 40, fecha e atualiza o painel (despesas R$ 40,
  lucro −R$ 40), e a despesa aparece igual na aba Despesas (removida depois). Console limpo.
  **Toque: diagnóstico + feedback de pressionado + fim dos emojis: PRONTO.** **Investigado antes de
  corrigir** (Android emulado, telas já compiladas, instrumentando `pointerdown` → `click` → resposta
  RSC → 1ª mutação do DOM): `pointerdown`→`click` = **1–2 ms** (sem delay de toque); toque → resposta
  do servidor = **750–1700 ms**; resposta → 1ª mudança na tela = **12–30 ms**; **nenhuma** mudança
  visual antes da resposta. **Causa: falta de feedback, não atraso de toque** — cada tela do motorista
  é renderizada no servidor (várias consultas ao Supabase), não há `loading.tsx` (o Next segura a
  tela antiga até a nova chegar) e **nenhum** botão/card tinha estado `:active`. `touch-action:
  manipulation` estava ausente no app inteiro, mas **não era a causa**: o viewport já é
  `width=device-width, user-scalable=no`, que desliga o delay de 300 ms nos navegadores atuais (a
  emulação também só envia clique de mouse). Hipótese **não medida** (exige login em produção): a
  função da Vercel no padrão `iad1` (EUA) consultando o Supabase em `sa-east-1` alongaria essa espera.
  **Correções:** (1) `touch-action: manipulation` + realce nativo do WebKit desligado em todo
  clicável (`a`, `button`, `[role=button]`, `summary`, `label`, `select`, inputs de botão) em
  `globals.css` (`@layer base`); (2) estado de **pressionado instantâneo só em CSS** (`:active` →
  `opacity: .6`, sem transição, sem mudar layout), fora o arrastável (`.touch-none`: thumb do
  DragConfirm e alça do sheet seguem `touch-action: none`) e o desabilitado; (3) **emojis
  removidos** (regra da seção 1): 🗺️/📍 → `Map`/`MapPin` no toggle do G6, ➕ → `Plus` (Nova rota,
  Adicionar aluno), 👤 → `User` (responsáveis), ✉️ → `Mail` (Convidar responsável), 🎉 → removido
  ("Rota concluída."), 🦘 → **ícone da marca** na barra da Linha do tempo do pai (o lucide-react não
  tem canguru — conferido no `.d.ts`). O ✓ (U+2713) é caractere de texto, não emoji — mantido.
  Validado no navegador mobile emulado: lista de alunos, home (12/12 clicáveis com `manipulation`) e
  Modo Direção (11/11; thumb e alça com `none`; arraste segue funcionando); ícones novos visíveis;
  regra `:active` carregada (o pressionar em si não dá para segurar pela automação). Console limpo.
  **Esqueletos de carregamento + "Iniciando…": PRONTO (commit `1a03cbc`, SEM PUSH).** `loading.tsx`
  em home, Rotas, Alunos, Financeiro e Modo Direção (+ Configurações e Notificações), no visual do app
  (cabeçalho branco, cards, `animate-pulse`; o do Modo Direção imita a tela imersiva). A home foi para
  o grupo de rota `(home)` (URL segue `/motorista`): sem isso o esqueleto da home valia para todas as
  subtelas (Configurações mostrava contadores e mapa). "Iniciar ida/volta" é server action que grava
  antes de redirecionar — o `loading.tsx` só entra depois do redirect (2,9 s parados medidos), então o
  botão ganhou `PendingSubmit` (`useFormStatus`): "Iniciando…" + desabilitado no instante do toque.
  Medido no localhost (dev não faz prefetch): esqueleto aparece em ~230–330 ms e some quando a tela
  real chega, nas telas testadas (Alunos, Rotas, home, Configurações, Modo Direção). tsc e console
  limpos. Em produção o prefetch deve trazer o esqueleto para perto de 0 ms — **ainda não medido**.

**Fora do Modo Mapa v1 do PAI** (fase 2, decisão de escopo): Directions/traçado de ruas,
Navigation SDK, "hora de sair" com trânsito, histórico de trajeto, marcadores de
parada no mapa **do responsável** (dependeriam de expor endereço — G5).

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
- **Sessão seguinte — Link de captação (4 fatias):** inverte o cadastro (o pai
  cadastra o próprio filho, o motorista aprova). Link reutilizável/revogável por
  turno+escola; formulário público com signup de guardian atrás do token +
  consentimento LGPD; geocoding do endereço de casa; fila de aprovação (portão
  G5). Cada fatia com teste de guardas no banco (docs/tests/captacao_fatia*.sql).
- **Rotas 2.0 — criação de rota encorpada:** modelo evoluído p/ rota `'both'`
  (duas listas ida/volta, `route_stops` unique por perna, `routes.shift`); builder
  de duas listas com filtro por turno e volta = ida invertida editável; ponte de
  compatibilidade p/ rotas antigas. Modelo provado (docs/tests/rotas_two_legs.sql).
- **Rotas 2.0 — execução da rota `'both'` por perna:** `route_executions.leg`
  (pickup/dropoff; null=legado) + unicidade por dois índices únicos parciais
  (legado 1×/dia; `'both'` ida+volta no mesmo dia, pernas independentes). Lista com
  dois botões (Iniciar ida / Iniciar volta); DriveScreen filtra paradas pelo `kind`
  da perna; `get_active_journey`, `get_suspension_review` e `apply_route_review`
  cientes da perna (G5 por perna; G1 lê o embarque da ida ao revisar a volta).
  Ponte de compatibilidade: todo ramo novo guardado por `leg is null`. Execução
  provada (docs/tests/rotas_both_execution.sql, 4/4). Migration 025 precisou de
  índices parciais no lugar de `coalesce(leg::text,...)` na expressão do índice
  (cast enum→text não é IMMUTABLE).
- **Rotas 2.0 — editar rota `'both'`:** RouteBuilder em modo duplo (criar/editar),
  carregando as duas listas do banco; `updateRoute` reescreve as paradas. Guarda G2
  por trigger em route_stops (congela as paradas com perna `in_progress` hoje) —
  migration 026 criou o trigger com furo no DELETE (resolvia a rota só por `NEW`,
  nula no delete → deixava apagar), 027 corrigiu forward-only ramificando por
  `TG_OP`/`OLD.route_id`. Aplicadas pelo SQL Editor (não via `db push`), então não
  constam no histórico `supabase_migrations` — idempotentes, `db push` futuro roda
  limpo. Provado (docs/tests/rotas_edit.sql, 4/4).
- **Rotas 2.0 — home operacional + iniciar:** home do motorista (era placeholder)
  vira a tela de começar o dia, por estado. Ociosa: saudação + chip da placa +
  contadores reais + rotas com Iniciar/Continuar por perna. Rodando: próxima parada
  + lista de embarque reais da execução `in_progress` (mesma fonte do Modo Direção)
  + Continuar. Selo Ida/Volta no cabeçalho/botão/lista (a perna nunca fica ambígua).
  Fonte única extraída (`lib/routes-today`, `lib/drive-board`) com a DriveScreen
  refatorada pra reusá-la; apresentação separada (`HomeContent`, `RouteRunList`).
  Sem migration/guarda nova (reuso de início já provado); validação visual dos dois
  estados no navegador.
- **Rotas 2.0 — embarque a "100m" (G1/G2):** o "embarcar" só libera (sólido) a ≤100m
  do endereço da criança; longe/sem GPS/sem coordenada vira "embarcar mesmo assim",
  SEMPRE disponível. O gate é client-side de propósito (a lei se inverte: pôr a
  proximidade como trava no banco violaria a G1 quando o GPS falha). O banco só
  registra o override no `metadata:{forced, distance_m}` do embarked/disembarked —
  só o escalar, nunca a coord crua (`useDriverPosition` roda na janela do G4 e não
  persiste). Guarda no banco: trigger normalizador `normalize_boarding_metadata`
  (canoniza forced/distance_m; NUNCA recusa → incapaz de violar a G1). Provado: unit
  (tests/geo.test.ts, 13/13) + banco (docs/tests/embarque_100m.sql, 3/3). Migration
  028 aplicada pelo SQL Editor. Próxima fatia: **recorrência por dia da semana +
  exceções** (precisa de plano de escopo próprio antes do código).
- **Rotas 2.0 — recorrência R1 (fundação + guarda):** plano de modelo primeiro
  (decisões travadas: leve/computado sem cron; `route_exceptions` dedicada; por rota;
  backfill Seg–Sex). Migration 029: `routes.weekdays` (ISO dow), tabela
  `route_exceptions(skip|extra)` com RLS dono-only, função `route_runs_on(route,date)`
  (exceção manda sobre a regra). Guarda no espírito do 100m — recorrência mostra,
  nunca bloqueia: nenhum caminho recusa iniciar num dia fora da agenda. Provado
  (docs/tests/recorrencia.sql, 6/6). Sem UI. Próximas: R2 (home filtra "hoje" +
  editar dias + iniciar fora da agenda), R3 (UI de exceções).
- **Rotas 2.0 — recorrência R2 (UI, 2 fatias):** **R2a (commit `ddfff18`)** — home
  filtra "Rota de hoje" por `routeRunsToday` (espelho JS de `route_runs_on`) OU execução
  hoje; `/rotas` segue com todas (iniciar fora da agenda). Helper puro `lib/recurrence`
  testado com os vetores dos checks 1–4 do `recorrencia.sql` (`tests/recurrence.test.ts`,
  4/4). **Fix lateral (não regressão):** o `today()` do match de execução em `routes-today`
  era UTC (`toISOString`) e errava a data/dia na janela ~21h–00h (Vercel UTC × São Paulo);
  novo helper único `lib/day` (`saoPauloDay`: data + isoDow de uma computação) alimenta o
  match de execução E o `routeRunsToday` — uma "hoje" só. **R2b (commit `bba669c`)** — 7
  toggles Seg–Dom no RouteBuilder (criar + editar; abrev. de 3 letras); `parseWeekdays` nas
  actions; vazio permitido; G2 intocada. Sem migration (coluna da 029). Validado no
  navegador ponta-a-ponta (remover segunda some da home hoje; devolver traz de volta); tsc
  limpo. **R2 fechada.** Pendência anotada: as outras ~8 cópias de `today()` UTC
  (drive-board, absences, invoices, revisao, alunos…) ficam para varredura futura. Próximas:
  R3 (UI de exceções — feriado/reposição), depois rota sugerida (Mapbox). Sessão também:
  encerrada a execução residual do teste da R2a e o repo saiu do local para o GitHub
  (`origin` = `kanguappmoney/kanguapp`, `main` com upstream).
- **Rotas 2.0 — recorrência R3 (UI de exceções):** fatia única, sem migration (tabela/RLS/
  `route_runs_on` da 029). Sub-tela `/rotas/[routeId]/excecoes` (link "Exceções" no card da
  `/rotas`, pra qualquer rota e mesmo rodando — G2 não se aplica a calendário). Form com
  data + tipo Feriado(`skip`)/Reposição(`extra`) + motivo opcional e **sugestão contextual**
  (a regra do dia pré-seleciona o tipo útil), via `routeRunsToday` + `isoDowOf` novo em
  `lib/day`. Actions `addException`/`removeException`; RLS dono-only é o portão; unique por
  (rota,data) vira erro amigável. Guarda inalterada — exceção mostra, nunca bloqueia.
  Validado ponta-a-ponta no navegador (sugestão feriado↔reposição; skip de hoje some da home;
  remover devolve). Nota LGPD registrada na seção 7 (`reason` texto livre, revisar antes de
  expor ao pai na fase 2). Próxima e última da Rotas 2.0: rota sugerida (Mapbox Optimization).
- **Rotas 2.0 — rota sugerida Fatia A (fundação de coordenadas):** garante lat/lng p/ todo
  aluno e escola, base da Fatia B. Migration 030 (`students.school_lat/lng`; pickup/dropoff já
  existiam); geocoding no cadastro manual reaproveitando o AddressAutocomplete (props opcionais
  retrocompatíveis `initialValue`/`initialLat`/`initialLng` + `onChange` p/ o espelho "mesmo
  endereço"); `students.ts` grava as 6 coords (nunca obrigatórias); `scripts/backfill-geocode.ts`
  idempotente, segredos só do `--env-file=.env.local` (nada hardcoded), backfill fica com o Abner.
  Validado nos dois caminhos (degradado sem token; pick grava coord com token, persiste, hidrata).
  Migration 030 aplicada no SQL Editor. Commit `3f8ef38`.
- **Rotas 2.0 — campo número/complemento:** melhora a precisão do geocoding (Mapbox às vezes não
  tem o número da casa → coord no meio da rua, ruim p/ rota otimizada e 100m). `withNumber` no
  AddressAutocomplete (só embarque/desembarque): entra na query e é concatenado ao endereço salvo,
  sem coluna nova (número persistido = Endereço 2.0 da seção 10). Sub-campo só aparece quando o
  motorista mexe no endereço (não sobre um já salvo — pedido do Abner, testado). **Bug pego e
  corrigido antes do commit:** duplicação do número quando o place_name da sugestão já o traz —
  corrigido zerando o sub-campo no pick e tratando texto pós-pick como complemento que preserva a
  coord. Sem migration/guarda. Validado ponta-a-ponta. Commit `05d4879`. Falta a Fatia B (sugestão
  de ordem: Optimization API + proposta editável no builder + fallback nearest-neighbor).
- **Rotas 2.0 — viés de região no geocoding + backfill:** o `--dry` do backfill pegou coords
  absurdas (Rio, Manaus, Belém — Mapbox casa rua homônima em todo o BR sem viés). `lib/geo-region`
  (fonte única): `proximity` (SP/ABC) + `bbox` do estado de SP, no AddressAutocomplete e no
  backfill; backfill só `status=active`. Backfill real rodado pelo Abner (7 pontos, 0 sem match),
  persistência conferida no banco. Commit `72ac152`.
- **Rotas 2.0 — rota sugerida Fatia B (sugestão de ordem): FECHA A ROTAS 2.0.** Botão "Sugerir
  ordem" por perna no RouteBuilder — proposta editável, MOSTRA nunca impõe (só reordena o array;
  persiste ao Salvar). `lib/route-optimize`: Mapbox Optimization v1 (âncora = escola só quando a
  turma toda vai pra mesma; escola no extremo — fim na ida, começo na volta) + fallback
  vizinho-mais-próximo local (haversine) acima de 12 waypoints/sem token/falha; aluno sem coord vai
  pro fim com aviso, nunca some. **Achado:** a v1 não aceita `source=any` com `roundtrip=false`
  (`code:NotImplemented`) — exige `source=first&destination=last`; token do piloto tem escopo de
  Optimization. Selects de aluno levam as 6 coords ao builder. Sem migration/guarda. 3 casos
  validados no navegador (fixture temporária de 13 alunos, criados e removidos por id, banco limpo):
  feliz ≤11 via Optimization; >11 → fallback; sem-coord → fim. Commit `0bb0bba`. **Rotas 2.0
  COMPLETA** (recorrência R1→R3 + rota sugerida: coordenadas → número → viés de região → ordem).
- **Polimento da home (versão enxuta):** cards contadores viram atalhos (alunos → `/motorista/alunos`,
  paradas → `/motorista/rotas`; ausências fica NÃO-clicável — sem tela de motorista, apontar pra
  `/rotas` enganaria). Mini-mapa da próxima parada no bloco vivo via **Mapbox Static Images API**
  (um `<img>`, sem `mapbox-gl` na home — mais leve; G5-safe; degrada sem token/coord). ETA e selo
  "rota otimizada" ficaram FORA por decisão (ETA vira infra futura na seção 10; selo dropado —
  cosmético sem dado real). Sem migration/guarda. Validado no navegador. Commit `1caefb3`.
- **Home — traçado da rota no mini-mapa + refino visual:** o mini-mapa ganha o TRAÇADO (paradas
  pendentes + escola) via overlay `path` da Static Images API + polyline da **Directions API**
  (segue sendo um `<img>`, sem `mapbox-gl`). **Directions no SERVER** (`lib/route-path`, SSR — as
  coords não vão pro cliente). **Fallback em camadas, nunca trava:** timeout 1,2s → `traçado+pinos`
  → `só pinos` → `sem mapa`. Caps: ≤25 coords + cap de pinos (URL ~500 chars, teto ~8192); 1
  request Directions só com perna rodando. `drive-board` traz `school_lat/lng` e expõe
  `schoolAnchor` (âncora do traçado). Refino: mapa maior, texto maior, faixa do motorista com foto
  + placa/modelo da van. ETA e selo seguem fora. Validado (navegador: traçado sobre ruas reais;
  Node: camadas de fallback). Sem migration/guarda. Commit `9bb2db4`.
- **Home — sugestão de horário de saída de casa (perna de ida):** chip "Saia até as HH:MM para
  não atrasar [1º aluno]" no card da rota de hoje, quando a ida está agendada e não iniciada.
  Informativo, nunca bloqueia. Âncora decidida por AskUserQuestion: **`routes.pickup_target_time`**
  (time, nullable; sem ele, sem sugestão) — campo novo no RouteBuilder. `leave_by =
  pickup_target_time − duração(casa→1º aluno) − 10min`; origem = `driver_profiles.address`
  geocodificado (não GPS), destino = 1º aluno da lista de pickup, Directions `driving` sem trânsito.
  **Só server** (`lib/departure`, coords fora do cliente); qualquer furo → sem sugestão, sem crash.
  **Cache 1x/rota/dia** em tabela dedicada `route_departure_suggestions` (PK route_id+service_date,
  RLS dono-only; não usa route_executions — sugestão aparece antes de iniciar). Migration 031
  aplicada no SQL Editor. É a variante PRÉ-PARTIDA — diferente do "ETA ao vivo" que segue como ideia
  na seção 10 (aquele usa posição da van + janela G4). Validado no navegador (input persiste/hidrata;
  chip 06:59 = 07:30 − 21min − 10min; cache grava e reload reusa; sem endereço, home sem o chip).
  Commit `ffa7c8b`. Nota de validação: setei um endereço de teste no perfil do Abner via
  service-role (campo estava vazio) — ele deve trocar pelo endereço real em Perfil.
- **Exceções (R3) — atalho no editar (reconciliação):** a checagem contra o repo confirmou que a
  UI de exceções (R3, sub-tela dedicada `/rotas/[id]/excecoes`, commit `5458781`) e o filtro "hoje"
  da home por `route_runs_on` (R2a, `ddfff18`) **já estavam prontos antes deste ciclo** — a cópia
  do Cowork estava defasada. Esta sessão fechou só o **gap de descoberta**: uma seção "Exceções"
  no fim da tela de editar rota (contagem das próximas + link "Ver/gerenciar" → a sub-tela).
  Decisão (AskUserQuestion): manter a sub-tela dedicada, datas só-futuro, sem migration (RLS `for
  all` da 029 já cobre delete). Validado no navegador (contagem 0/1, link leva à sub-tela certa,
  criar/remover reflete). Commit `b8ea731`.
- **Home — mapa sempre visível (R2) + navegação externa por parada:** reconciliação mostrou que
  o mapa só aparecia com perna `in_progress` (ramo `board ?` da HomeContent). (1) Mapa idle
  centrado no endereço cadastrado do motorista, geocodificado (`lib/driver-map`/`lib/geocode`),
  **sem GPS** — a G4 proíbe rastreio fora de `in_progress` e a decisão (AskUserQuestion) foi não
  relaxá-la; o bloco vivo segue com traçado; a lista de rotas passa a aparecer sempre abaixo do
  mapa (concluídas + próximas). (2) `NavMenu`: botão "Abrir navegação" por parada → Waze/Google
  Maps com a coord/endereço daquela parada como destino único (uma por vez); não é rastreio, G4/G5
  intactos, sem guarda. Sem migration. Validado nos 3 estados + o menu (destino certo, target
  _blank). Commit `c8d187e`.
- **Modo Direção 2.0 — mapa em tela cheia (Uber/99):** a DriveScreen (que era lista de cards, sem
  mapa) vira um painel imersivo: `DriveMap` (mapbox-gl, lazy via `DriveMapLoader`) em tela cheia
  com a linha da rota (Directions/GeoJSON, `getRouteLineCoords` novo em `route-path`), pinos das
  paradas + escola + pino do motorista ao vivo; por cima, um bottom sheet com a PARADA ATUAL +
  botão grande "Cheguei no embarque/desembarque" (o antigo "Embarcar" — **mesmo gate de 100m,
  mesmas G1/G2**, só a apresentação muda) + Ausente + NavMenu + "Ver todas as paradas" + encerrar.
  1º mapa interativo com GPS ao vivo do motorista; roda só na janela do G4 (in_progress +
  foreground) — sem conflito, é dado do próprio motorista (G5 ok). NavMenu segue como fluxo
  paralelo; turn-by-turn próprio segue fora de escopo. Sem migration/guarda. Validado no navegador
  (mobile): tela cheia + bottom sheet com a parada certa + "Cheguei" aciona o gate (0/1 → 1/1).
  Commit `609838e`.
- **Modo Direção — gesto de arrastar (R5):** o botão "Cheguei no embarque/desembarque" vira
  "deslize para confirmar" (`DragConfirm`), que ao completar revela "Embarcou/Desembarcou" +
  "Ausente". UI pura: as ações são as mesmas (embarque com forced do gate; ausência operacional
  `route_events.student_absent`). Gate de 100m só muda visual/copy (sólido perto; "mesmo assim"
  longe), nunca bloqueia. Reconciliação do #4: a "Ausente" do motorista (operacional, por execução)
  é distinta da ausência do pai (tabela `absences`, planejada) — sem ponte automática, coexistem
  sem conflito; decisão de manter separado, sem guarda nova. #3: lista "Ver todas" sem
  toque-embarcar (só arrastar). Sem migration. Validado no navegador (arraste → 2 botões;
  Desembarcou/Ausente marcam; banco confirma disembarked + student_absent). Commit `05822bc`.
- **DriveMap — câmera de condução (inclinada + girando com o rumo):** o mapa do Modo Direção abre
  em câmera estilo Waze/Google — inclinada (pitch 55) e girando com o rumo do GPS (bearing =
  heading), padrão automático em `in_progress` (sem botão de alternar). Não é turn-by-turn (segue
  fora do v1), só a câmera do mapbox-gl — sem SDK, sem custo, sem tocar a G4. `useDriverPosition`
  passa a expor `heading` (o gate de 100m não muda, segue GeoPoint); DriveMap troca o fitBounds
  plano por pitch + bearing seguindo a van (mantém bearing quando heading é null). Sem
  migration/guarda. Validado no navegador (abre inclinado); o seguir-o-rumo ao vivo precisa de GPS
  em movimento p/ confirmar no device. Commit `18a15db`.
- **DriveMap — botão de recentralizar (Waze/Google):** botão flutuante que só aparece quando o
  motorista mexeu na câmera à mão (arrastou/girou/deu zoom); ao tocar, volta pro modo condução
  (centra na posição atual com pitch/bearing) e retoma o seguir. Gesto manual detectado por
  `dragstart`/`rotatestart`/`zoomstart`/`pitchstart` com `originalEvent` (os `easeTo` programáticos
  não têm → não se auto-desligam). `followRef` + `lastPosRef`; helper `driveCamera` compartilhado.
  Canto sup.-direito, ícone `LocateFixed`. Sem migration/guarda. Validado no navegador (oculto →
  arraste manual mostra → tocar oculta e retoma o seguir). Commit `5f3d24d`. Fix (`a362761`):
  recenter reenquadra na rota (centroide) quando não há GPS, em vez de ficar mudo.
- **Modo Direção — bottom sheet recolhe/expande por distância:** o sheet recolhe sozinho quando
  longe da próxima parada (distância mensurável E fora do 100m) → só a faixa "Próxima <aluno>", o
  mapa cresce; perto (≤100m) ou sem dado (sem GPS/coord) → expande. Aplica o padrão só na travessia
  do threshold (`autoCollapsed`), sem brigar com o manual. Manual sempre disponível: alça
  arrastável (baixo recolhe, cima expande, toque alterna), a qualquer distância. Reusa
  `currentDist`/`currentInRange` do gate; sem lógica/guarda/migration nova. Validado no navegador
  (default expandido sem GPS; arraste manual nos dois sentidos + toque); o auto por distância
  precisa de GPS em movimento p/ device. Commit `99bf686`.

- **Modo Direção — volta sem "Ausente" para quem embarcou na ida (R10, G1):** migration 032 —
  trigger `enforce_no_absent_after_ida_embark` recusa `student_absent` na volta de quem tem
  `embarked` na ida da mesma rota + dia; estendido para INSERT **e UPDATE** antes de aplicar (o
  update era bypass via RLS do dono). UI: a volta esconde o "Ausente" desse aluno e mostra o aviso
  "Embarcou na ida hoje — precisa desembarcar". Aplicada pelo SQL Editor. Teste
  `g1_volta_sem_ausente.sql` 3/3. Validado no navegador (ida → embarcou → volta só com
  Desembarcou + aviso); execuções de teste removidas.

- **DragConfirm — thumb com a marca (R8):** setas duplas → canguru no amarelo `#FFD000` (asset
  oficial `/brand/kangu-icon.png` via `Logo`, nada novo). Só visual: threshold 85%, spring-back e
  trilha sólida × tracejada intocados. Validado com geo simulada (perto/longe, arraste parcial e
  completo); de brinde, o auto-recolher do sheet por distância foi visto funcionando.

- **Cabeçalho fixo + Configurações (R6):** avatar + sininho fixos (sticky) no topo direito das
  telas principais do motorista (`lib/driver-header` + `DriverHeaderActions`; `AppHeader` com slot
  `actions`). "Perfil" → "Configurações" no menu (mesma tela/rota), com as seções novas
  Notificações, Suporte (WhatsApp + e-mail) e Sair. **WhatsApp de suporte é PLACEHOLDER**
  (`SUPPORT_WHATSAPP_NUMBER = "TODO_TROCAR_NUMERO_REAL"` — trocar antes do piloto). Sininho
  reaproveita `notifications` (por `user_id`) + `AvisoList`, sem migration; nova
  `/motorista/notificacoes` (vazia — nada gera notificação p/ o motorista ainda). Validado em 6 telas.

- **"Hoje" em São Paulo (app + banco):** 7 cópias de `today()` UTC + `AbsenceForm` + mês das
  faturas → `saoPauloToday`. Achado: 4 funções do banco (`apply_route_review`,
  `get_active_journey`, `get_suspension_review`, trigger G2) usavam `current_date` UTC — trocar só o
  app desalinharia app/banco das 21h à meia-noite (G2 desligada, pai sem jornada, execução
  duplicada). Migration 033: `sp_today()` + as 4 recriadas idênticas, só a data trocada. Testes de
  guarda em `sp_today()`: recorrencia 6/6, both 4/4, edit 4/4, g1 3/3; unit 17/17.

- **WhatsApp de suporte — número real:** `SUPPORT_WHATSAPP_NUMBER = "5511953790054"` (fim do
  placeholder TODO da R6). O número já vem com o código do país, então o link deixou de prefixar
  `55` (era `wa.me/55${...}` → `wa.me/${...}`; senão viraria `555511…`). Validado: href
  `https://wa.me/5511953790054` (nova aba) e o WhatsApp abre "Conversar com +55 11 95379-0054".

- **Portão de perfil completo:** campo "Prefixo" (migration 034, `vehicles.prefix`). Sem prefixo +
  placa + modelo + cor, bloqueia cadastrar/editar aluno, gerar/regenerar link de captação e enviar
  convite, com aviso → Configurações. Mecanismo: checagem no servidor (`lib/profile-gate` nas 5
  actions) + aviso na tela — não RLS/trigger (exigência de cadastro, não guarda; `students` tem
  UPDATEs de outros fluxos). Aprovação de captação segue livre. Validado: bloqueio, liberação e
  recusa no servidor com o formulário aberto.

- **Painel financeiro + despesas (R11):** Financeiro com seletor de mês (anterior/atual/próximo) +
  painel (Financeiro: recebido, a receber, em atraso, inadimplência, despesas, lucro; Alunos:
  ativos, novos, frequência, top 5 escolas por `school_address` bruto; Operação: atraso da ida vs
  `pickup_target_time`, sem margem) + sub-abas "A receber" (intocada) e "Despesas" (migration 035,
  `driver_expenses`, RLS dono-only). Frequência pelo proxy agenda + execuções (decisão do Abner).
  "Sem dado suficiente" quando não há base. Validado com dado real (out 100%, atraso 1 de 1,
  despesa no total e isolada por mês).

- **Gráficos do painel R11:** SVG puro (sem lib — o projeto não tinha nenhuma), só o mês selecionado,
  cálculos intocados: donut de despesas por categoria, barras recebido × despesas × lucro, barra
  horizontal no top 5 de escolas e aro/gauge nas 3 taxas (cinza vazio quando "sem dado suficiente").
  Paleta categórica validada (3 slots). Validado em out/nov/dez; console limpo.

- **Financeiro em 4 abas:** Visão Geral (painel R11 + "+ Nova despesa" em bottom sheet com o mesmo
  `ExpenseForm`), A receber e Despesas (iguais, promovidas a abas) e Mensalidades (nova, consulta:
  ativos com mensalidade e status, filtros escola/turno/rota combináveis, "Editar" → cadastro do
  aluno). Abas = o segmentado do Financeiro extraído para `SegmentedTabs` (único padrão existente).
  Validado navegação, filtro combinado e o botão rápido; console limpo.

- **Ranking top 5 escolas pelo NOME:** decisão do Abner revisada — agrupa por `students.school`
  (bruto), caindo no `school_address` só se o nome estiver vazio (mesma regra do filtro da aba
  Mensalidades). tsc limpo; **validação no navegador pendente** (sessão encerrada por limite de uso).

- **Toque: diagnóstico + pressionado + emojis:** medido antes de corrigir — toque→click 1–2 ms;
  toque→resposta do servidor 750–1700 ms, sem nenhuma mudança visual no meio; causa = falta de
  feedback (sem `:active`, sem `loading.tsx`), não o delay de 300 ms (viewport já o desliga).
  `touch-action: manipulation` + `:active` (opacidade, só CSS) globais, fora o arrastável; 7 emojis
  trocados por lucide (o 🦘 pelo ícone da marca — lucide não tem canguru). Validado em lista de alunos,
  home e Modo Direção (mobile emulado); console limpo.

- **Esqueletos de carregamento + início da troca de região (parcial):** `loading.tsx` nas telas do
  motorista (home em grupo `(home)` para o esqueleto não vazar), "Iniciando…" no Iniciar ida/volta.
  Commit `1a03cbc`, sem push. Região confirmada em `iad1` (`x-vercel-id: gru1::iad1`); baseline sem
  login ~714 ms. **Pausado** antes do login em produção — ver "ONDE PAROU" nas Pendências em aberto.

- **Instalação do PWA + `/baixar`:** auditoria achou maskable falso e apple-touch com transparência;
  ícones refeitos, manifest com `id`/`scope`/`lang`, página pública `/baixar` com detecção de sistema
  (Android: `beforeinstallprompt` + fallback manual; iOS: passo a passo do Safari; desktop: "abra no
  celular"). Validado no navegador, tsc e testes (5/5). Instalação real em Android/iPhone pendente do
  Abner (ver Pendências em aberto).

- **Marketplace — Frente C (perfil público):** migration 036 (cidades/bairros/escolas em texto livre,
  faixa etária, turnos, faixa de preço pública em centavos separada do valor real por aluno, toggle
  "aparecer no marketplace", foto da van) + bucket PÚBLICO `van-photos` (escrita dono-only; o
  `driver-photos` privado intocado). Seção "Marketplace" em Editar perfil e card-resumo em
  Configurações. Validado no navegador; banco limpo ao final. Próxima: Frente D (não iniciada).

- **Marketplace — Frente D (vitrine pública):** migration 037, função `marketplace_listing()`
  (`SECURITY DEFINER`, whitelist de 13 colunas, sem `select *`, sem policy nova nas tabelas-base) que só
  lista motorista com toggle ligado + perfil completo + todos os campos da Frente C + telefone. Teste de
  guarda `docs/tests/marketplace_view.sql` 5/5 como `anon` (aparece/não aparece, 19 requisitos um a um,
  colunas = whitelist exato sem dado restrito, tabelas-base fechadas). Sem UI. Próxima: Frente E (não iniciada).

- **Marketplace — Frente E (busca + perfil público):** `marketplace_listing` ganhou filtros (cidade, bairro,
  escola, idade, turno), paginação e `public_id` dentro do banco, assinatura active/trial como requisito e
  telefone só no perfil (migration 038; teste de guarda 7/7 com 20 requisitos). Telas públicas `/buscar` e
  `/buscar/[id]` com WhatsApp direto e rate limit por IP (busca 30/min, perfil 15/min; em memória, limites
  documentados). "Solicitar vaga" NÃO construído: o link de captação é um segredo por (turno + escola) e rotear
  exigiria publicar o token — gap descrito acima, aguardando decisão. Validado no navegador; banco limpo.

- **Marketplace — Frente E.1 ("Solicitar vaga"):** link de captação GENÉRICO e opt-in (`capture_links.kind`,
  um ativo por motorista, toggle em Configurações = criar/revogar, token novo ao religar). O pai preenche escola
  e turno no formulário público; mesma fila `pending`, mesmo consentimento, mesma aprovação (`approve_capture`
  usa o que o pai informou). `/buscar/[id]` mostra "Solicitar vaga" só com o genérico ativo; senão, só o
  WhatsApp. Migration 039; testes de guarda 7/7 (captacao_generica) e 7/7 (marketplace_view). Validado no
  navegador; envio real do pai pela UI fica para o teste manual. Banco limpo.

- **Frente E.1 — teste manual ponta a ponta:** o pai (conta sintética criada pelo formulário real, numa janela
  anônima, por Abner) enviou escola e turno livres pelo link genérico; a fila do motorista mostrou "(informado
  pelo pai)"; aprovado pela tela → aluno ativo correto. Conta, aluno, vínculos e dados de teste removidos
  (resíduo 0). Confirmação de e-mail está desligada no projeto. Achado: 3 links genéricos de outro motorista
  ("Kangu App"), um ativo.

- **Marketplace — Frente F (/admin + log de buscas):** allowlist por uuid (`admin_users`, fechada; semente
  manual — e-mail sozinho seria burlável com a confirmação desligada), 4 funções `admin_*` com
  `admin_assert()` (42501), middleware 403 + layout + banco como 3 camadas, 4 telas somente leitura
  (motoristas, responsáveis, fila de captação cross-motorista sem botões, buscas) e `marketplace_search_log`
  (só filtros + hora, insert-only). Migration 040; teste `admin_guard.sql` 6/6. Validado como anônimo, como
  usuário real não-admin (inclusive pela API REST) e como admin temporário com dado real; banco limpo.
  Admin real: `house@domhub.co` semeado (conta criada no painel pelo Abner). Fecha o bloco marketplace (A–F).

- **Modo Direção — texto do arraste + R9 em movimento:** arraste sempre "Embarcar/Desembarcar <nome>" (perto ×
  longe só no estilo); R9 testado com GPS simulado em movimento — ativo, mas o painel piscava com GPS oscilando em
  torno dos 100 m; corrigido com histerese (`sheetAutoTarget`: expande ≤100 m, recolhe >130 m, faixa morta
  entre). Faixa recolhida mostra a distância até a parada. Testes 26/26; execução de teste removida.

- **Admin — Visão Geral, Assinaturas e Moderação:** 3 migrations (041–043) e 3 testes de guarda (6/6, 4/4,
  6/6, mais o `admin_guard` re-executado 6/6). Visão Geral como landing (cards, novos cadastros em 30 dias,
  funil buscas→pedidos→status, ranking de cidades/escolas, donut de assinatura; polling de 45 s reusando
  `AutoRefresh` e os gráficos do R11). Assinaturas (trial do mais antigo ao mais novo, tempo desde o cadastro).
  Moderação (fotos públicas das vans + IPs com mais buscas; o log passou a guardar o IP por 30 dias — decisão
  nova, impacto de LGPD registrado). Validado no navegador com dado real/sintético; banco limpo.

- **Cobertura guiada (4 partes, 4 commits):** substitui a entrada livre da Frente C por seleção guiada. O
  **armazenamento não mudou** — continua sendo 3 colunas `text` (nomes separados por vírgula; **não são arrays**
  de verdade, apesar do nome informal "arrays de texto"), então a action, `marketplace_listing` (Frente D) e o
  filtro de busca (Frente E) ficaram intocados.
  - **1/4 — `cities` (migration 044):** 645 municípios de SP. **Fonte:** API de localidades do IBGE,
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios` (id = código IBGE do município,
    7 dígitos). Estado fixo `'SP'` (check). Importação: `scripts/import-cities.ts` (upsert por id, valida 645 /
    ids únicos / todos SP; `--dry`). Leitura pública (anon + authenticated); sem escrita por API.
  - **2/4 — `schools` (migration 045):** 30.746 escolas **em atividade** de SP. **Fonte:** INEP, Censo Escolar
    da Educação Básica **2024** (microdados abertos, `microdados_ed_basica_2024.csv`, zip oficial
    `microdados_censo_escolar_2024`; sha256 do zip e md5 do CSV conferem com o arquivo de hashes do INEP; o
    Censo 2025 ainda não estava publicado — URL devolvia 404). Filtro: `SG_UF = 'SP'` e
    `TP_SITUACAO_FUNCIONAMENTO = 1` (em atividade). CSV: 215.545 linhas no Brasil → 33.863 de SP → 3.117
    inativas descartadas → **30.746** importadas. `CO_MUNICIPIO` (INEP) é o mesmo código do IBGE, então
    `schools.city_id` liga a `cities.id` **sem casar por nome**. Colunas: `inep_code` (pk), `city_id`, `name`,
    `dependency` (1 federal, 2 estadual, 3 municipal, 4 privada), `census_year`. Importação única fora do request:
    `scripts/import-schools.ts --file <csv> [--dry]` (CSV em latin1, em streaming; idempotente — rerodar = 30.746).
    O CSV/zip **não** estão no repo. Para atualizar no ano seguinte: baixar o novo censo e rodar o script de novo.
  - **3/4 — seleção guiada no perfil (migration 046 + `CoverageSelector`):** SP fixo → cidades em multi-seleção
    (busca sem acento, "adicionar outra cidade") → por cidade, escolas em checklist alfabético (com busca e
    "selecionar todas") e bairros em checklist alfabético de um **pool compartilhado** (`neighborhoods`) que
    cresce com "+ adicionar bairro" (RPC `add_neighborhood`: só motorista, normaliza separadores/espaços, 2–60
    caracteres, deduplica sem diferença de maiúsculas **por cidade**, teto de 300 bairros criados por motorista;
    escrita direta por API negada; leitura só authenticated). Semente do pool: bairros de motoristas com UMA cidade só
    (hoje 1 linha: "Jardim Campo Verde", Mauá). Teste `docs/tests/cobertura_bairros.sql` **5/5**. Cadastro antigo
    em texto livre **não se perde**: o que não casa com a base aparece como "do cadastro antigo" (removível) e
    continua sendo salvo; enquanto a base carrega, o submit devolve o valor original. Validado no navegador
    (cidade, busca com/sem acento, selecionar todas/limpar, adicionar bairro com normalização e dedup, carga de
    cadastro antigo com casamento sem diferença de caixa); console sem erros; resíduo de teste removido (0).
  - **4/4 — autocomplete de endereço:** auditoria — aluno (novo/editar) e CaptureForm já usavam
    `AddressAutocomplete` (Mapbox Geocoding). Faltavam o **endereço residencial do motorista** (agora com
    número/complemento) e o **endereço da escola no link de captação** (opcional; campo zera após criar o link).
    Sem lib nova. Validado no perfil (sugestões reais, coordenada ao escolher); o formulário do link de captação
    **não foi exercitado na tela** porque o motorista de teste está com perfil incompleto (portão) — usa o mesmo
    componente já validado.
  - **Achados / decisões abertas:** (a) **teto de 150 escolas por cidade** — a capital tem 7.304 escolas e salvar
    todas poluiria o perfil público; "Selecionar todas" age sobre o que a busca mostra e se recusa acima do teto;
    (b) [resolvido pela migration 047 — nome de exibição] nomes oficiais do INEP vêm **em MAIÚSCULAS, sem acento e no formato "NOME PROFESSORA"/"NOME COLEGIO"** (ex.:
    "ADELAIDE ESCOBAR BUENO PROFESSORA") — vão assim para o perfil público e para o filtro; decidir se vale um
    nome de exibição amigável; (c) nomes de escola repetidos na mesma cidade viram uma opção só (a coluna salva é
    por nome); (d) o pool de bairros é aberto a qualquer motorista (freio só por volume) — sem moderação ainda; vale
    uma tela no /admin Moderação se aparecer lixo; (e) cadastros antigos com várias cidades não alimentam o pool
    (o dado antigo é uma lista plana, sem dizer qual bairro é de qual cidade).

- **Hierarquia de fundo em 3 camadas (ajuste visual, prioridade temporária):** sem mudar a paleta (amarelo /
  azul-marinho / branco). **Branco** = fundo padrão de toda tela (o `body` era o cinza-claro `#F2F4F7`; agora é
  branco, cartões brancos seguem com borda); **creme** = destaque secundário (token `--color-cream`, que é o
  amarelo da marca a 14% sobre branco — não é cor nova); **azul-marinho** sólido = destaque primário, texto branco
  e amarelo. `Card` ganhou `tone="white|cream|navy"` (`components/ui.tsx`). Aplicado: responsável — Início
  (`JourneyTimeline`, o bloco "a caminho da parada…", agora azul-marinho; "Fora do horário de rota" e "Cadastro em
  análise" em creme), Pagamentos (novo cartão azul-marinho **"A pagar"** com total em aberto, nº de faturas e
  próximo vencimento — soma só o que a consulta já trazia; avisos do Pix em creme), Perfil (cartão do usuário em
  creme); motorista — Configurações (cartão do perfil em creme); avisos informativos em amarelo-transparente
  (`ProfileGateNotice`, `RouteRunList`, `RouteBuilder`, novo aluno, destaque de `HomeContent`) padronizados no creme.
  O motorista já tinha azul-marinho na próxima parada (Início) e no resumo do Financeiro. Avisos de atenção/erro
  (âmbar/vermelho) ficaram como estão; o /admin não foi tocado (tem seu próprio fundo). Amarelo segue só em botão
  primário, marca e trecho concluído. Só classes/tokens — nenhuma lógica nem dado. Validado em página temporária
  (removida) com os componentes reais; telas do responsável não foram vistas logadas (sem sessão de responsável no
  navegador). **Divergência:** o brief pede "login com hero amarelo sólido + card branco", mas o login real é branco
  com o logo no topo — não alterei, aguardando decisão.

- **Escolas — nome de exibição amigável (migration 047, achado (b) da Cobertura guiada):** `schools.display_name`
  (nullable, sem `,;` nem quebra de linha) ao lado do `name` oficial do INEP, que **não muda** (continua sendo a
  chave de reimportação e valendo na busca). Regra pura em `src/lib/school-name.ts` (`friendlyName`), aprovada
  numa amostra de 30 escolas reais: iniciais maiúsculas (ligações "de/da/do/e" em minúsculo), siglas preservadas
  (EMEF, EMEI, EMEB, CEI, EE, ETEC, APAE, SESI, romanos…), **título movido para o início** ("… PROFESSORA" →
  "Professora …"; "Prof."/"Profa."/"Dr."/"Doutor"/"Padre"…), **tipo no fim movido para o início** ("… COLEGIO" →
  "Colégio …", "… EMEF" → "EMEF …"; título entra logo depois do tipo), abreviações inequívocas expandidas (CR
  Creche, ESC Escola, PART Particular, CONV Conveniada, INDIR Indireta, DIR Direta, REC INF Recreação Infantil,
  "CR P CONV" = Creche Particular Conveniada), "E M E I" colapsa em EMEI, e acentos só de um dicionário curto
  (José, João, São, Colégio, Educação…). Limites conhecidos: palavra fora do dicionário fica sem acento
  ("Purificacao", "Brandao") — o dicionário cresce conforme aparecerem casos; prefixos desconhecidos ("CEL JTO EE…")
  não são reordenados. Backfill: `scripts/backfill-school-display-names.ts` (`--dry`; idempotente) gravou **30.746
  de 30.746** (0 inválidos, `name` intacto, rerodar = 0 a gravar); `scripts/import-schools.ts` passa a gravar
  `display_name` nas reimportações. Seletor: lista/salva o nome amigável (ordem alfabética pelo exibido), a **busca
  vale para o exibido e para o oficial**, e cadastros antigos que salvaram o nome oficial continuam casando (viram
  o nome amigável ao salvar de novo). Testes unitários `tests/school-name.test.ts` (29/29 no total).

- **Escolas que o motorista atende (migration 048):** `driver_schools` (motorista × escola, por `inep_code`, sem
  casar por nome) é a **fonte única** da cobertura de escolas. Escrita só por `set_my_schools(codes, extras)`
  (SECURITY DEFINER, exige ser motorista; teto 150 por cidade e 300 no total; **substitui** a lista) que grava na
  mesma transação `driver_profiles.service_schools` (nomes de exibição + nomes digitados à mão que não existem no
  INEP) — o marketplace (Frente D/E) segue lendo o texto, sem mudança. Leitura da tabela dono-only (RLS). Leitura
  pública mínima para o formulário do pai: `capture_link_schools(token)` (só nomes, só de link **ativo**); `get_capture_link`
  e `submit_capture` **não** foram tocados. Teste `docs/tests/driver_schools.sql` **6/6** (só motorista; substitui +
  sincroniza o texto; código inválido/extras ruins; tetos; isolamento e escrita direta negada; link ativo × revogado ×
  desconhecido, sem login). **UI:** o checklist de escolas do perfil (Editar perfil → Marketplace) agora grava por
  código (nome igual na mesma cidade = um item que carrega todos os códigos); o texto antigo vira reserva para quem
  ainda não passou pela migração e os nomes sem correspondência no INEP ("do cadastro antigo") seguem como extras.
  Enquanto o seletor carrega, `school_sync` não é enviado e a action não mexe nas escolas. Novo `SchoolPicker`
  (escolha única + busca) em **aluno novo, editar aluno, link de captação (motorista) e formulário do pai**: mostra só
  a lista do motorista; sem lista configurada cai na **busca por digitação** em todas as escolas de SP (≥ 3 letras,
  mostra a cidade); sempre há "Outra escola (digitar)"; `students.school` segue texto. Restrição só na tela (o servidor
  aceita qualquer texto). Validado no navegador com o motorista logado: perfil (códigos e extras corretos no
  submit, legado "Todas" preservado), editar aluno (valor salvo aparece, busca com cidade, escolha, "Outra escola");
  console limpo; nada foi salvo na conta de teste. **Não exercitado na tela:** modo "lista configurada" (precisa salvar
  o perfil com escolas — coberto pelo teste de banco) e o formulário do pai (precisa de um link genérico ativo).

- **Regra de cobertura: cidade → bairro → escola (ajuste, migration 049):** cidade atendida é obrigatória; bairro e
  escola são opcionais e independentes (vazio = "todos dentro das cidades que atende"; marcado = restringe ao marcado).
  Correção no que já existia: sem `driver_schools`, o `SchoolPicker` agora busca só nas escolas das **cidades que o
  motorista atende** (`service_cities`), não no estado todo (no estado todo só se não houver nenhuma cidade cadastrada —
  nunca bloqueia). Para o pai (sem login) a nova `capture_link_cities(token)` devolve as cidades do dono de um link
  ativo (casa `service_cities` com `cities` sem diferença de caixa); teste `docs/tests/capture_link_cities.sql` 3/3.
  Visto na tela o modo "lista configurada" (a conta de teste já tinha 3 escolas salvas: aparece só a lista + "Outra
  escola"); o recorte por cidade no modo sem lista não foi visto na tela (a conta já está configurada).
  **Marketplace público NÃO usa esse fallback e hoje contradiz a regra:** `marketplace_visible` exige bairros E
  escolas preenchidos para o motorista aparecer, e o filtro só casa tokens explícitos — mudar para "vazio = todos
  da cidade" mexe nas funções públicas das Frentes D/E; decisão e desenho no retorno desta fatia.

- **Bairros atendidos (fatia 1 de 2 — migration 050):** `driver_neighborhoods` (motorista × bairro do pool `neighborhoods`)
  é a fonte única dos bairros atendidos, no mesmo padrão de `driver_schools`: `set_my_neighborhoods(ids, extras)`
  (SECURITY DEFINER, só motorista, substitui a lista, **150 por cidade / 300 no total**) grava também
  `driver_profiles.service_neighborhoods` na mesma transação; leitura dono-only, escrita direta negada. Teste
  `docs/tests/driver_neighborhoods.sql` **5/5**. **Seed do pool com o IBGE** (`scripts/import-neighborhoods-ibge.ts`,
  Censo 2022 — Agregados por Bairro, `Agregados_por_bairros_basico_BR.csv`): 2.170 bairros de SP em 58 municípios →
  descartados 127 de ruído ("RP 1-1", "Regiões de Planejamento", ≤ 2 letras, só números) → **2.042 inseridos em 54
  municípios** (Mauá, p.ex., só tinha "RP…" e ficou sem semente: segue só com o que os motoristas adicionam; São Paulo
  capital e Campinas não têm bairros no IBGE); idempotente (rerodar = 0 a inserir); pool agora com 2.044 linhas.
  **UI:** o checklist de bairros do perfil grava por id (`hood_ids`/`hood_extra`); texto antigo é só reserva, nomes sem
  correspondência ficam como "do cadastro antigo". Os recém-adicionados via "+ adicionar bairro" recarregam a cidade
  para pegar o id (e, se o envio for mais rápido, vão como nome). Achado: cadastros de teste usaram "Todas"/"Todos"
  como texto livre para dizer "todos" — a regra nova (vazio = todos) torna isso desnecessário; aparecem como "do cadastro
  antigo" e podem ser removidos. Visto na tela (conta de teste): ids 1 e 304 casados do texto salvo, legado "Todos"
  preservado, campo antigo `service_neighborhoods` fora do formulário, console limpo; nada salvo.

- **Marketplace: cidade → bairro → escola, vazio = todos (fatia 2 de 2 — migration 051):** `marketplace_visible` exige
  só **cidade** (bairro e escola deixaram de ser requisito); no filtro de `marketplace_listing`, lista marcada restringe
  ao marcado e lista **vazia** casa qualquer bairro/escola que pertença a uma cidade do motorista (e à cidade do filtro,
  se houver); a escola casa o nome de exibição **ou** o oficial do INEP (cadastros antigos). Contrato de colunas da
  listagem inalterado. Dropdowns **city-first**: `marketplace_filter_options(p_city)` (sem cidade: só cidades; com cidade:
  bairros dela — pool + marcados — que ao menos um motorista atende, com a contagem) e a nova
  `marketplace_school_options(p_city, p_q)` (busca de escola na cidade, até 20, com a contagem; as escolas são milhares).
  `/buscar`: a cidade recarrega a busca e zera bairro/escola; bairro fica desabilitado até escolher a cidade; escola é
  um typeahead (`FilterControls`); o perfil público mostra "Todos os bairros/Todas as escolas de X" quando a lista é
  vazia. Testes: **`docs/tests/marketplace_coverage.sql` 4/4** (visibilidade só por cidade; filtro de bairro e de escola
  com lista marcada × vazia, outra cidade, nome oficial; opções city-first e contagens) e o
  **`marketplace_view.sql` 7/7** re-executado e adaptado (saíram os casos "bairros/escolas faltando escondem"; opções
  passaram a ser city-first). Índices novos `lower(display_name)` e `lower(name)`. Aplicação: houve uma janela de
  poucos minutos entre a migration e o deploy em que os dropdowns de bairro/escola do `/buscar` público ficaram só com
  "Todas" (sem erro). **Não re-executei** os testes de guarda do /admin (usam `marketplace_visible`, mas só com
  fixtures completos). **Não exercitado na tela:** o fluxo cidade → bairro → escola no `/buscar` com dados reais — hoje
  não há motorista visível em produção (a tela foi vista no estado vazio, console limpo); o comportamento está provado
  no banco pelos testes. Conta de teste do Abner continua com o toggle do marketplace desligado.

- **Validação do /buscar com dado real (conta de teste do Abner, autorizada por ele):** tirados "Todas"/"Todos" do cadastro
  antigo; subida uma foto de teste genérica (a visibilidade exige foto da van — a tela de Configurações dizia
  "Aparecendo" sem ela: ponto a corrigir). Com lista marcada (3 escolas, 2 bairros): cidade → recarrega com os bairros
  dela, escola em typeahead (as 3 marcadas, "1 motorista"), filtros marcado → 1, não marcado → 0. Com listas VAZIAS
  (temporário, depois restaurado): qualquer bairro/escola de Mauá → 1, escola de São Paulo → 0, perfil público "Todos os
  bairros de Mauá / Todas as escolas de Mauá". **Bug achado e corrigido (d6ab141):** o perfil público dava 500 com
  bairros/escolas nulos (`splitList(null)`) — chegou a ir ao ar com a fatia 2; corrigido. A busca de escola passou a
  esconder as que nenhum motorista atende (contagem 0).

- **Editar perfil em 5 categorias + status REAL da vitrine (migration 052):** a tela de Configurações dizia "Aparecendo"
  olhando só o toggle; agora usa `my_marketplace_status()` (SECURITY DEFINER, só motorista) que calcula `visible` pela
  MESMA `marketplace_visible` (nunca diverge) e `missing` (toggle, assinatura, veículo, cidades, idades, turnos, preço,
  foto, telefone, nome). Configurações: "Aparecendo" só se visível, senão "Não aparece" + "Falta: …" + link para
  completar. Teste `docs/tests/my_marketplace_status.sql` **3/3** (anon/responsável recusados; completo → visível; cada
  requisito faltando → invisível + código certo + igual à vitrine pública; restaurar limpa). **Editar perfil**
  (`EditDriverForm`) reorganizado em cartões: **Meu perfil** (nome, telefone, e-mail, endereço) · **Veículo** ·
  **Acompanhamento** (modo Mapa/Linha do tempo, antes só em Configurações; salva ao tocar, fora do "Salvar") ·
  **Assinatura Kangu** · **Marketplace** (status real da vitrine no topo — azul-marinho quando aparece, creme com o que
  falta quando não —, foto, onde atende, idades, turnos, preço, toggle). Cores seguem as 3 camadas (branco/creme/azul).
  Achado: os botões do `TrackingModeToggle` não tinham `type="button"` e enviariam o formulário ao serem usados dentro
  dele — corrigido. **Nota:** a spec "categorização do Editar perfil" que o Abner citou como pendente não estava no
  progresso.md; implementei as 5 categorias que ele listou (e mantive o bloco de acompanhamento também em Configurações).
  Conta de teste: toggle do marketplace **desligado** (Configurações: "Não aparece — Falta: ligar…"; /buscar volta ao vazio).
  Sobraram, por decisão de não mexer sem pedido: a foto de teste no bucket público (fora da vitrine, sem link) e o
  "Receber pedidos pela vitrine" ainda ligado (link de captação genérico ativo; só era descoberto pelo perfil público).

- **Limpeza da conta de teste + Acompanhamento só no Editar perfil:** a pedido do Abner, "Receber pedidos pela vitrine"
  desligado (o link de captação genérico fica revogado), a foto de teste da van apagada (objeto do bucket `van-photos` e
  `van_photo_path`, só daquele motorista e daquele caminho; resíduo 0) e o bloco "Como os pais acompanham" **saiu de
  Configurações** — o modo Mapa/Linha do tempo agora vive só na seção Acompanhamento do Editar perfil (sem duplicidade).
  Conferido na tela: Configurações sem o bloco, switch persistido desligado, status da vitrine "Falta: ligar o toggle,
  foto da van" (a regra real do banco, agora também com a foto removida).

- **Configurações em LISTA de categorias + telas por categoria (salvar por tela) + causa das cores "não aplicadas":**
  `/motorista/perfil` agora é uma lista (ícone + nome + seta): **Meu perfil** (`/meu-perfil`), **Veículo** (`/veiculo`),
  **Acompanhamento** (`/acompanhamento`), **Assinatura Kangu** (`/assinatura`), **Marketplace** (`/marketplace`); abaixo
  seguem Notificações, Suporte e Sair como estavam. Cartão do perfil em **creme** no topo; a linha do Marketplace fica
  **azul-marinho** quando a vitrine está no ar (status REAL, `my_marketplace_status`) e **creme** com "falta: …" quando não;
  a linha do Veículo fica creme se faltam dados da van. Cada categoria é uma rota com cabeçalho (seta de volta + título) e
  **seu próprio Salvar**, via `src/lib/actions/driver-settings.ts` (`saveMyProfile`, `saveVehicle`, `saveTracking`,
  `saveSubscription`, `saveMarketplace`): cada uma grava só os campos dela e volta à lista. O `updateDriverProfile` único e
  o `EditDriverForm` foram removidos; `/motorista/perfil/editar` só redireciona para a lista; o aviso "Complete seu perfil"
  agora leva a `/veiculo`. O "Receber pedidos pela vitrine" foi para dentro de Marketplace (salva ao tocar). Saíram de
  Configurações, por serem duplicados ou não-configuração: o resumo de veículo, o resumo de marketplace, o cartão Contato
  (os dados estão em Meu perfil) e os contadores de alunos/rotas (existem nas abas Alunos/Rotas).
  **Causa das cores "não aplicadas":** `(driver)/layout.tsx` e `(guardian)/layout.tsx` tinham o fundo fixo `bg-[#f5f7fa]`
  (cinza fora da paleta) que cobria o branco do `body` — o "branco como fundo padrão" nunca apareceu nas telas logadas.
  Trocado por `bg-white` (e no sheet de despesas). Validado no navegador (motorista logado): lista, as 5 telas abrindo
  pelo toque e salvando (voltam à lista), Acompanhamento mudado para Linha do tempo e restaurado, Marketplace
  preservando 3 escolas/2 bairros/cidade, console limpo (as mensagens antigas no buffer são de uma queda transitória
  de compilação). **Não visto na tela:** a linha do Marketplace em azul-marinho (a conta de teste está fora da vitrine).

- **3 padrões de diferenciação de itens (aprovados pelo Abner):** `src/components/patterns.tsx` — `StatusPill` (verde = concluído/pago/ativo/em andamento, amarelo-claro = pendente, cinza = agendado/neutro; Vencida âmbar com borda mais forte; Suspensa vermelha), `IconBadge` (ícone amarelo em círculo azul-marinho) e `StepDot` (navy = concluído, amarelo = atual, cinza = futuro; sobre navy: branco/amarelo/branco translúcido). Mapas de fatura/pagamento unificados em `lib/pay-status.ts`. Aplicado: Início (lista de embarque), Rotas (pílula por rota/perna), Modo Direção (paradas), Alunos (lista, detalhe, aprovações, links de captação), Financeiro (faturas, detalhe com linha do tempo), despesas, Configurações e Notificações (ícones), Novo aluno (stepper), Exceções, Construtor de rota; responsável: Jornada (stepper sobre navy), atalhos, "Seus filhos", Pagamentos e Ausências. "Ausente" unificado em cinza. /admin fora. **Visto na tela:** Alunos, Rotas, Configurações, Novo aluno. **Não visto:** Início com rota ativa, Modo Direção, detalhe de fatura, Financeiro "A receber", telas do responsável (sem sessão), Exceções e Captação.

- **Revisão na tela dos 3 padrões (2026-11-09, deploy de produção do ddfd4c7 confirmado):** vistos e corretos — Início com rota ativa (marcador amarelo, "Próxima", pílulas verde/cinza), Modo Direção (cartão branco + marcador + "Próxima"), Financeiro "A receber", detalhe de fatura (pílula), Exceções (círculo navy + "Não roda"), Captação ("Ativo" verde), e do responsável: Início (atalhos com IconBadge), Pagamentos ("Em aberto"/"Vencida"), Ausências (pílula cinza "Agendada" vista com uma ausência de teste de amanhã, desfeita em seguida). Dados de teste criados e removidos (exceção removida; link de captação revogado). **Ainda não vistos:** linha do tempo da fatura (nenhuma fatura tem evento; registrar evento é dado real), Modo Direção em "Embarcou/Ausente", Jornada do responsável com rota ativa (stepper sobre navy) e "Seus filhos" com pílula (Zara não está em jornada). Conta de responsável de teste vinculada à Zara Louise (criada pelo Abner). **Decisão do Abner (2026-11-09):** os três itens não vistos (stepper da Jornada em rota ativa, pílulas de "Seus filhos", linha do tempo da fatura) ficam **aceitos sem validação visual direta** — são os mesmos componentes (`StepDot`, `StatusPill`) já confirmados em outras telas, e não se mexe em rota ou fatura real só para vê-los.

- **Modo Direção — card "Parada atual" em azul-marinho + endereço limpo:** o hero da parada atual virou card navy sólido (rótulo e distância em amarelo, nome em branco grande, endereço em branco/70, arraste "Embarcar [Nome]" dentro com trilha translúcida; "Embarcou" amarelo, "Ausente" com borda branca). "Abrir navegação" saiu do card (secundário, largura total); ocorrência/encerrar seguem no rodapé próprio. `src/lib/address.ts` (`formatStopAddress`, com `tests/address.test.ts` 4/4) exibe só "rua, número · bairro" (tira CEP, país, cidade/UF, número duplicado e códigos de planejamento tipo "Rp10"); o endereço original segue no banco e na navegação. Lógica de embarque/gate 100 m/G1/G2 intacta. Visto na tela (Bruna: "Rua Jorge Beretta, 69"); a distância em amarelo só aparece com GPS (não vista sem sinal).

- **Modo Direção — navegação no mapa do app:** o menu "Abrir navegação" da parada atual ganhou "Navegar no mapa do app" (amarelo) ao lado de Waze/Google Maps. Navegando: câmera segue a van, linha amarela van → parada atual (Directions do Mapbox, pt-BR, recalcula se sair >60 m da rota), banner de manobra no topo ("Em 380 m — Vire à direita…") com X para sair; segue para a próxima parada sozinho. Marcador do motorista = canguru (ícone da marca) em círculo amarelo; a próxima parada é uma bolinha com a foto do aluno (inicial se não houver) e selo com o número. `src/lib/navigation.ts` + `tests/navigation.test.ts` (3 testes). Posição só em memória, enviada ao Mapbox apenas para traçar o caminho (G4/G5 intactos; só em foreground). Visto na tela com GPS simulado por script (menu, banner, rota, recálculo, bolinha "B"/1). **Não visto:** GPS real no aparelho, bolinha com foto real, câmera girando com o rumo.
- **Arraste de embarque:** folga de 4 px nos quatro lados do thumb, trilha preenchida em gradiente amarelo→verde conforme o arraste e check verde a partir de 85%.

- **Rotas: editar/apagar com autonomia + edição em cartões + dia de pagamento por aluno (migration 053):** a "Rota manhã" não editava por ser rota antiga de uma perna (a edição só aceitava `both`) e não existia apagar. Agora toda rota edita (a antiga vira "ida e volta" ao salvar; a lista dela vira a ida ou a volta) e a tela de edição tem "Zona de perigo → Apagar rota" com confirmação (`deleteRoute`; remove paradas, exceções e histórico de viagens da rota em cascata, avisando a contagem; alunos/faturas/ausências ficam; bloqueia com viagem em andamento). Corrigido: escolher o turno numa rota sem turno zerava as listas. Formulário em cartões: Dados da rota (navy), Quando roda (creme), Ida (navy), Volta (creme), Exceções (creme), zona de perigo (vermelho claro). **Data de pagamento:** `students.payment_due_day` (1–31, nulo = padrão dia 10; migration 053 aplicada no SQL Editor); cartão "Data de pagamento" em todo aluno (`PaymentDayField`: Adicionar/Alterar/Remover); `generateMonthlyInvoices` usa o dia do aluno (`lib/payment-day.ts`, mês curto → último dia; 4 testes). Visto na tela: editar da Rota manhã (sem salvar), criar+apagar rota de teste, dia 15 na Zara (persistiu; removido). **Não visto:** salvar a Rota manhã (conversão para ida e volta) e gerar fatura com dia próprio.

- **Esquema de cartões por cor estendido (2026-11-09):** regra — azul-marinho só no resumo/ação principal (um por tela), creme para o que pede atenção/operacional, branco para dados; todo cartão com cabeçalho de ícone (`Section`/`InfoRow` em `components/ui.tsx`; `IconBadge`/`StatusPill` ganharam `onDark`, com neutro translúcido e pendente em amarelo cheio sobre navy). Aplicado: detalhe e edição do aluno, as 5 telas de Configurações (+ toggle de pedidos em creme), Financeiro (Visão Geral com Lucro em navy e Em atraso em creme; A receber; Mensalidades; Despesas; detalhe da fatura; Régua). **Fora desta rodada:** Início, lista de Alunos, Notificações, Cadastros a aprovar, Captação, Novo aluno (stepper) e telas do responsável.

- **LGPD — fatia A (retenção do GPS, log de IP separado, registro de exceções; migrations 055–057, teste `docs/tests/lgpd_retencao.sql` 13/13):** decisões aprovadas pelo Abner em 2026-11-09 (convite-primeiro como regra e modo assistido como único alternativo; revogação de um responsável suspende a criança para todos; IP e dispositivo gravados no aceite; log legal cobre logado e público por ora; consentimentos da vitrine separados por toggle; alunos de teste Bruna/Zara apagados antes do novo fluxo; segue no plano Free **sem backup** — pendência separada antes do piloto com dado real). Ordem A→E. **A feita:** (1) `pg_cron` instalada no banco (estava só disponível); (2) GPS — gatilho `trg_purge_live_position` apaga a posição quando a execução sai de `in_progress`, `endRoute` também apaga (`drive.ts`), job `kangu_cleanup_live_positions` a cada 15 min apaga posição parada >24 h, limpeza única do que estava retido (havia 5 linhas); (3) log de IP — nova `marketplace_search_ip_log` (só IP + hora, 30 dias, job diário `kangu_purge_search_ip_log`), `marketplace_search_log` ficou sem a coluna `ip` e sem ligação com ele, `log_marketplace_search` e `admin_search_ips` reescritas (a limpeza deixou de ser "de carona" na busca); (4) `retention_exceptions` (categoria, titular, justificativa, base legal, prazo, responsável, status) só admin, com 2 linhas 'a_confirmar' (financeiro e evidência de consentimento) — redação final é do jurídico; sem tela de admin ainda. **Falta:** B log legal de acesso 6 meses, C consentimentos (pedir texto literal), D anonimização/exclusão, E evidências.

- **LGPD — fatia B (log legal de acesso, 6 meses; migration 058, testes `docs/tests/lgpd_log_acesso.sql` 13/13 + `tests/access-log.test.ts`):** `app_access_log` (IP + hora + usuário opcional + área authenticated/public), cobrindo logado e público (a confirmar com o advogado). **Gravação por sessão, não por requisição:** o middleware (`lib/supabase/middleware.ts`) chama `log_app_access(p_ip)` em segundo plano (`event.waitUntil`, nunca atrasa nem derruba a resposta); filtros baratos antes (só GET, memória local de 30 min por IP+usuário) e o banco decide: só insere se não há registro do mesmo IP + usuário nas últimas 6 h (início da sessão + renovação a cada 6 h). Trava de inundação de 2000 registros/hora no total. **Sem chave secreta no middleware** (`SUPABASE_SECRET_KEY` só existe em scripts locais e provavelmente não está na Vercel): o usuário vem de `auth.uid()` do próprio token; só o IP vem do chamador — risco residual: quem chamar a função direto pode gerar ruído limitado, nunca apagar/alterar (ninguém tem update/delete); se virar problema, gravar com a chave de servidor. IP do cliente: `x-vercel-forwarded-for` → `x-forwarded-for` → `x-real-ip`; loopback ignorado. O Next não repassa `RSC`/`next-router-prefetch` ao middleware, então prefetch conta (mesmo navegador, absorvido pelo dedupe). Retenção: job diário `kangu_purge_app_access_log` apaga > 6 meses. Leitura só pelo admin (`admin_access_log` por usuário ou IP, máx. 500). Visto no app local: 3 requisições do mesmo IP → 1 linha; loopback → 0; linhas de teste removidas. **Falta:** C consentimentos (pedir texto literal), D anonimização/exclusão, E evidências; tela de admin para o log e para `retention_exceptions`.

- **LGPD — fatia C (consentimento específico da criança, foto e vitrine; migrations 059–060, teste `docs/tests/lgpd_consentimento.sql` 24/24):** **convite-primeiro no banco**: não existe mais policy de insert em `students` — o aluno só nasce em `approve_capture`, que exige a autorização ativa do responsável; `submit_capture` (assinatura nova, a antiga foi removida) recusa cadastro sem as duas declarações. Tabela `consents` (kind child_data/child_photo/marketplace_listing/marketplace_requests; titular, criança, método remote/assisted_in_person/driver_self, método de verificação, versão + sha256 + cópia do texto exibido, declarações marcadas, IP, dispositivo, data, revogação com IP), funções `revoke_consent`, `reauthorize_child`, `accept_photo_consent`, `accept_driver_consent`; `students.consent_status` (awaiting/authorized/suspended) só muda pelas funções (flag local `kangu.consent_internal`). **Efeitos:** revogar `child_data` suspende a criança para todos (qualquer responsável reautoriza); o motorista só enxerga aluno `authorized` (RLS), rota só aceita parada autorizada; foto só se houver autorização de foto ativa (storage + `student_photo_allowed`), revogar apaga o arquivo (o responsável tem delete); vitrine só liga/cria link genérico com o aceite do texto (trigger), desligar o toggle retira o aceite. **Textos:** `src/lib/consent-texts.ts` — A2, A3 e A4 literais do jurídico (versão `2026-11-v1`; marcadores [NOME DO PRESTADOR]/[IDENTIFICAÇÃO DA CRIANÇA] preenchidos); "Receber pedidos" e a confirmação de revogação são rascunho de produto. **Telas:** captação do responsável (bloco da autorização com as 2 declarações + foto "Continuar com foto/sem foto" + link presencial `?assistido=1`), Perfil → Autorizações do responsável (retirar com confirmação e aviso, reautorizar, autorizar/retirar foto), Marketplace do motorista (prévia + texto antes de ativar cada toggle), "Convidar responsável" no lugar de "Adicionar aluno" (`/alunos/novo` redireciona; `saveNewStudent` removida). Alunos de teste Bruna e Zara apagados (aprovado); 12 alunos de teste antigos ficam 'awaiting' (invisíveis ao motorista) — decidir se apaga. **Pendências da C:** convite de SEGUNDO responsável (`accept_student_invite`) ainda não exige o aceite próprio dele; foto enviada só pelo motorista após a autorização (o responsável não sobe foto); `reject_capture` não elimina o dado (fatia D); tela admin para evidências; texto do aceite da conta (Termos/Política) reescrito por mim sem a parte da criança; fluxos de tela não vistos logados (só SSR da captação e teste de banco).

- **LGPD — fatia C, fechamento (2026-11-09):** migration 061 — quem aceita convite de segundo responsável dá o PRÓPRIO aceite da criança (`accept_student_invite(token, consent)`; a versão sem aceite foi removida; o aceite do convite não reativa criança suspensa). Alunos de teste apagados (Bruna, Zara e os 12 antigos; foi preciso encerrar 2 viagens de teste presas em andamento por causa da G2). **Conferido no navegador, logado:** Marketplace do motorista (prévia + texto literal antes de ativar cada toggle; aceite grava método `driver_self`, versão, hash, texto, dispositivo; desligar+salvar retira o aceite) e responsável — captação com o texto literal e as duas declarações, Autorizações (retirar com confirmação e aviso datado → "Suspensa", reautorizar → "Autorizada", retirar/autorizar foto). Correções de tela achadas na conferência: turnos da prévia (Manhã/Tarde/Integral) e aviso de retirada que ficava depois de reautorizar. Dados de teste dessa conferência removidos por id; ficou o cadastro pendente "Abner test" (teste do próprio Abner, com autorização `remote`). **Ainda pendente:** IP do aceite só aparece em produção (cabeçalho da Vercel); foto enviada só pelo motorista; `reject_capture` não elimina dado (fatia D); tela admin de evidências.

- **Ajuste: escola escolhida pelo pai + endereço em partes (2026-11-10; migration 063, teste `docs/tests/escola_endereco_partes.sql` PASSOU; `lgpd_consentimento` e `lgpd_retencao_exclusao` ajustados e PASSARAM; tsc limpo, 47 testes de TS):** o link de captação não leva mais escola (preview devolve `school` nulo; o motorista só escolhe o turno). O pai escolhe a escola numa lista fechada (`capture_link_schools`, sem texto livre) e o banco recusa escola fora de `driver_schools` em `submit_capture` (qualquer tipo de link). Endereço de embarque e desembarque em 4 campos obrigatórios (rua, número, bairro, cidade; `AddressFields`), partes gravadas em `capture_submissions` e `students` (+8 colunas), texto composto no banco (`rua, número - bairro, cidade`), `approve_capture` leva escola e partes ao aluno e `_anonymize_student` apaga as partes. Edição do aluno exige as partes (número obrigatório também para cadastrados; só no formulário, não no banco). Fora desta fatia: motorista cadastrar aluno sem link (adiado). Pendente: `captacao_fatia2_rls`, `captacao_fatia3_geocode`, `captacao_fatia4_aprovacao` e `captacao_generica` já estavam desatualizados desde a 059 (chamavam `submit_capture` sem autorização) e foram marcados como tal no cabeçalho; telas não vistas logadas.

- **Front do pai: rota ativa sozinha (2026-11-13; sem migration; tsc limpo, 47 testes de TS):** bug do teste real (rota iniciada não aparecia ao pai). Dados do banco estavam certos (vínculo, autorização, paradas nas duas pernas, `service_date` em `sp_today()`, `get_active_journey` devolvia a jornada); a falha era só da tela: o Início, sem rota, não tinha `AutoRefresh`, e a aba Rotas era texto fixo. Agora `getGuardianJourney` + `GuardianJourneyCard` são compartilhados por Início e Rotas > Hoje; fora do horário atualiza a cada 30 s e `AutoRefresh` pausa em segundo plano (volta atualizando). G4/G5/G6 intactas. Validado logado: Início e Rotas > Hoje mostram a jornada ativa; **falta conferir o caso "Início aberto antes de iniciar a rota → aparece em até 30 s"**.

- **Reabrir rota encerrada por acidente (2026-11-13; migration 064, teste `docs/tests/reabrir_rota.sql` PASSOU; `rotas_edit` (G2), `g1_volta_sem_ausente` (G1) e `embarque_100m` (G1/G5) PASSARAM):** `reopen_route_execution(execution_id)` (SECURITY DEFINER) só deixa o motorista dono reabrir uma execução `completed` de HOJE (`sp_today`), reativando a MESMA execução (`in_progress`, `ended_at` nulo) e gravando o evento `execution_reopened` com o `ended_at` original; não toca nos embarques (G1) e não cria linha (nenhum gatilho de INSERT dispara; sem notificação). Fecha um furo: o dono tinha RLS "all" e podia fazer `completed→in_progress` direto; agora um gatilho recusa esse par fora da função. Acréscimo ao escopo: `get_active_journey` passou a calcular `ended` como "`route_ended` posterior à última reabertura", senão o pai veria "Rota concluída" numa rota reaberta (resto da função idêntico à 033). Botão "Reabrir rota" com confirmação no cartão "Concluída hoje" (home e /rotas); o "Encerrar" já tinha confirmação com contagem de paradas pendentes. G4: o GPS apagado não é restaurado. Nota: os testes antigos `rotas_edit`, `g1_volta_sem_ausente` e `embarque_100m` já falhavam desde a fatia C (fixture sem `consent_status = 'authorized'`); rodei cópia só com a fixture corrigida, asserções intactas. **Validado no navegador (motorista):** ida iniciada, aluno embarcado, encerrada, "Reabrir ida" + confirmação, voltou ao Modo Direção na MESMA execução com 1/2 preservado; no banco: execução `in_progress`/`ended_at` nulo e eventos `route_started, embarked, route_ended, execution_reopened` (com o `ended_at` original). A visão do pai numa rota reaberta está provada só pelo teste SQL (os alunos de teste não têm responsável). A confirmação virou folha de largura total (a inline ficava espremida na meia coluna); o botão aparece também no cartão "Concluída hoje" da home (mesmo `RouteRunList`), e reabrir uma segunda vez no mesmo dia funcionou. Dados de teste (2 alunos "TESTE", rota, paradas, execução e eventos) criados para a validação e removidos em uma transação por ids exatos, sem tocar `app_access_log` (48) nem `erasure_ledger` (0). `rotas_edit`/`g1_volta_sem_ausente`/`embarque_100m` não passam sem alteração desde a fatia C (fixture sem autorização; confirmado rodando a fixture literal de `g1_volta_sem_ausente` e `rotas_edit`).

- **Notificação "rota iniciada" (2026-11-13; migration 065, teste `docs/tests/rota_iniciada_notificacao.sql` PASSOU; `reabrir_rota`, `rotas_edit`, `g1_volta_sem_ausente` e `embarque_100m` (fixture autorizada) seguem passando com o gatilho no ar):** `apply_route_review` e `startRoute` NÃO foram alterados. Um gatilho `AFTER INSERT` em `route_executions` (só `in_progress`) chama `notify_route_started()` (SECURITY DEFINER; `notifications` segue sem policy de INSERT). Destinatários: responsáveis vinculados a alunos da perna (`route_stops.kind`), exceto ausência declarada no dia/trajeto (ida = `outbound`, volta = `inbound`, ou `both`; execução legada sem perna usa a direção da rota), aluno sem autorização (`consent_status <> 'authorized'`), arquivado ou anonimizado. Texto genérico: "O motorista iniciou a rota de ida." / "de volta." / "O motorista iniciou a rota." (legada); sem nome de criança, motorista nem localização. Idempotente (gatilho é por INSERT, reabrir é UPDATE e não dispara; a função ainda confere se já existe aviso da execução). Falha engolida por bloco `EXCEPTION`: provado com um CHECK que recusa todo insert em `notifications` (a execução nasce igual). Limite: roda na mesma transação do início da rota (um insert + um select indexado); não é assíncrono, só não pode derrubar. Só in-app: o pai vê ao abrir o app (contador de não lidos no Início), sem push.

> Ao fim de cada sessão, atualizar o log e as seções afetadas.

---

## 10. Próximo bloco (ideia, não planejada)

> **Não é escopo atual.** Registro para não se perder. Não planejar nem codar até
> virar um bloco próprio com plano de escopo.

**Descoberta pública de motoristas por escola (v2).** Hoje o app não é marketplace
(seção 1): o motorista já chega com a carteira dele. Esta ideia adiciona uma camada
de descoberta **sem** virar marketplace de intermediação — o pai busca pelo **nome da
escola** do filho (sem login) e vê os motoristas cadastrados que atendem aquela
escola/rota. O **contato acontece fora do app** (WhatsApp/telefone); ao fechar, o
motorista manda o **link de captação que já existe hoje** — o cadastro do filho segue
o fluxo já construído e provado (formulário público atrás do token, fila de aprovação,
portão G5), **sem mudança nenhuma ali**.

Escopo novo, quando for planejado:

- **Perfil público do motorista (opt-in, toggle "publicar na busca").** O que fica
  público precisa ser decidido com cuidado: rota/bairro/região (**não** endereço
  exato), escola, turno, vagas disponíveis, foto da van, contato. O **endereço
  residencial do motorista** (campo que já existe no cadastro) **NUNCA** entra nesse
  público — hoje é dado interno; exigiria um **"perfil público" separado do perfil
  operacional**, não expor o campo atual.
- **Tela de busca pública por nome de escola, sem login.**
- **CNH / verificação de documento:** cogitar como requisito para aparecer na busca —
  aqui o contato é entre **desconhecidos**, diferente do modelo atual de indicação
  pessoal (por isso hoje CNH está fora do v1, seção 3). Decisão a amadurecer quando for
  planejar este bloco, **não agora**.
- **Reaproveita 100% o link de captação e o portão G5 já existentes** — não é reescrita
  do cadastro, é uma porta de entrada nova para o mesmo fluxo provado.

**Endereço 2.0 (ideias futuras, não escopo agora).** O geocoding hoje (Fatia A da rota
sugerida) é um autocomplete de endereço via Mapbox Geocoding + um campo número/complemento
que refina a query. Duas evoluções ficam anotadas para quando o endereço merecer um bloco
próprio:

- **Busca de escola por nome (Mapbox POI).** Hoje a escola é digitada como endereço-texto e
  geocodada como endereço comum. O ideal seria buscar a escola pelo **nome** (ex.: "EMEF
  Fulano") via Mapbox POI/places e trazer a coordenada do estabelecimento — mais preciso e
  natural que digitar o endereço da escola. **Não implementado.**
- **Redesenho completo de endereço.** CEP que autopreenche rua/bairro/cidade/estado
  (ex.: ViaCEP/BrasilAPI) + **número em campo próprio persistido** (coluna dedicada, não
  concatenado no texto) + complemento à parte. Substituiria o autocomplete atual por um
  formulário de endereço estruturado, com a coordenada derivada de rua+número. É a versão
  "certa" do que a fatia do número/complemento resolve de forma mínima hoje — fica para
  quando valer o investimento.

**ETA ao vivo durante a rota (ideia futura, não escopo agora).** — *Atualização: a variante
PRÉ-PARTIDA já foi construída (ver seção 8, "Sugestão de horário de saída de casa", commit
`ffa7c8b`): "saia até HH:MM" antes de iniciar, origem = endereço cadastrado geocodificado, sem
GPS/janela G4. O que segue aqui é a OUTRA variante, ao vivo, ainda não feita.* Mostrar "chega em
~X min na próxima parada / termina ~HH:MM" **durante** a rota exige uma chamada de rota
recalculada com a **posição da van** — custo de API, cache e a **janela do G4** (só com rota
`in_progress` em foreground). Merece fatia própria; a Optimization v1 (Fatia B) devolve
`trips[].duration` e a Directions já é usada no traçado, então há de onde partir.

- **LGPD — fatia D (retenção e exclusão; migration 062, teste `docs/tests/lgpd_retencao_exclusao.sql` 23/23; tsc limpo, 47 testes de TS):** **Relógio de 30 dias:** `students.purge_after` é preenchido por gatilho ao arquivar o aluno ou suspendê-lo (revogação) e limpo ao desarquivar/reautorizar. **Anonimização** (`_anonymize_student`, só definer): zera nome/nascimento/escola/endereços/coordenadas/responsável/foto (vira "Aluno removido", arquivado e suspenso, `anonymized_at`), apaga paradas, vínculos, convites, ausências e cadastros de captação do aluno, desliga `route_events.student_id`, enfileira a foto em `storage_purge_queue`, grava `erasure_ledger` (só ids + motivo retention_30d/subject_request/admin). **Mantidos:** faturas (obrigação fiscal/contratual) e `consents` (prova do aceite) — exceções de retenção a confirmar com o jurídico. Job diário `kangu_retention_daily` (03:41) roda `anonymize_due_students()` (uma falha não trava as outras) e `purge_stale_submissions()` (rejeitadas e pendentes > 30 dias, com o consentimento da submissão). **Rejeitar cadastro** (`reject_capture`) agora apaga a submissão e o aceite na hora; as rejeitadas existentes foram limpas. **Pedido de exclusão:** `request_erasure` (responsável vinculado; 1 pendente por responsável+criança) → botão "Pedir exclusão dos dados da criança" em Autorizações; `/admin/exclusoes` lista pedidos e o registro de exclusões, e o admin decide (`admin_decide_erasure`: procedente apaga na hora; `admin_erase_student` também existe). `reauthorize_child` recusa criança já removida. **Limitações/pendências:** (1) arquivos de foto na fila NÃO são apagados sozinhos (Storage não aceita DELETE por SQL; sem chave de serviço na Vercel) — hoje é rotina manual/API; (2) sem backup no plano Free; ao ter backup, restaurar desfaz exclusões posteriores → reaplicar o `erasure_ledger` (guardar cópia dele fora do banco) e perguntar ao suporte do Supabase sobre backup isolado/prazo e remoção de arquivos; (3) o caminho admin (decidir/apagar) só foi provado quanto à recusa de não-admin — a execução feliz usa a mesma `_anonymize_student` já testada, mas a tela `/admin/exclusoes` não foi vista logada como admin; (4) sem aviso ao responsável do resultado (hoje é prometido na tela, o envio é manual). **Falta:** fatia E (evidências de segurança).
