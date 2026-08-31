// Formatação/parse de dinheiro (centavos <-> BRL).
export function centsToBRL(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Aceita "250", "250,00", "250.00", "R$ 250,00" -> centavos. null se inválido.
export function brlToCents(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
