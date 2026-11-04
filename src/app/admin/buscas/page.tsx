import { ADMIN_PAGE_SIZE, SHIFT_LABEL, fmtDateTime, listSearchLog, pageParam } from "@/lib/admin";
import { AdminTable, ErrorNote, Pager, Td } from "@/components/admin/AdminUi";

type SP = Promise<Record<string, string | string[] | undefined>>;

// Log de buscas da vitrine: só os filtros usados + a hora (sem IP, sem quem buscou).
export default async function AdminBuscasPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = pageParam(sp.pagina);
  const { rows, error } = await listSearchLog(page);
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  return (
    <>
      <h2 className="font-display text-xl text-navy-900">Buscas no marketplace</h2>
      <p className="mb-4 mt-1 text-sm text-navy-700/70" data-testid="resumo">
        {total} {total === 1 ? "busca registrada" : "buscas registradas"} · uma linha por busca
        nova em /buscar (trocar de página não conta); “—” = sem aquele filtro
      </p>
      {error ? (
        <ErrorNote message={error} />
      ) : (
        <>
          <AdminTable head={["Quando", "Cidade", "Bairro", "Escola", "Idade", "Turno"]} empty="Nenhuma busca registrada ainda.">
            {rows.map((l, i) => (
              <tr key={`${l.created_at}-${i}`}>
                <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(l.created_at)}</Td>
                <Td>{l.city ?? "—"}</Td>
                <Td>{l.neighborhood ?? "—"}</Td>
                <Td>{l.school ?? "—"}</Td>
                <Td>{l.child_age ?? "—"}</Td>
                <Td>{l.shift ? SHIFT_LABEL[l.shift] : "—"}</Td>
              </tr>
            ))}
          </AdminTable>
          <Pager base="/admin/buscas" page={page} pages={pages} />
        </>
      )}
    </>
  );
}
