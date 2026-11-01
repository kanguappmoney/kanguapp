import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Portão de perfil completo do motorista: sem prefixo, placa, modelo e cor do
// veículo, ele não cadastra/edita aluno, não gera link de captação e não envia
// convite. Não é guarda de segurança (G1–G6) — é exigência de cadastro, imposta
// aqui no servidor (server actions) + aviso na tela. Fonte única das duas pontas.
const REQUIRED = [
  ["prefix", "Prefixo"],
  ["plate", "Placa"],
  ["model", "Modelo"],
  ["color", "Cor"],
] as const;

export interface ProfileGate {
  complete: boolean;
  missing: string[]; // rótulos dos campos vazios
}

export const getProfileGate = cache(async (): Promise<ProfileGate> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("prefix, plate, model, color")
    .eq("driver_id", user?.id ?? "")
    .limit(1)
    .maybeSingle();

  const missing = REQUIRED.filter(
    ([key]) => !String(vehicle?.[key] ?? "").trim(),
  ).map(([, label]) => label);

  return { complete: missing.length === 0, missing };
});

// Mensagem padrão das server actions bloqueadas.
export function profileGateError(gate: ProfileGate): string {
  return `Complete seu perfil em Configurações antes de continuar (falta: ${gate.missing.join(", ")}).`;
}
