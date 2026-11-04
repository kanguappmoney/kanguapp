import Link from "next/link";
import {
  ADMIN_PAGE_SIZE,
  SHIFT_LABEL,
  fmtDateTime,
  listSubmissions,
  pageParam,
  type SubmissionStatus,
} from "@/lib/admin";
import { AdminTable, Badge, ErrorNote, Pager, Td } from "@/components/admin/AdminUi";

const STATUS = {
  pending: { label: "Pendente", tone: "amber" },
  approved: { label: "Aprovado", tone: "green" },
  rejected: { label: "Rejeitado", tone: "red" },
} as const;

const FILTERS: { key: SubmissionStatus | null; label: string }[] = [
  { key: null, label: "Todos" },
  { key: "pending", label: "Pendentes" },
  { key: "approved", label: "Aprovados" },
  { key: "rejected", label: "Rejeitados" },
];

type SP = Promise<Record<string, string | string[] | undefined>>;

// Fila de captação de TODOS os motoristas — SOMENTE LEITURA. Aprovar/recusar segue sendo do
// motorista dono (approve_capture/reject_capture checam o dono no banco); aqui não há botão.
export default async function AdminCaptacaoPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status: SubmissionStatus | null = raw === "pending" || raw === "approved" || raw === "rejected" ? raw : null;
  const page = pageParam(sp.pagina);

  const { rows, error } = await listSubmissions(status, page);
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const base = status ? `/admin/captacao?status=${status}` : "/admin/captacao";

  return (
    <>
      <h2 className="font-display text-xl text-navy-900">Fila de captação</h2>
      <p className="mt-1 text-sm text-navy-700/70">
        Pedidos de todos os motoristas. Somente leitura — quem aprova ou recusa é o motorista.
      </p>
      <div className="mb-4 mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.key ? `/admin/captacao?status=${f.key}` : "/admin/captacao"}
            prefetch={false}
            aria-current={f.key === status ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              f.key === status ? "bg-navy-900 text-white" : "bg-white text-navy-900 shadow-sm"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <p className="mb-3 text-sm text-navy-700/70" data-testid="resumo">
        {total} {total === 1 ? "pedido" : "pedidos"}
      </p>
      {error ? (
        <ErrorNote message={error} />
      ) : (
        <>
          <AdminTable
            head={["Recebido", "Motorista", "Criança", "Escola · turno", "Responsável", "Origem", "Status", "Revisado"]}
            empty="Nenhum pedido neste filtro."
          >
            {rows.map((s) => {
              const st = STATUS[s.status];
              return (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(s.created_at)}</Td>
                  <Td className="font-semibold text-navy-900">{s.driver_name}</Td>
                  <Td>{s.child_name}</Td>
                  <Td>
                    {s.school ?? "—"}
                    {s.shift && <span className="text-navy-700/60"> · {SHIFT_LABEL[s.shift]}</span>}
                  </Td>
                  <Td>
                    <p>{s.guardian_name}</p>
                    <p className="text-xs text-navy-700/60">{s.guardian_email ?? "—"}</p>
                  </Td>
                  <Td>
                    <Badge tone={s.link_kind === "generic" ? "amber" : "gray"}>
                      {s.link_kind === "generic" ? "Vitrine" : "Link do motorista"}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(s.reviewed_at)}</Td>
                </tr>
              );
            })}
          </AdminTable>
          <Pager base={base} page={page} pages={pages} />
        </>
      )}
    </>
  );
}
