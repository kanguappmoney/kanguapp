# Kangu: estado atual (ler no início de toda sessão)

> Resumo curto e vivo. O histórico completo continua em `docs/progresso.md` (não foi
> apagado nem renomeado; as referências "progresso.md, seção X" no código seguem válidas).
> Consultar o `progresso.md` **por busca** (grep na seção ou no assunto), nunca ler inteiro.
> Atualizado em 2026-11-10 (último commit: `34d4291`; ajuste da migration 063 ainda sem commit).

## Produto
- PWA B2B2C de transporte escolar. Motorista de van = cliente pagante; responsáveis entram
  por convite/link do motorista. Pai paga o motorista direto (Pix); o app só rastreia ("A receber",
  nunca "repasse"). Assinatura do motorista → Kangu fica fora do app no piloto.
- Já existe camada de **vitrine pública** (marketplace de descoberta: `/buscar`, perfil público
  opt-in, "Solicitar vaga" por link opt-in). Contato fora do app. Ver progresso.md seção 8 e log.
  ⚠️ A seção 1 do progresso.md ainda diz "NÃO é marketplace na v1" e a seção 10 trata a vitrine
  como ideia futura: estão desatualizadas. Vale o que foi construído.

## Guardas inegociáveis (impostas no banco sempre que possível; somem da UI)
- **G1** nunca bloquear a volta de quem embarcou (inadimplência nunca tira a volta).
- **G2** motorista sempre confirma antes de sair ("Revisão de hoje" + "Levar mesmo assim");
  nada removido no meio de execução em andamento (paradas congeladas por trigger).
- **G3** suspensão só com aviso *entregue*; falhou a entrega → escala pro motorista.
- **G4** GPS só em foreground e só com rota `in_progress`. Posição apagada ao encerrar.
- **G5** endereço/dados nunca expostos a responsável não vinculado (RLS). Mapa do pai mostra
  só o pino do motorista, nunca marcadores de parada.
- **G6** motorista escolhe Mapa (GPS) ou Linha do tempo (sem GPS; banco nunca entrega
  `live_positions`).
- Recorrência e proximidade de 100 m **mostram, nunca bloqueiam**.
- "G" é reservado às guardas; grupo de alunos se chama "Turma".
- Status: todas as seis ativas e provadas em teste de banco (`docs/tests/`).

## Método de trabalho
- Uma fatia por sessão: plano aprovado pelo Abner antes do código; build → validate → scale.
- RLS/guardas desde o dia 1; guarda é provada por teste no banco, nunca presumida.
- Migrations forward-only. Desde a 019 foram aplicadas pelo **SQL Editor** (histórico
  `supabase_migrations` termina na 018): reconciliar antes de usar `supabase db push`.
- Ao fim da sessão: atualizar ESTE arquivo (status/pendências) e acrescentar uma entrada
  curta no log (seção 9) do `progresso.md`. Não despejar relatório longo no progresso.md.

## Decisões travadas (resumo; detalhe na seção 3 do progresso.md)
- Fatura por aluno; sem pagamento parcial. Estados `pending → overdue → suspended → paid`
  (+ `canceled`); tolerância mínima 2 dias; "atualizar vencidas" manual no piloto.
- Pix manual no piloto (Asaas com CNPJ da dom hub, webhook só pós-piloto).
- Mapbox (não Google); sem Navigation SDK no v1.
- Sem CNH/verificação de documento, sem estrelas no v1. Foto = bucket privado + RLS (G5).
- Removidos do v1: QR de embarque, cartão/boleto, assinatura no app, webhook Asaas.
- Notificações no piloto: in-app + motorista avisa no WhatsApp na mão. WhatsApp real = fase 2.
- LGPD (aprovado 2026-11-09): convite-primeiro como regra e modo assistido presencial como
  único alternativo; aluno só nasce em `approve_capture` com autorização ativa; revogar
  `child_data` suspende a criança para todos; IP e dispositivo gravados no aceite; textos de
  consentimento A2–A4 são literais do jurídico (`src/lib/consent-texts.ts`, versão `2026-11-v1`);
  motorista só enxerga aluno `authorized`.

- **Regra de texto livre (F2, 2026-11-13):** não criar campo de motivo livre em `absences` nem novo campo livre sobre criança
  sem texto do jurídico. Os três campos livres existentes (`occurrences.note` ≤ 200, `route_exceptions.reason` ≤ 120,
  `erasure_requests.note` ≤ 300) têm aviso "não escreva dados de saúde ou de deficiência", limite no banco e apagamento
  (nota da ocorrência na anonimização; motivo do pedido ao resolver). O responsável não lê `occurrences` (policy removida).

## Identidade visual e padrões de UI
- Amarelo `#FFD000`, azul-marinho `#0D1B3D`, cinza `#F2F4F7`, branco. Poppins SemiBold
  (títulos) + Inter (corpo). Ícones lucide-react, nunca emoji.
- Cabeçalho branco com título navy; exceção: Modo Direção (escuro, imersivo).
- Cartões: navy só no resumo/ação principal (um por tela), creme para atenção/operacional,
  branco para dados; todo cartão com cabeçalho de ícone (`Section`/`InfoRow` em `components/ui.tsx`).
- Padrões em `src/components/patterns.tsx`: `StatusPill` (verde concluído/pago/ativo,
  amarelo-claro pendente, cinza agendado/neutro, Vencida âmbar, Suspensa vermelha), `IconBadge`,
  `StepDot`. Mapas de status em `lib/pay-status.ts`.

## Onde estamos
- Todos os blocos de produto construídos (fundação, cadastro/convite, captação, rotas 2.0 com
  recorrência e rota sugerida, Modo Direção com navegação, Linha do tempo, Modo Mapa, fotos,
  financeiro + despesas/painel R11, ausências/ocorrências, vitrine pública, PWA + `/baixar`).
- Produção na Vercel região `gru1`. Supabase "Kangu App" (sa-east-1). `main` em dia com o remoto.
- **Bloco atual: LGPD (fatias A→E).** A, B, C e D feitas (migrations 055–062).
- Ajuste feito (2026-11-10, migration 063): escola escolhida pelo pai na lista do motorista; endereço em rua/número/bairro/cidade obrigatórios.
- Reabrir rota encerrada (migration 064) e front do pai (rota ativa sozinha) feitos em 2026-11-13; reabertura validada no navegador (lado motorista); falta só o caso do pai com o Início aberto antes de iniciar a rota. Notificação "rota iniciada" (migration 065, gatilho AFTER INSERT; só in-app) feita no mesmo dia.
- **Depois: LGPD fatia E (evidências de segurança)** (perguntas em aberto: incluir `invoices`/`consents` na prova de G5; parar e avisar ao achar falha).

## Pendências antes do piloto
- Validação de LGPD com profissional antes de qualquer dado real de criança (inclui base legal
  do IP por 30 dias, exceções de retenção `retention_exceptions` 'a_confirmar', faturas e
  consentimentos mantidos após anonimização).
- **Backup:** projeto está no plano Free, **sem backup**. Resolver antes do piloto; ao ter
  backup, restaurar desfaz exclusões → reaplicar o `erasure_ledger` (guardar cópia fora do banco).
- Fotos na `storage_purge_queue` não se apagam sozinhas (sem chave de serviço na Vercel): rotina manual.
- Telas admin ainda não vistas logadas: `/admin/exclusoes`; faltam telas admin para log de
  acesso, `retention_exceptions` e evidências. Aviso ao responsável do resultado da exclusão é manual.
- IP do aceite só aparece em produção (cabeçalho da Vercel).
- Testes manuais do Abner: fotos, financeiro, "Suspensões a revisar".
- Device real: GPS em movimento (câmera com rumo, auto-recolher do sheet) e instalação do PWA
  (Android maskable/splash; iPhone standalone; navegador dentro do Instagram/WhatsApp).
- `README.md` do repo está desatualizado (vale o estado dos commits/migrations).

- Testes SQL de `docs/tests/`: 30 de 30 passam (E0, 2026-11-13).
- Telas do ajuste (captação do pai, edição do aluno) ainda não vistas logadas. Motorista cadastrar aluno sem link: adiado ("por enquanto").

## Lacunas conhecidas (sem bloqueio)
- Sininho do motorista vazio por desenho (nada gera notificação para ele ainda).
- Painel R11: "Em atraso" mostra o estado atual (não filtra pelo mês); frequência/atraso usam a
  configuração atual da rota.
- Aprovação vinda de captação segue liberada com perfil incompleto (rever se o portão vale ali).
- Vitrine: definir requisitos mínimos para listar; foto da van é pública sem moderação; IP vem de
  `x-forwarded-for`; `log_marketplace_search` chamável com a chave anon (spam limitado);
  escola em texto livre no link genérico.
- `route_exceptions.reason`, motivo de ausência e texto de ocorrência são texto livre: antes de
  expor ao pai, tratar como dado sensível (ver progresso.md seção 7).

## Fase 2 (decidido, fora do piloto)
Webhook Asaas, WhatsApp real (N8N), "hora de sair" com trânsito, ETA ao vivo durante a rota,
Endereço 2.0 (busca de escola por nome, CEP estruturado), arte com a grafia certa "Kangu".
