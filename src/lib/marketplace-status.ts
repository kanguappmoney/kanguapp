// Status REAL de visibilidade do motorista na vitrine pública (RPC `my_marketplace_status`, migration 052):
// `visible` vem da mesma regra do banco (`marketplace_visible`), nunca só do toggle. `missing` são códigos.
export interface MarketplaceStatus {
  listed: boolean;
  visible: boolean;
  missing: string[];
}

export const MISSING_LABEL: Record<string, string> = {
  toggle: "ligar “Aparecer no marketplace”",
  assinatura: "assinatura em dia (não pausada)",
  veiculo: "dados do veículo (prefixo, placa, modelo e cor)",
  cidades: "cidade atendida",
  idades: "idade mínima e máxima",
  turnos: "ao menos um turno",
  preco: "faixa de preço",
  foto: "foto da van",
  telefone: "telefone",
  nome: "nome",
};

export function missingText(missing: string[]): string {
  return missing.map((m) => MISSING_LABEL[m] ?? m).join(", ");
}

export function parseStatus(data: unknown): MarketplaceStatus | null {
  const d = data as Partial<MarketplaceStatus> | null;
  if (!d || typeof d.visible !== "boolean") return null;
  return { listed: Boolean(d.listed), visible: d.visible, missing: Array.isArray(d.missing) ? d.missing : [] };
}
