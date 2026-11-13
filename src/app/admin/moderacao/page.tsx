import Link from "next/link";
import { fmtDateTime, listSearchIps, listVanPhotos } from "@/lib/admin";
import { vanPhotoUrl } from "@/lib/marketplace";
import { removeVanPhotoAction } from "@/lib/actions/moderation";
import { AdminTable, Badge, ErrorNote, Panel, Td } from "@/components/admin/AdminUi";

type SP = Promise<Record<string, string | string[] | undefined>>;

// Moderação SOMENTE POR VISIBILIDADE: nenhuma ação automática, nenhum bloqueio.
//  1) fotos públicas das vans (revisão visual periódica);
//  2) IPs com maior volume de busca no período (identificar abuso à mão).
export default async function AdminModeracaoPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.dias) ? sp.dias[0] : sp.dias;
  const days: 7 | 30 = raw === "30" ? 30 : 7;

  const [photosRes, ipsRes] = await Promise.all([listVanPhotos(), listSearchIps(days)]);
  const photos = await Promise.all(
    photosRes.rows.map(async (p) => ({ p, url: await vanPhotoUrl(p.van_photo_path) })),
  );
  const ips = ipsRes.rows;
  const totalPeriod = ips[0]?.total_in_period ?? 0;
  const totalWithIp = ips[0]?.total_with_ip ?? 0;

  return (
    <>
      <h2 className="font-display text-xl text-navy-900">Moderação</h2>
      <p className="mt-1 text-sm text-navy-700/70">
        Só visibilidade — o Kangu não age sozinho sobre nada daqui.
      </p>

      <h3 className="mb-2 mt-6 font-display text-lg text-navy-900">Fotos públicas das vans</h3>
      <p className="mb-3 text-sm text-navy-700/70" data-testid="resumo-fotos">
        {photos.length} {photos.length === 1 ? "foto cadastrada" : "fotos cadastradas"} — privadas: só aparecem
        na vitrine enquanto o motorista estiver listado. Confira se há placa legível, crianças ou conteúdo impróprio e remova se preciso.
      </p>
      {photosRes.error ? (
        <ErrorNote message={photosRes.error} />
      ) : photos.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-navy-700/60 shadow-sm">
          Nenhuma foto de van cadastrada.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map(({ p, url }) => (
            <li key={p.user_id} className="overflow-hidden rounded-2xl bg-white shadow-sm" data-testid="foto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url ? (
                <img src={url} alt={`Van de ${p.full_name}`} loading="lazy" className="h-44 w-full bg-navy-900/5 object-cover" />
              ) : (
                <div className="flex h-44 w-full items-center justify-center bg-navy-900/5 text-xs text-navy-700/50">sem acesso à imagem</div>
              )}
              <div className="p-3">
                <p className="font-semibold text-navy-900">{p.full_name}</p>
                <p className="text-xs text-navy-700/60">{p.email ?? "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={p.visible_on_marketplace ? "green" : p.marketplace_listed ? "amber" : "gray"}>
                    {p.visible_on_marketplace ? "Na vitrine" : p.marketplace_listed ? "Ligado, oculto" : "Fora da vitrine"}
                  </Badge>
                  <span className="text-xs text-navy-700/60">enviada {fmtDateTime(p.photo_at)}</span>
                </div>
                <form action={removeVanPhotoAction.bind(null, p.user_id)} className="mt-2">
                  <button className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">
                    Remover foto
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 mt-10 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy-900">IPs com mais buscas</h3>
        <div className="flex gap-2" role="group" aria-label="Período">
          {([7, 30] as const).map((d) => (
            <Link
              key={d}
              href={`/admin/moderacao?dias=${d}`}
              prefetch={false}
              aria-current={d === days ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                d === days ? "bg-navy-900 text-white" : "bg-white text-navy-900 shadow-sm"
              }`}
            >
              {d} dias
            </Link>
          ))}
        </div>
      </div>
      <p className="mb-3 text-sm text-navy-700/70" data-testid="resumo-ips">
        {totalPeriod > 0
          ? `${totalPeriod} buscas no período, ${totalWithIp} com IP registrado.`
          : "Nenhuma busca com IP registrado no período."}{" "}
        O IP é guardado por 30 dias e depois apagado (a busca em si permanece, sem IP). Top 20.
      </p>
      {ipsRes.error ? (
        <ErrorNote message={ipsRes.error} />
      ) : (
        <AdminTable head={["IP", "Buscas", "% das buscas com IP", "Primeira", "Última"]} empty="Nenhuma busca com IP no período.">
          {ips.map((r) => (
            <tr key={r.ip}>
              <Td className="font-mono text-sm text-navy-900">{r.ip}</Td>
              <Td className="font-semibold text-navy-900">{r.searches}</Td>
              <Td>{r.total_with_ip > 0 ? `${Math.round((r.searches / r.total_with_ip) * 100)}%` : "—"}</Td>
              <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(r.first_at)}</Td>
              <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(r.last_at)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
      <Panel title="Como usar">
        <p className="text-sm text-navy-700/70">
          Um IP com volume muito acima dos demais (ou buscas em rajada) pode ser raspagem do telefone
          dos motoristas. A decisão de agir é manual — não existe bloqueio automático. IPs de rede
          compartilhada (escola, operadora) podem somar vários usuários.
        </p>
      </Panel>
    </>
  );
}
