import { AutoRefresh } from "@/components/AutoRefresh";
import { fmtDateTime, listTrials } from "@/lib/admin";
import { AdminTable, Badge, ErrorNote, Td } from "@/components/admin/AdminUi";

// Motoristas em TRIAL, do mais antigo ao mais novo — apoio à decisão MANUAL de cobrança
// (a assinatura é cobrada fora do app no piloto). O tempo conta desde o CADASTRO: o banco
// não guarda o histórico de mudança de assinatura (ver migration 042).
export default async function AdminAssinaturasPage() {
  const { rows, error } = await listTrials();
  const old = rows.filter((r) => r.days_as_trial >= 30).length;

  return (
    <>
      <AutoRefresh seconds={60} />
      <h2 className="font-display text-xl text-navy-900">Assinaturas a acompanhar</h2>
      <p className="mb-1 mt-1 text-sm text-navy-700/70" data-testid="resumo">
        {rows.length} {rows.length === 1 ? "motorista em trial" : "motoristas em trial"} · {old} há 30 dias ou mais
      </p>
      <p className="mb-4 text-xs text-navy-700/60">
        Ordenados por quem está há mais tempo sem virar ativo. O tempo conta desde o cadastro (o app não
        guarda a data em que o trial começou) e a cobrança é feita fora do app.
      </p>
      {error ? (
        <ErrorNote message={error} />
      ) : (
        <AdminTable
          head={["Motorista", "Em trial há", "Perfil", "Alunos ativos", "Na vitrine", "Cadastro"]}
          empty="Nenhum motorista em trial."
        >
          {rows.map((r) => (
            <tr key={r.user_id}>
              <Td>
                <p className="font-semibold text-navy-900">{r.full_name}</p>
                <p className="text-xs text-navy-700/60">{r.email ?? "—"}</p>
                {r.phone && <p className="text-xs text-navy-700/60">{r.phone}</p>}
              </Td>
              <Td>
                <Badge tone={r.days_as_trial >= 30 ? "red" : r.days_as_trial >= 14 ? "amber" : "gray"}>
                  {r.days_as_trial} {r.days_as_trial === 1 ? "dia" : "dias"}
                </Badge>
              </Td>
              <Td>
                <Badge tone={r.profile_complete ? "green" : "red"}>
                  {r.profile_complete ? "Completo" : "Incompleto"}
                </Badge>
              </Td>
              <Td>{r.active_students}</Td>
              <Td>
                <Badge tone={r.visible_on_marketplace ? "green" : "gray"}>
                  {r.visible_on_marketplace ? "Aparece" : "Oculto"}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-xs text-navy-700/70">{fmtDateTime(r.created_at)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </>
  );
}
