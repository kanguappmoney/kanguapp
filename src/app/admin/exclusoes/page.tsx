import { fmtDateTime, listErasureLedger, listErasureRequests } from "@/lib/admin";
import { decideErasureAction } from "@/lib/actions/erasure";
import { AdminTable, Badge, ErrorNote, Td } from "@/components/admin/AdminUi";

const REASON: Record<string, string> = {
  retention_30d: "Prazo de 30 dias",
  subject_request: "Pedido do responsável",
  admin: "Admin",
};

// Pedidos de exclusão dos responsáveis + registro do que já foi apagado (só ids, sem dado pessoal).
export default async function AdminExclusoesPage() {
  const [reqs, ledger] = await Promise.all([listErasureRequests(), listErasureLedger()]);

  return (
    <>
      <h2 className="font-display text-xl text-navy-900">Exclusões</h2>
      <p className="mt-1 text-sm text-navy-700/70">
        Pedido procedente apaga na hora os dados da criança (faturas e evidências de aceite ficam retidas). Cada
        exclusão vira uma linha no registro abaixo.
      </p>

      <h3 className="mb-2 mt-6 font-display text-lg text-navy-900">Pedidos</h3>
      {reqs.error ? (
        <ErrorNote message={reqs.error} />
      ) : (
        <AdminTable head={["Pedido em", "Criança (id)", "Motivo informado", "Situação", "Decisão"]} empty="Nenhum pedido.">
          {reqs.rows.map((r) => (
            <tr key={r.id}>
              <Td>{fmtDateTime(r.created_at)}</Td>
              <Td className="font-mono text-xs">{r.student_id.slice(0, 8)}</Td>
              <Td>{r.note ?? "—"}</Td>
              <Td>
                <Badge tone={r.status === "pending" ? "amber" : r.status === "granted" ? "green" : "gray"}>
                  {r.status === "pending" ? "Pendente" : r.status === "granted" ? "Apagado" : "Negado"}
                </Badge>
              </Td>
              <Td>
                {r.status === "pending" ? (
                  <form className="flex flex-wrap items-center gap-2">
                    <input name="note" placeholder="Observação (opcional)" className="rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm" />
                    <button formAction={decideErasureAction.bind(null, r.id, true)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">
                      Apagar
                    </button>
                    <button formAction={decideErasureAction.bind(null, r.id, false)} className="rounded-lg border border-navy-900/20 px-3 py-1.5 text-sm font-semibold text-navy-900">
                      Negar
                    </button>
                  </form>
                ) : (
                  <span className="text-navy-700/70">{r.decision_note ?? "—"}</span>
                )}
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}

      <h3 className="mb-2 mt-10 font-display text-lg text-navy-900">Registro de exclusões</h3>
      {ledger.error ? (
        <ErrorNote message={ledger.error} />
      ) : (
        <AdminTable head={["Quando", "Criança (id)", "Motorista (id)", "Motivo"]} empty="Nada apagado ainda.">
          {ledger.rows.map((l) => (
            <tr key={l.id}>
              <Td>{fmtDateTime(l.executed_at)}</Td>
              <Td className="font-mono text-xs">{l.student_id}</Td>
              <Td className="font-mono text-xs">{l.driver_id.slice(0, 8)}</Td>
              <Td>{REASON[l.reason] ?? l.reason}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </>
  );
}
