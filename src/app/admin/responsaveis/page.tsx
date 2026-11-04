import { listGuardians, fmtDateTime } from "@/lib/admin";
import { AdminTable, Badge, ErrorNote, Td } from "@/components/admin/AdminUi";

export default async function AdminResponsaveisPage() {
  const { rows, error } = await listGuardians();
  return (
    <>
      <h2 className="font-display text-xl text-navy-900">Responsáveis</h2>
      <p className="mb-4 mt-1 text-sm text-navy-700/70" data-testid="resumo">
        {rows.length} cadastrados
      </p>
      {error ? (
        <ErrorNote message={error} />
      ) : (
        <AdminTable
          head={["Responsável", "Telefone", "Alunos vinculados", "Pedidos pendentes", "Termos", "Cadastro"]}
          empty="Nenhum responsável cadastrado."
        >
          {rows.map((g) => (
            <tr key={g.user_id}>
              <Td>
                <p className="font-semibold text-navy-900">{g.full_name}</p>
                <p className="text-xs text-navy-700/60">{g.email ?? "—"}</p>
              </Td>
              <Td>{g.phone ?? "—"}</Td>
              <Td>{g.linked_students}</Td>
              <Td>
                {g.pending_requests > 0 ? <Badge tone="amber">{g.pending_requests}</Badge> : "0"}
              </Td>
              <Td className="whitespace-nowrap text-xs text-navy-700/70">
                {g.terms_accepted_at ? fmtDateTime(g.terms_accepted_at) : <Badge tone="red">Não aceitou</Badge>}
              </Td>
              <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(g.created_at)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </>
  );
}
