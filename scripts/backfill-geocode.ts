// Backfill de coordenadas (Rotas 2.0, Fatia A). Geocoda os endereços de alunos
// JÁ cadastrados que ainda estão sem lat/lng — escola, embarque e desembarque,
// cada um independente. Enriquece o dado antigo de uma vez, para a Fatia B
// (rota sugerida) não precisar geocodar sob demanda.
//
// SEGREDOS: lidos SÓ do ambiente (via --env-file=.env.local). NADA é hardcoded
// aqui e este arquivo é seguro de commitar. Usa a SUPABASE_SECRET_KEY (server,
// ignora RLS para varrer todos os alunos do piloto) e o token público do Mapbox.
//
// Rodar:
//   node --env-file=.env.local scripts/backfill-geocode.ts --dry   # só mostra
//   node --env-file=.env.local scripts/backfill-geocode.ts         # grava
//
// Idempotente: só toca linhas com coordenada nula e endereço presente — rodar
// de novo não reprocessa nem sobrescreve o que já tem coordenada.
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

for (const [name, val] of [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SECRET_KEY", SECRET_KEY],
  ["NEXT_PUBLIC_MAPBOX_TOKEN", MAPBOX_TOKEN],
] as const) {
  if (!val) {
    console.error(
      `Falta ${name}. Rode com: node --env-file=.env.local scripts/backfill-geocode.ts`,
    );
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL!, SECRET_KEY!, {
  auth: { persistSession: false },
});

// Mesma API/params do AddressAutocomplete (Brasil, pt). Devolve [lat, lng] ou null.
async function geocode(address: string): Promise<[number, number] | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=br&language=pt&limit=1&types=address,place,locality,neighborhood`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: { center: [number, number] }[] };
  const c = json.features?.[0]?.center; // [lng, lat]
  return c ? [c[1], c[0]] : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Os três pontos por aluno, cada um com seu endereço e par de colunas lat/lng.
const POINTS = [
  { addr: "school_address", lat: "school_lat", lng: "school_lng", nome: "escola" },
  { addr: "pickup_address", lat: "pickup_lat", lng: "pickup_lng", nome: "embarque" },
  { addr: "dropoff_address", lat: "dropoff_lat", lng: "dropoff_lng", nome: "desembarque" },
] as const;

type Row = Record<string, string | number | null> & { id: string; full_name: string };

async function main() {
  console.log(DRY ? "== DRY-RUN (não grava) ==" : "== BACKFILL (grava) ==");

  const { data, error } = await supabase
    .from("students")
    .select(
      "id, full_name, school_address, school_lat, school_lng, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng",
    );
  if (error) {
    console.error("Erro lendo students:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];
  let geocoded = 0;
  let semMatch = 0;
  let jaOk = 0;

  for (const row of rows) {
    const updates: Record<string, number> = {};
    for (const p of POINTS) {
      const addr = row[p.addr] as string | null;
      const hasCoord = row[p.lat] != null && row[p.lng] != null;
      if (!addr || hasCoord) {
        if (hasCoord) jaOk++;
        continue;
      }
      const coord = await geocode(addr);
      await sleep(150); // ~400/min, sob o limite do Mapbox (~600/min)
      if (!coord) {
        semMatch++;
        console.warn(`  sem match: ${row.full_name} · ${p.nome} · "${addr}"`);
        continue;
      }
      updates[p.lat] = coord[0];
      updates[p.lng] = coord[1];
      geocoded++;
      console.log(
        `  ${DRY ? "[dry] " : ""}${row.full_name} · ${p.nome} → ${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}`,
      );
    }
    if (!DRY && Object.keys(updates).length) {
      const { error: upErr } = await supabase
        .from("students")
        .update(updates)
        .eq("id", row.id);
      if (upErr) console.error(`  erro gravando ${row.full_name}: ${upErr.message}`);
    }
  }

  console.log(
    `\nResumo: ${geocoded} geocodado(s)${DRY ? " (não gravado)" : ""}, ${semMatch} sem match, ${jaOk} já com coordenada. ${rows.length} aluno(s) no total.`,
  );
  if (semMatch) console.log("Os 'sem match' precisam de ajuste manual do endereço.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
