// Textos de consentimento (LGPD). Os três primeiros (autorização da criança, foto, "Aparecer no marketplace") são
// REDAÇÃO LITERAL do jurídico: não parafrasear nem "melhorar". Os dois últimos são rascunho de produto (marcados) e
// podem ser trocados. Mudou qualquer palavra? Troque CONSENT_VERSION: cada aceite grava a versão, o hash e a cópia
// do texto exibido.

export const CONSENT_VERSION = "2026-11-v1";
export const PRIVACY_EMAIL = "privacidade.kangu@domhub.co";

export type ConsentKind = "child_data" | "child_photo" | "marketplace_listing" | "marketplace_requests";

// ---- Autorização específica dos dados operacionais da criança (A2) — LITERAL ----------------------------------
// Marcadores dinâmicos: [NOME DO PRESTADOR] = nome do motorista; [IDENTIFICAÇÃO DA CRIANÇA] = nome da criança.
export const CHILD_DATA_TEMPLATE: string[] = [
  "[NOME DO PRESTADOR] é responsável pelo uso dos dados de [IDENTIFICAÇÃO DA CRIANÇA] para organizar seu transporte escolar. A Kangu fornece a plataforma e processa esses dados para o prestador. Serão usados nome, informação etária necessária, escola, turno, horários e pontos de embarque e desembarque, inclusive suas coordenadas. Turma/ano serão solicitados somente quando necessários. Esses dados não serão publicados na vitrine nem usados para publicidade.",
  `O acesso será limitado ao prestador, às pessoas por ele autorizadas para a operação, aos responsáveis com vínculo validado e aos fornecedores técnicos necessários, conforme a Política de Privacidade. Você pode recusar o aplicativo e acompanhar o transporte diretamente com o prestador por mensagem direto no WhatsApp. A recusa não impede o transporte contratado.`,
  `Você pode revogar esta autorização ou pedir acesso, correção e exclusão pelo canal ${PRIVACY_EMAIL}. A revogação poderá encerrar funções do aplicativo relacionadas a esses dados, sem invalidar usos anteriores lícitos. Após o término do vínculo, os dados operacionais serão eliminados em até 30 dias, ressalvadas justificativas legais específicas; backups isolados expirarão em até 90 dias após a exclusão ativa. Detalhes, fornecedores e exceções estão na Política.`,
];
export const CHILD_DATA_CHECKBOXES: string[] = [
  "Declaro ser pai, mãe ou responsável legal por esta criança e possuir poderes para esta autorização.",
  "Autorizo, de forma específica, o tratamento dos dados descritos acima para a gestão e o acompanhamento do transporte escolar na Kangu.",
];

// ---- Autorização de foto (A3) — LITERAL. Botões: "Continuar com foto" / "Continuar sem foto". -----------------
export const PHOTO_TEMPLATE: string[] = [
  `Autorizo o uso da foto de [IDENTIFICAÇÃO DA CRIANÇA] exclusivamente para facilitar sua identificação pelas pessoas autorizadas no transporte. A foto não será pública nem utilizada para reconhecimento facial. Sei que posso usar o serviço sem foto e retirar esta autorização em ${PRIVACY_EMAIL}.`,
];
export const PHOTO_BUTTON_WITH = "Continuar com foto";
export const PHOTO_BUTTON_WITHOUT = "Continuar sem foto";

// ---- Vitrine: "Aparecer no marketplace" (A4) — LITERAL --------------------------------------------------------
export const LISTING_TEMPLATE: string[] = [
  `Quero publicar os dados exibidos nesta prévia na vitrine da Kangu. Entendo que serão acessíveis ao público e que posso retirar a publicação em ${PRIVACY_EMAIL}.`,
];

// ---- Vitrine: "Receber pedidos" — RASCUNHO de produto (não veio do jurídico; pode ser trocado) ----------------
export const REQUESTS_TEMPLATE: string[] = [
  "Quero receber pedidos de famílias interessadas através da vitrine da Kangu, no contato informado no meu perfil. Posso desativar isso a qualquer momento em Configurações.",
];

// ---- Confirmação de revogação — RASCUNHO de produto (tela de UI) ---------------------------------------------
export function revocationNotice(dateLabel: string): string {
  return `Autorização retirada em ${dateLabel}. A partir de agora, os dados afetados deixam de ser usados para essa finalidade, sem invalidar o que já foi feito antes. Você pode reativar quando quiser, repetindo o consentimento.`;
}

// Troca os marcadores dinâmicos pelos nomes reais.
export function fill(paragraphs: string[], vars: { provider?: string; child?: string }): string[] {
  return paragraphs.map((p) =>
    p
      .replaceAll("[NOME DO PRESTADOR]", vars.provider?.trim() || "[NOME DO PRESTADOR]")
      .replaceAll("[IDENTIFICAÇÃO DA CRIANÇA]", vars.child?.trim() || "[IDENTIFICAÇÃO DA CRIANÇA]"),
  );
}

export const TEMPLATES: Record<ConsentKind, { paragraphs: string[]; checkboxes: string[] }> = {
  child_data: { paragraphs: CHILD_DATA_TEMPLATE, checkboxes: CHILD_DATA_CHECKBOXES },
  child_photo: { paragraphs: PHOTO_TEMPLATE, checkboxes: [] },
  marketplace_listing: { paragraphs: LISTING_TEMPLATE, checkboxes: [] },
  marketplace_requests: { paragraphs: REQUESTS_TEMPLATE, checkboxes: [] },
};
